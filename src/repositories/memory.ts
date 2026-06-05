import { randomUUID } from "node:crypto";
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

export class MemoryRepository
  implements EmployeeRepository, AttendanceRepository, OtRepository, ScheduleRepository, AuditRepository, UsageRepository {
  employees = new Map<string, Employee>();
  sessions = new Map<string, AttendanceSession>();
  otRequests = new Map<string, OtRequest>();
  availability = new Map<string, WeeklyAvailability>();
  drafts = new Map<string, ScheduleDraft>();
  auditLogs: AuditLogInput[] = [];
  usageEvents: Array<{
    actorDiscordUserId: string;
    feature: string;
    creditCost: number;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }> = [];
  shiftTasks = new Map<string, import("../domain").ShiftTask>();

  async createPending(input: EmployeeCreateInput): Promise<Employee> {
    const existing = [...this.employees.values()].find((employee) => employee.discordUserId === input.discordUserId);
    const now = new Date();
    const employee: Employee = {
      id: existing?.id ?? randomUUID(),
      discordUserId: input.discordUserId,
      name: input.name,
      email: input.email,
      team: input.team,
      managerDiscordUserId: input.managerDiscordUserId,
      role: input.role ?? "EMPLOYEE",
      status: existing?.status ?? "PENDING_APPROVAL",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.employees.set(employee.id, employee);
    return employee;
  }

  async findById(id: string): Promise<Employee | null> {
    return this.employees.get(id) ?? null;
  }

  async findByDiscordId(discordUserId: string): Promise<Employee | null> {
    return [...this.employees.values()].find((employee) => employee.discordUserId === discordUserId) ?? null;
  }

  async findByManagerDiscordId(managerDiscordUserId: string): Promise<Employee[]> {
    return [...this.employees.values()].filter((employee) => employee.managerDiscordUserId === managerDiscordUserId);
  }

  async listApproved(): Promise<Employee[]> {
    return [...this.employees.values()].filter((employee) => employee.status === "APPROVED");
  }

  async approve(employeeId: string): Promise<Employee> {
    const employee = this.mustEmployee(employeeId);
    const updated = { ...employee, status: "APPROVED" as const, updatedAt: new Date() };
    this.employees.set(employeeId, updated);
    return updated;
  }

  async reject(employeeId: string): Promise<Employee> {
    const employee = this.mustEmployee(employeeId);
    const updated = { ...employee, status: "REJECTED" as const, updatedAt: new Date() };
    this.employees.set(employeeId, updated);
    return updated;
  }

  async delete(employeeId: string): Promise<void> {
    const employee = this.employees.get(employeeId);
    if (employee) {
      this.employees.set(employeeId, { ...employee, status: "INACTIVE", updatedAt: new Date() });
    }
  }

  async createSession(
    employeeId: string,
    checkinAt: Date,
    context?: { channelId?: string | null; topic?: string | null; sourceMessageTs?: string | null }
  ): Promise<AttendanceSession> {
    const now = new Date();
    const session: AttendanceSession = {
      id: randomUUID(),
      employeeId,
      checkinAt,
      checkoutAt: null,
      durationMinutes: null,
      status: "OPEN",
      channelId: context?.channelId ?? null,
      topic: context?.topic ?? null,
      sourceMessageTs: context?.sourceMessageTs ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findOpenSession(employeeId: string): Promise<AttendanceSession | null> {
    const sessions = Array.from(this.sessions.values())
      .filter((s) => s.employeeId === employeeId && s.status === "OPEN")
      .sort((a, b) => b.checkinAt.getTime() - a.checkinAt.getTime());
    return sessions[0] || null;
  }

  async getLastClosedSession(employeeId: string): Promise<AttendanceSession | null> {
    const sessions = Array.from(this.sessions.values())
      .filter((s) => s.employeeId === employeeId && s.status === "CLOSED")
      .sort((a, b) => b.checkinAt.getTime() - a.checkinAt.getTime());
    return sessions[0] || null;
  }

  async closeSession(sessionId: string, checkoutAt: Date, durationMinutes: number): Promise<AttendanceSession> {
    const session = this.mustSession(sessionId);
    const updated = {
      ...session,
      checkoutAt,
      durationMinutes,
      status: "CLOSED" as const,
      updatedAt: new Date()
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async listSessions(employeeId: string, from: Date, to: Date): Promise<AttendanceSession[]> {
    return [...this.sessions.values()].filter(
      (session) =>
        session.employeeId === employeeId && session.checkinAt.getTime() >= from.getTime() && session.checkinAt < to
    );
  }

  async summarize(from: Date, to: Date, employeeIds?: string[]): Promise<AttendanceSummaryRow[]> {
    const ids = new Set(employeeIds ?? [...this.employees.keys()]);
    return [...ids].map((employeeId) => {
      const employee = this.mustEmployee(employeeId);
      const sessions = [...this.sessions.values()].filter(
        (session) =>
          session.employeeId === employeeId &&
          session.checkinAt.getTime() >= from.getTime() &&
          session.checkinAt.getTime() < to.getTime()
      );
      const ots = [...this.otRequests.values()].filter(
        (ot) =>
          ot.employeeId === employeeId && ot.startAt.getTime() >= from.getTime() && ot.startAt.getTime() < to.getTime()
      );
      return {
        employeeId,
        employeeName: employee.name,
        team: employee.team,
        workMinutes: sessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0),
        approvedOtMinutes: ots
          .filter((ot) => ot.status === "APPROVED")
          .reduce((sum, ot) => sum + minutesBetween(ot.startAt, ot.endAt), 0),
        pendingOtMinutes: ots
          .filter((ot) => ot.status === "PENDING_MANAGER" || ot.status === "PENDING_BOSS")
          .reduce((sum, ot) => sum + minutesBetween(ot.startAt, ot.endAt), 0),
        missingCheckoutCount: sessions.filter((session) => session.status === "MISSING_CHECKOUT").length
      };
    });
  }

  async createTasks(sessionId: string, descriptions: string[]): Promise<void> {
    for (const desc of descriptions) {
      const task: import("../domain").ShiftTask = {
        id: randomUUID(),
        sessionId,
        description: desc,
        status: "NOT_YET",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.shiftTasks.set(task.id, task);
    }
  }

  async getTasksForSession(sessionId: string): Promise<import("../domain").ShiftTask[]> {
    return [...this.shiftTasks.values()]
      .filter((t) => t.sessionId === sessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async updateTaskStatuses(taskIds: string[], status: import("../domain").TaskStatus): Promise<void> {
    for (const id of taskIds) {
      const task = this.shiftTasks.get(id);
      if (task) {
        task.status = status;
        task.updatedAt = new Date();
      }
    }
  }

  async createOtRequest(input: OtCreateInput): Promise<OtRequest> {
    const now = new Date();
    const request: OtRequest = {
      id: randomUUID(),
      employeeId: input.employeeId,
      sessionId: input.sessionId,
      startAt: input.startAt,
      endAt: input.endAt,
      reason: input.reason,
      managerStatus: "PENDING",
      bossStatus: "PENDING",
      status: "PENDING_MANAGER",
      managerApprovedBy: null,
      bossApprovedBy: null,
      createdAt: now,
      updatedAt: now
    };
    this.otRequests.set(request.id, request);
    return request;
  }

  async findOtRequestById(id: string): Promise<OtRequest | null> {
    return this.otRequests.get(id) ?? null;
  }

  async managerApprove(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      managerStatus: "APPROVED",
      status: "PENDING_BOSS",
      managerApprovedBy: approverDiscordUserId
    });
  }

  async managerReject(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      managerStatus: "REJECTED",
      status: "REJECTED",
      managerApprovedBy: approverDiscordUserId
    });
  }

  async bossApprove(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      bossStatus: "APPROVED",
      status: "APPROVED",
      bossApprovedBy: approverDiscordUserId
    });
  }

  async bossReject(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    return this.updateOt(id, {
      bossStatus: "REJECTED",
      status: "REJECTED",
      bossApprovedBy: approverDiscordUserId
    });
  }

  async upsertAvailability(input: {
    employeeId: string;
    weekStart: string;
    availableSlots: WeeklyAvailability["availableSlots"];
    unavailableSlots: WeeklyAvailability["unavailableSlots"];
    notes?: string | null;
  }): Promise<WeeklyAvailability> {
    const key = `${input.employeeId}:${input.weekStart}`;
    const existing = this.availability.get(key);
    const now = new Date();
    const availability: WeeklyAvailability = {
      id: existing?.id ?? randomUUID(),
      employeeId: input.employeeId,
      weekStart: input.weekStart,
      availableSlots: input.availableSlots,
      unavailableSlots: input.unavailableSlots,
      notes: input.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.availability.set(key, availability);
    return availability;
  }

  async listAvailability(weekStart: string): Promise<WeeklyAvailability[]> {
    return [...this.availability.values()].filter((availability) => availability.weekStart === weekStart);
  }

  async listAvailabilityByEmployee(employeeId: string): Promise<WeeklyAvailability[]> {
    return [...this.availability.values()].filter((availability) => availability.employeeId === employeeId);
  }

  async clearAvailability(id: string): Promise<void> {
    const availability = this.availability.get(id);
    if (availability) {
      availability.availableSlots = [];
      availability.unavailableSlots = [];
      availability.updatedAt = new Date();
    }
  }

  async createDraft(weekStart: string, events: ScheduleEventDraft[]): Promise<ScheduleDraft> {
    const now = new Date();
    const draft: ScheduleDraft = {
      id: randomUUID(),
      weekStart,
      aiOutput: events,
      status: "DRAFT",
      approvedBy: null,
      googleCalendarEventIds: [],
      createdAt: now,
      updatedAt: now
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  async findDraft(id: string): Promise<ScheduleDraft | null> {
    return this.drafts.get(id) ?? null;
  }

  async findDraftByWeekStart(weekStart: string): Promise<ScheduleDraft | null> {
    const matching = [...this.drafts.values()].filter((d) => d.weekStart === weekStart);
    if (matching.length === 0) return null;
    const published = matching.find((d) => d.status === "PUBLISHED");
    if (published) return published;
    const approved = matching.find((d) => d.status === "APPROVED");
    if (approved) return approved;
    return matching[0];
  }

  async approveDraft(id: string, approverDiscordUserId: string): Promise<ScheduleDraft> {
    const draft = this.mustDraft(id);
    const updated = { ...draft, status: "APPROVED" as const, approvedBy: approverDiscordUserId, updatedAt: new Date() };
    this.drafts.set(id, updated);
    return updated;
  }

  async markPublished(id: string, googleCalendarEventIds: string[]): Promise<ScheduleDraft> {
    const draft = this.mustDraft(id);
    const updated = {
      ...draft,
      status: "PUBLISHED" as const,
      googleCalendarEventIds,
      updatedAt: new Date()
    };
    this.drafts.set(id, updated);
    return updated;
  }

  async record(input: AuditLogInput): Promise<void> {
    this.auditLogs.push(input);
  }

  async recordUsage(input: {
    actorDiscordUserId: string;
    feature: string;
    creditCost: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.usageEvents.push({ ...input, createdAt: new Date() });
  }

  async summarizeUsage(monthStart: Date, monthEnd: Date): Promise<UsageSummaryRow[]> {
    const grouped = new Map<string, UsageSummaryRow>();
    for (const event of this.usageEvents) {
      if (event.createdAt < monthStart || event.createdAt >= monthEnd) continue;
      const current = grouped.get(event.feature) ?? {
        feature: event.feature,
        requestCount: 0,
        creditCost: 0
      };
      current.requestCount += 1;
      current.creditCost += event.creditCost;
      grouped.set(event.feature, current);
    }
    return [...grouped.values()].sort((a, b) => a.feature.localeCompare(b.feature));
  }

  private mustEmployee(id: string): Employee {
    const employee = this.employees.get(id);
    if (!employee) throw new Error(`Missing employee ${id}`);
    return employee;
  }

  private mustSession(id: string): AttendanceSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Missing attendance session ${id}`);
    return session;
  }

  private mustDraft(id: string): ScheduleDraft {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error(`Missing schedule draft ${id}`);
    return draft;
  }

  private updateOt(id: string, patch: Partial<OtRequest>): OtRequest {
    const current = this.otRequests.get(id);
    if (!current) throw new Error(`Missing OT request ${id}`);
    const updated = { ...current, ...patch, updatedAt: new Date() };
    this.otRequests.set(id, updated);
    return updated;
  }
}
