import { randomUUID } from "node:crypto";
import { google, type sheets_v4 } from "googleapis";
import type {
  AttendanceRepository,
  AuditRepository,
  EmployeeCreateInput,
  EmployeeRepository,
  OtCreateInput,
  OtRepository,
  ScheduleRepository,
  UsageRepository
} from "./types";
import type {
  AttendanceSession,
  AttendanceSummaryRow,
  AuditLogInput,
  Employee,
  OtRequest,
  ScheduleDraft,
  ScheduleEventDraft,
  UsageSummaryRow,
  WeeklyAvailability
} from "../domain";
import { minutesBetween } from "../services/clock";

const TABLES = {
  employees: [
    "id",
    "discord_user_id",
    "name",
    "email",
    "team",
    "manager_discord_user_id",
    "role",
    "status",
    "created_at",
    "updated_at"
  ],
  attendance_sessions: [
    "id",
    "employee_id",
    "checkin_at",
    "checkout_at",
    "duration_minutes",
    "status",
    "channel_id",
    "topic",
    "source_message_ts",
    "created_at",
    "updated_at"
  ],
  ot_requests: [
    "id",
    "employee_id",
    "session_id",
    "start_at",
    "end_at",
    "reason",
    "manager_status",
    "boss_status",
    "status",
    "manager_approved_by",
    "boss_approved_by",
    "created_at",
    "updated_at"
  ],
  weekly_availability: [
    "id",
    "employee_id",
    "week_start",
    "available_slots",
    "unavailable_slots",
    "notes",
    "created_at",
    "updated_at"
  ],
  schedule_drafts: [
    "id",
    "week_start",
    "ai_output",
    "status",
    "approved_by",
    "google_calendar_event_ids",
    "created_at",
    "updated_at"
  ],
  audit_logs: [
    "id",
    "actor_discord_user_id",
    "action",
    "target_type",
    "target_id",
    "old_status",
    "new_status",
    "metadata",
    "created_at"
  ],
  bot_usage_events: ["id", "actor_discord_user_id", "feature", "credit_cost", "metadata", "created_at"],
  shift_tasks: ["id", "session_id", "description", "status", "created_at", "updated_at"]
} as const;

type TableName = keyof typeof TABLES;
type SheetRow = { rowNumber: number; data: Record<string, string> };

export class GoogleSheetsRepository
  implements EmployeeRepository, AttendanceRepository, OtRepository, ScheduleRepository, AuditRepository, UsageRepository {
  private readonly sheets: sheets_v4.Sheets;
  private initialized: Promise<void> | null = null;

  constructor(
    private readonly options: {
      spreadsheetId: string;
      clientEmail: string;
      privateKey: string;
    }
  ) {
    const auth = new google.auth.JWT({
      email: options.clientEmail,
      key: options.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.initializeNow();
    }
    return this.initialized;
  }

  async createPending(input: EmployeeCreateInput): Promise<Employee> {
    await this.initialize();
    const existing = (await this.findEmployeeRowByDiscordId(input.discordUserId))?.data;
    const now = new Date().toISOString();
    const employee = {
      id: existing?.id || randomUUID(),
      discord_user_id: input.discordUserId,
      name: input.name,
      email: input.email,
      team: input.team,
      manager_discord_user_id: input.managerDiscordUserId,
      role: input.role ?? "EMPLOYEE",
      status: existing?.status || "PENDING_APPROVAL",
      created_at: existing?.created_at || now,
      updated_at: now
    };

    if (existing) {
      await this.updateById("employees", employee.id, employee);
    } else {
      await this.appendObject("employees", employee);
    }
    return employeeFromData(employee);
  }

  async findById(id: string): Promise<Employee | null> {
    await this.initialize();
    const row = await this.findRowById("employees", id);
    return row ? employeeFromData(row.data) : null;
  }

  async findByDiscordId(discordUserId: string): Promise<Employee | null> {
    await this.initialize();
    const row = await this.findEmployeeRowByDiscordId(discordUserId);
    return row ? employeeFromData(row.data) : null;
  }

  async findByManagerDiscordId(managerDiscordUserId: string): Promise<Employee[]> {
    await this.initialize();
    return (await this.readAll("employees"))
      .filter((row) => row.data.manager_discord_user_id === managerDiscordUserId)
      .map((row) => employeeFromData(row.data));
  }

  async listApproved(): Promise<Employee[]> {
    await this.initialize();
    return (await this.readAll("employees"))
      .filter((row) => row.data.status === "APPROVED")
      .map((row) => employeeFromData(row.data))
      .sort((a, b) => `${a.team}:${a.name}`.localeCompare(`${b.team}:${b.name}`));
  }

  async approve(employeeId: string): Promise<Employee> {
    return this.updateEmployeeStatus(employeeId, "APPROVED");
  }

  async reject(employeeId: string): Promise<Employee> {
    return this.updateEmployeeStatus(employeeId, "REJECTED");
  }

  async delete(employeeId: string): Promise<void> {
    await this.updateEmployeeStatus(employeeId, "INACTIVE");
  }

  async createSession(
    employeeId: string,
    checkinAt: Date,
    context?: { channelId?: string | null; topic?: string | null; sourceMessageTs?: string | null }
  ): Promise<AttendanceSession> {
    await this.initialize();
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      employee_id: employeeId,
      checkin_at: checkinAt.toISOString(),
      checkout_at: "",
      duration_minutes: "",
      status: "OPEN",
      channel_id: context?.channelId ?? "",
      topic: context?.topic ?? "",
      source_message_ts: context?.sourceMessageTs ?? "",
      created_at: now,
      updated_at: now
    };
    await this.appendObject("attendance_sessions", row);
    return sessionFromData(row);
  }

  async findOpenSession(employeeId: string): Promise<AttendanceSession | null> {
    await this.initialize();
    const rows = (await this.readAll("attendance_sessions"))
      .filter((row) => row.data.employee_id === employeeId && row.data.status === "OPEN")
      .sort((a, b) => dateMs(b.data.checkin_at) - dateMs(a.data.checkin_at));
    return rows[0] ? sessionFromData(rows[0].data) : null;
  }

  async closeSession(sessionId: string, checkoutAt: Date, durationMinutes: number): Promise<AttendanceSession> {
    await this.initialize();
    const row = await this.findRowById("attendance_sessions", sessionId);
    if (!row) throw new Error(`Missing attendance session ${sessionId}`);
    const updated = {
      ...row.data,
      checkout_at: checkoutAt.toISOString(),
      duration_minutes: String(durationMinutes),
      status: "CLOSED",
      updated_at: new Date().toISOString()
    };
    await this.updateById("attendance_sessions", sessionId, updated);
    return sessionFromData(updated);
  }

  async listSessions(employeeId: string, from: Date, to: Date): Promise<AttendanceSession[]> {
    await this.initialize();
    return (await this.readAll("attendance_sessions"))
      .filter((row) => {
        const t = dateMs(row.data.checkin_at);
        return row.data.employee_id === employeeId && t >= from.getTime() && t < to.getTime();
      })
      .map((row) => sessionFromData(row.data))
      .sort((a, b) => a.checkinAt.getTime() - b.checkinAt.getTime());
  }

  async summarize(from: Date, to: Date, employeeIds?: string[]): Promise<AttendanceSummaryRow[]> {
    await this.initialize();
    const employees = (await this.readAll("employees")).map((row) => employeeFromData(row.data));
    const sessions = (await this.readAll("attendance_sessions")).map((row) => sessionFromData(row.data));
    const ots = (await this.readAll("ot_requests")).map((row) => otFromData(row.data));
    const ids = new Set(employeeIds ?? employees.map((employee) => employee.id));

    return [...ids].map((employeeId) => {
      const employee = employees.find((item) => item.id === employeeId);
      const employeeSessions = sessions.filter(
        (session) =>
          session.employeeId === employeeId &&
          session.checkinAt.getTime() >= from.getTime() &&
          session.checkinAt.getTime() < to.getTime()
      );
      const employeeOt = ots.filter(
        (ot) => ot.employeeId === employeeId && ot.startAt.getTime() >= from.getTime() && ot.startAt.getTime() < to.getTime()
      );
      return {
        employeeId,
        employeeName: employee?.name ?? employeeId,
        team: employee?.team ?? "",
        workMinutes: employeeSessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0),
        approvedOtMinutes: employeeOt
          .filter((ot) => ot.status === "APPROVED")
          .reduce((sum, ot) => sum + minutesBetween(ot.startAt, ot.endAt), 0),
        pendingOtMinutes: employeeOt
          .filter((ot) => ot.status === "PENDING_MANAGER" || ot.status === "PENDING_BOSS")
          .reduce((sum, ot) => sum + minutesBetween(ot.startAt, ot.endAt), 0),
        missingCheckoutCount: employeeSessions.filter((session) => session.status === "MISSING_CHECKOUT").length
      };
    });
  }

  async createTasks(sessionId: string, descriptions: string[]): Promise<void> {
    await this.initialize();
    const now = new Date().toISOString();
    for (const desc of descriptions) {
      const row = {
        id: randomUUID(),
        session_id: sessionId,
        description: desc,
        status: "NOT_YET",
        created_at: now,
        updated_at: now
      };
      await this.appendObject("shift_tasks", row);
    }
  }

  async getTasksForSession(sessionId: string): Promise<import("../domain").ShiftTask[]> {
    await this.initialize();
    return (await this.readAll("shift_tasks"))
      .filter((row) => row.data.session_id === sessionId)
      .map((row) => taskFromData(row.data))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async updateTaskStatuses(taskIds: string[], status: import("../domain").TaskStatus): Promise<void> {
    await this.initialize();
    const now = new Date().toISOString();
    for (const id of taskIds) {
      const row = await this.findRowById("shift_tasks", id);
      if (row) {
        await this.updateById("shift_tasks", id, {
          ...row.data,
          status,
          updated_at: now
        });
      }
    }
  }

  async createOtRequest(input: OtCreateInput): Promise<OtRequest> {
    await this.initialize();
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      employee_id: input.employeeId,
      session_id: input.sessionId ?? "",
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      reason: input.reason,
      manager_status: "PENDING",
      boss_status: "PENDING",
      status: "PENDING_MANAGER",
      manager_approved_by: "",
      boss_approved_by: "",
      created_at: now,
      updated_at: now
    };
    await this.appendObject("ot_requests", row);
    return otFromData(row);
  }

  async findOtRequestById(id: string): Promise<OtRequest | null> {
    await this.initialize();
    const row = await this.findRowById("ot_requests", id);
    return row ? otFromData(row.data) : null;
  }

  async managerApprove(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      manager_status: "APPROVED",
      status: "PENDING_BOSS",
      manager_approved_by: approverDiscordUserId
    });
  }

  async managerReject(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      manager_status: "REJECTED",
      status: "REJECTED",
      manager_approved_by: approverDiscordUserId
    });
  }

  async bossApprove(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      boss_status: "APPROVED",
      status: "APPROVED",
      boss_approved_by: approverDiscordUserId
    });
  }

  async bossReject(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      boss_status: "REJECTED",
      status: "REJECTED",
      boss_approved_by: approverDiscordUserId
    });
  }

  async upsertAvailability(input: {
    employeeId: string;
    weekStart: string;
    availableSlots: WeeklyAvailability["availableSlots"];
    unavailableSlots: WeeklyAvailability["unavailableSlots"];
    notes?: string | null;
  }): Promise<WeeklyAvailability> {
    await this.initialize();
    const existing = (await this.readAll("weekly_availability")).find(
      (row) => row.data.employee_id === input.employeeId && row.data.week_start === input.weekStart
    );
    const now = new Date().toISOString();
    const row = {
      id: existing?.data.id || randomUUID(),
      employee_id: input.employeeId,
      week_start: input.weekStart,
      available_slots: JSON.stringify(input.availableSlots),
      unavailable_slots: JSON.stringify(input.unavailableSlots),
      notes: input.notes ?? "",
      created_at: existing?.data.created_at || now,
      updated_at: now
    };
    if (existing) {
      await this.updateById("weekly_availability", row.id, row);
    } else {
      await this.appendObject("weekly_availability", row);
    }
    return availabilityFromData(row);
  }

  async listAvailability(weekStart: string): Promise<WeeklyAvailability[]> {
    await this.initialize();
    return (await this.readAll("weekly_availability"))
      .filter((row) => row.data.week_start === weekStart)
      .map((row) => availabilityFromData(row.data));
  }

  async listAvailabilityByEmployee(employeeId: string): Promise<WeeklyAvailability[]> {
    await this.initialize();
    return (await this.readAll("weekly_availability"))
      .filter((row) => row.data.employee_id === employeeId)
      .sort((a, b) => b.data.week_start.localeCompare(a.data.week_start))
      .map((row) => availabilityFromData(row.data));
  }

  async clearAvailability(id: string): Promise<void> {
    await this.initialize();
    const row = await this.findRowById("weekly_availability", id);
    if (!row) throw new Error(`Missing availability ${id}`);
    const now = new Date().toISOString();
    await this.updateById("weekly_availability", id, {
      ...row.data,
      available_slots: "[]",
      unavailable_slots: "[]",
      updated_at: now
    });
  }

  async createDraft(weekStart: string, events: ScheduleEventDraft[]): Promise<ScheduleDraft> {
    await this.initialize();
    const now = new Date().toISOString();
    const row = {
      id: randomUUID(),
      week_start: weekStart,
      ai_output: JSON.stringify(events),
      status: "DRAFT",
      approved_by: "",
      google_calendar_event_ids: "[]",
      created_at: now,
      updated_at: now
    };
    await this.appendObject("schedule_drafts", row);
    return draftFromData(row);
  }

  async findDraft(id: string): Promise<ScheduleDraft | null> {
    await this.initialize();
    const row = await this.findRowById("schedule_drafts", id);
    return row ? draftFromData(row.data) : null;
  }

  async findDraftByWeekStart(weekStart: string): Promise<ScheduleDraft | null> {
    await this.initialize();
    const priority = { PUBLISHED: 1, APPROVED: 2, DRAFT: 3, CHANGES_REQUESTED: 4 } as Record<string, number>;
    const rows = (await this.readAll("schedule_drafts"))
      .filter((row) => row.data.week_start === weekStart)
      .sort((a, b) => {
        const statusDiff = (priority[a.data.status] ?? 9) - (priority[b.data.status] ?? 9);
        return statusDiff || dateMs(b.data.created_at) - dateMs(a.data.created_at);
      });
    return rows[0] ? draftFromData(rows[0].data) : null;
  }

  async approveDraft(id: string, approverDiscordUserId: string): Promise<ScheduleDraft> {
    await this.initialize();
    const row = await this.findRowById("schedule_drafts", id);
    if (!row) throw new Error(`Missing schedule draft ${id}`);
    const updated = {
      ...row.data,
      status: "APPROVED",
      approved_by: approverDiscordUserId,
      updated_at: new Date().toISOString()
    };
    await this.updateById("schedule_drafts", id, updated);
    return draftFromData(updated);
  }

  async markPublished(id: string, googleCalendarEventIds: string[]): Promise<ScheduleDraft> {
    await this.initialize();
    const row = await this.findRowById("schedule_drafts", id);
    if (!row) throw new Error(`Missing schedule draft ${id}`);
    const updated = {
      ...row.data,
      status: "PUBLISHED",
      google_calendar_event_ids: JSON.stringify(googleCalendarEventIds),
      updated_at: new Date().toISOString()
    };
    await this.updateById("schedule_drafts", id, updated);
    return draftFromData(updated);
  }

  async record(input: AuditLogInput): Promise<void> {
    await this.initialize();
    await this.appendObject("audit_logs", {
      id: randomUUID(),
      actor_discord_user_id: input.actorDiscordUserId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      old_status: input.oldStatus ?? "",
      new_status: input.newStatus ?? "",
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: new Date().toISOString()
    });
  }

  async recordUsage(input: {
    actorDiscordUserId: string;
    feature: string;
    creditCost: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.initialize();
    await this.appendObject("bot_usage_events", {
      id: randomUUID(),
      actor_discord_user_id: input.actorDiscordUserId,
      feature: input.feature,
      credit_cost: String(input.creditCost),
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: new Date().toISOString()
    });
  }

  async summarizeUsage(monthStart: Date, monthEnd: Date): Promise<UsageSummaryRow[]> {
    await this.initialize();
    const grouped = new Map<string, UsageSummaryRow>();
    for (const row of await this.readAll("bot_usage_events")) {
      const createdAt = dateMs(row.data.created_at);
      if (createdAt < monthStart.getTime() || createdAt >= monthEnd.getTime()) continue;
      const current = grouped.get(row.data.feature) ?? {
        feature: row.data.feature,
        requestCount: 0,
        creditCost: 0
      };
      current.requestCount += 1;
      current.creditCost += numberOrZero(row.data.credit_cost);
      grouped.set(row.data.feature, current);
    }
    return [...grouped.values()].sort((a, b) => a.feature.localeCompare(b.feature));
  }

  private async initializeNow(): Promise<void> {
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.options.spreadsheetId,
      fields: "sheets(properties(title))"
    });
    const existing = new Set(meta.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean) ?? []);
    const requests = Object.keys(TABLES)
      .filter((name) => !existing.has(name))
      .map((name) => ({ addSheet: { properties: { title: name } } }));
    if (requests.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.options.spreadsheetId,
        requestBody: { requests }
      });
    }

    await Promise.all(
      (Object.keys(TABLES) as TableName[]).map((table) =>
        this.sheets.spreadsheets.values.update({
          spreadsheetId: this.options.spreadsheetId,
          range: `${quoteSheet(table)}!A1:${columnLetter(TABLES[table].length)}1`,
          valueInputOption: "RAW",
          requestBody: { values: [[...TABLES[table]]] }
        })
      )
    );
  }

  private async readAll(table: TableName): Promise<SheetRow[]> {
    await this.initialize();
    const headers = [...TABLES[table]];
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.options.spreadsheetId,
      range: `${quoteSheet(table)}!A2:${columnLetter(headers.length)}`
    });
    const values = response.data.values ?? [];
    return values
      .filter((cells) => cells.some((cell) => String(cell ?? "").trim() !== ""))
      .map((cells, index) => ({
        rowNumber: index + 2,
        data: Object.fromEntries(headers.map((header, columnIndex) => [header, String(cells[columnIndex] ?? "")]))
      }));
  }

  private async appendObject(table: TableName, data: Record<string, unknown>): Promise<void> {
    const headers = [...TABLES[table]];
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.options.spreadsheetId,
      range: `${quoteSheet(table)}!A:${columnLetter(headers.length)}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [headers.map((header) => toCell(data[header]))] }
    });
  }

  private async updateById(table: TableName, id: string, data: Record<string, unknown>): Promise<void> {
    const row = await this.findRowById(table, id);
    if (!row) throw new Error(`Missing ${table} row ${id}`);
    const headers = [...TABLES[table]];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.options.spreadsheetId,
      range: `${quoteSheet(table)}!A${row.rowNumber}:${columnLetter(headers.length)}${row.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: { values: [headers.map((header) => toCell(data[header] ?? row.data[header] ?? ""))] }
    });
  }

  private async findRowById(table: TableName, id: string): Promise<SheetRow | null> {
    return (await this.readAll(table)).find((row) => row.data.id === id) ?? null;
  }

  private async findEmployeeRowByDiscordId(discordUserId: string): Promise<SheetRow | null> {
    return (await this.readAll("employees")).find((row) => row.data.discord_user_id === discordUserId) ?? null;
  }

  private async updateEmployeeStatus(employeeId: string, status: string): Promise<Employee> {
    await this.initialize();
    const row = await this.findRowById("employees", employeeId);
    if (!row) throw new Error(`Missing employee ${employeeId}`);
    const updated = { ...row.data, status, updated_at: new Date().toISOString() };
    await this.updateById("employees", employeeId, updated);
    return employeeFromData(updated);
  }

  private async updateOt(id: string, patch: Record<string, string>): Promise<OtRequest> {
    await this.initialize();
    const row = await this.findRowById("ot_requests", id);
    if (!row) throw new Error(`Missing OT request ${id}`);
    const updated = { ...row.data, ...patch, updated_at: new Date().toISOString() };
    await this.updateById("ot_requests", id, updated);
    return otFromData(updated);
  }
}

function employeeFromData(data: Record<string, string>): Employee {
  return {
    id: data.id,
    discordUserId: data.discord_user_id,
    name: data.name,
    email: data.email,
    team: data.team,
    managerDiscordUserId: data.manager_discord_user_id,
    role: (data.role || "EMPLOYEE") as Employee["role"],
    status: (data.status || "PENDING_APPROVAL") as Employee["status"],
    createdAt: dateOrNow(data.created_at),
    updatedAt: dateOrNow(data.updated_at)
  };
}

function sessionFromData(data: Record<string, string>): AttendanceSession {
  return {
    id: data.id,
    employeeId: data.employee_id,
    checkinAt: dateOrNow(data.checkin_at),
    checkoutAt: data.checkout_at ? new Date(data.checkout_at) : null,
    durationMinutes: data.duration_minutes ? numberOrZero(data.duration_minutes) : null,
    status: (data.status || "OPEN") as AttendanceSession["status"],
    channelId: data.channel_id || null,
    topic: data.topic || null,
    sourceMessageTs: data.source_message_ts || null,
    createdAt: dateOrNow(data.created_at),
    updatedAt: dateOrNow(data.updated_at)
  };
}

function otFromData(data: Record<string, string>): OtRequest {
  return {
    id: data.id,
    employeeId: data.employee_id,
    sessionId: data.session_id || null,
    startAt: dateOrNow(data.start_at),
    endAt: dateOrNow(data.end_at),
    reason: data.reason,
    managerStatus: (data.manager_status || "PENDING") as OtRequest["managerStatus"],
    bossStatus: (data.boss_status || "PENDING") as OtRequest["bossStatus"],
    status: (data.status || "PENDING_MANAGER") as OtRequest["status"],
    managerApprovedBy: data.manager_approved_by || null,
    bossApprovedBy: data.boss_approved_by || null,
    createdAt: dateOrNow(data.created_at),
    updatedAt: dateOrNow(data.updated_at)
  };
}

function availabilityFromData(data: Record<string, string>): WeeklyAvailability {
  return {
    id: data.id,
    employeeId: data.employee_id,
    weekStart: data.week_start,
    availableSlots: parseJson(data.available_slots, []),
    unavailableSlots: parseJson(data.unavailable_slots, []),
    notes: data.notes || null,
    createdAt: dateOrNow(data.created_at),
    updatedAt: dateOrNow(data.updated_at)
  };
}

function draftFromData(data: Record<string, string>): ScheduleDraft {
  return {
    id: data.id,
    weekStart: data.week_start,
    aiOutput: parseJson(data.ai_output, []),
    status: (data.status || "DRAFT") as ScheduleDraft["status"],
    approvedBy: data.approved_by || null,
    googleCalendarEventIds: parseJson(data.google_calendar_event_ids, []),
    createdAt: dateOrNow(data.created_at),
    updatedAt: dateOrNow(data.updated_at)
  };
}

function taskFromData(data: Record<string, string>): import("../domain").ShiftTask {
  return {
    id: data.id,
    sessionId: data.session_id,
    description: data.description,
    status: (data.status || "NOT_YET") as import("../domain").TaskStatus,
    createdAt: dateOrNow(data.created_at),
    updatedAt: dateOrNow(data.updated_at)
  };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dateOrNow(value: string | undefined): Date {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dateMs(value: string): number {
  return dateOrNow(value).getTime();
}

function numberOrZero(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function quoteSheet(sheet: string): string {
  return `'${sheet.replace(/'/g, "''")}'`;
}

function columnLetter(index: number): string {
  let result = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
