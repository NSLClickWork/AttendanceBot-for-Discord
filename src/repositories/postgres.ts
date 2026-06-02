import type { QueryResult, QueryResultRow } from "pg";
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
import type { DbPool } from "../db/pool";

function one<T extends QueryResultRow>(result: QueryResult<T>): T {
  if (!result.rows[0]) {
    throw new Error("Expected one row but query returned none.");
  }
  return result.rows[0];
}

function employeeFromRow(row: any): Employee {
  return {
    id: row.id,
    discordUserId: row.discord_user_id,
    name: row.name,
    email: row.email,
    team: row.team,
    managerDiscordUserId: row.manager_discord_user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sessionFromRow(row: any): AttendanceSession {
  return {
    id: row.id,
    employeeId: row.employee_id,
    checkinAt: row.checkin_at,
    checkoutAt: row.checkout_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    channelId: row.channel_id,
    topic: row.topic,
    sourceMessageTs: row.source_message_ts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function otFromRow(row: any): OtRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    sessionId: row.session_id,
    startAt: row.start_at,
    endAt: row.end_at,
    reason: row.reason,
    managerStatus: row.manager_status,
    bossStatus: row.boss_status,
    status: row.status,
    managerApprovedBy: row.manager_approved_by,
    bossApprovedBy: row.boss_approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function availabilityFromRow(row: any): WeeklyAvailability {
  return {
    id: row.id,
    employeeId: row.employee_id,
    weekStart: dateOnly(row.week_start),
    availableSlots: row.available_slots,
    unavailableSlots: row.unavailable_slots,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function draftFromRow(row: any): ScheduleDraft {
  return {
    id: row.id,
    weekStart: dateOnly(row.week_start),
    aiOutput: row.ai_output,
    status: row.status,
    approvedBy: row.approved_by,
    googleCalendarEventIds: row.google_calendar_event_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class PostgresRepository
  implements EmployeeRepository, AttendanceRepository, OtRepository, ScheduleRepository, AuditRepository, UsageRepository {
  constructor(private readonly pool: DbPool) {}

  async createPending(input: EmployeeCreateInput): Promise<Employee> {
    const result = await this.pool.query(
      `INSERT INTO employees (discord_user_id, name, email, team, manager_discord_user_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (discord_user_id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         team = EXCLUDED.team,
         manager_discord_user_id = EXCLUDED.manager_discord_user_id,
         updated_at = now()
       RETURNING *`,
      [input.discordUserId, input.name, input.email, input.team, input.managerDiscordUserId, input.role ?? "EMPLOYEE"]
    );
    return employeeFromRow(one(result));
  }

  async findById(id: string): Promise<Employee | null> {
    const result = await this.pool.query("SELECT * FROM employees WHERE id = $1", [id]);
    return result.rows[0] ? employeeFromRow(result.rows[0]) : null;
  }

  async findByDiscordId(discordUserId: string): Promise<Employee | null> {
    const result = await this.pool.query("SELECT * FROM employees WHERE discord_user_id = $1", [discordUserId]);
    return result.rows[0] ? employeeFromRow(result.rows[0]) : null;
  }

  async findByManagerDiscordId(managerDiscordUserId: string): Promise<Employee[]> {
    const result = await this.pool.query("SELECT * FROM employees WHERE manager_discord_user_id = $1", [
      managerDiscordUserId
    ]);
    return result.rows.map(employeeFromRow);
  }

  async listApproved(): Promise<Employee[]> {
    const result = await this.pool.query("SELECT * FROM employees WHERE status = 'APPROVED' ORDER BY team, name");
    return result.rows.map(employeeFromRow);
  }

  async approve(employeeId: string): Promise<Employee> {
    const result = await this.pool.query(
      "UPDATE employees SET status = 'APPROVED', updated_at = now() WHERE id = $1 RETURNING *",
      [employeeId]
    );
    return employeeFromRow(one(result));
  }

  async reject(employeeId: string): Promise<Employee> {
    const result = await this.pool.query(
      "UPDATE employees SET status = 'REJECTED', updated_at = now() WHERE id = $1 RETURNING *",
      [employeeId]
    );
    return employeeFromRow(one(result));
  }

  async delete(employeeId: string): Promise<void> {
    await this.pool.query("UPDATE employees SET status = 'INACTIVE', updated_at = now() WHERE id = $1", [employeeId]);
  }

  async createSession(
    employeeId: string,
    checkinAt: Date,
    context?: { channelId?: string | null; topic?: string | null; sourceMessageTs?: string | null }
  ): Promise<AttendanceSession> {
    const result = await this.pool.query(
      `INSERT INTO attendance_sessions (employee_id, checkin_at, channel_id, topic, source_message_ts)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [employeeId, checkinAt, context?.channelId ?? null, context?.topic ?? null, context?.sourceMessageTs ?? null]
    );
    return sessionFromRow(one(result));
  }

  async findOpenSession(employeeId: string): Promise<AttendanceSession | null> {
    const result = await this.pool.query(
      `SELECT * FROM attendance_sessions
       WHERE employee_id = $1 AND status = 'OPEN'
       ORDER BY checkin_at DESC
       LIMIT 1`,
      [employeeId]
    );
    return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
  }

  async closeSession(sessionId: string, checkoutAt: Date, durationMinutes: number): Promise<AttendanceSession> {
    const result = await this.pool.query(
      `UPDATE attendance_sessions
       SET checkout_at = $2, duration_minutes = $3, status = 'CLOSED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [sessionId, checkoutAt, durationMinutes]
    );
    return sessionFromRow(one(result));
  }

  async listSessions(employeeId: string, from: Date, to: Date): Promise<AttendanceSession[]> {
    const result = await this.pool.query(
      `SELECT * FROM attendance_sessions
       WHERE employee_id = $1 AND checkin_at >= $2 AND checkin_at < $3
       ORDER BY checkin_at`,
      [employeeId, from, to]
    );
    return result.rows.map(sessionFromRow);
  }

  async summarize(from: Date, to: Date, employeeIds?: string[]): Promise<AttendanceSummaryRow[]> {
    const result = await this.pool.query(
      `SELECT
         e.id AS employee_id,
         e.name AS employee_name,
         e.team,
         COALESCE(SUM(CASE WHEN s.status = 'CLOSED' THEN s.duration_minutes ELSE 0 END), 0)::int AS work_minutes,
         COALESCE(SUM(CASE WHEN ot.status = 'APPROVED' THEN EXTRACT(EPOCH FROM (ot.end_at - ot.start_at)) / 60 ELSE 0 END), 0)::int AS approved_ot_minutes,
         COALESCE(SUM(CASE WHEN ot.status IN ('PENDING_MANAGER', 'PENDING_BOSS') THEN EXTRACT(EPOCH FROM (ot.end_at - ot.start_at)) / 60 ELSE 0 END), 0)::int AS pending_ot_minutes,
         COALESCE(COUNT(CASE WHEN s.status = 'MISSING_CHECKOUT' THEN 1 END), 0)::int AS missing_checkout_count
       FROM employees e
       LEFT JOIN attendance_sessions s ON s.employee_id = e.id AND s.checkin_at >= $1 AND s.checkin_at < $2
       LEFT JOIN ot_requests ot ON ot.employee_id = e.id AND ot.start_at >= $1 AND ot.start_at < $2
       WHERE ($3::uuid[] IS NULL OR e.id = ANY($3::uuid[]))
       GROUP BY e.id, e.name, e.team
       ORDER BY e.team, e.name`,
      [from, to, employeeIds ?? null]
    );
    return result.rows.map((row) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      team: row.team,
      workMinutes: row.work_minutes,
      approvedOtMinutes: row.approved_ot_minutes,
      pendingOtMinutes: row.pending_ot_minutes,
      missingCheckoutCount: row.missing_checkout_count
    }));
  }

  async createOtRequest(input: OtCreateInput): Promise<OtRequest> {
    const result = await this.pool.query(
      `INSERT INTO ot_requests (employee_id, session_id, start_at, end_at, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.employeeId, input.sessionId, input.startAt, input.endAt, input.reason]
    );
    return otFromRow(one(result));
  }

  async findOtRequestById(id: string): Promise<OtRequest | null> {
    const result = await this.pool.query("SELECT * FROM ot_requests WHERE id = $1", [id]);
    return result.rows[0] ? otFromRow(result.rows[0]) : null;
  }

  async managerApprove(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    const result = await this.pool.query(
      `UPDATE ot_requests
       SET manager_status = 'APPROVED', status = 'PENDING_BOSS', manager_approved_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'PENDING_MANAGER'
       RETURNING *`,
      [id, approverDiscordUserId]
    );
    return otFromRow(one(result));
  }

  async managerReject(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    const result = await this.pool.query(
      `UPDATE ot_requests
       SET manager_status = 'REJECTED', status = 'REJECTED', manager_approved_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'PENDING_MANAGER'
       RETURNING *`,
      [id, approverDiscordUserId]
    );
    return otFromRow(one(result));
  }

  async bossApprove(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    const result = await this.pool.query(
      `UPDATE ot_requests
       SET boss_status = 'APPROVED', status = 'APPROVED', boss_approved_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'PENDING_BOSS'
       RETURNING *`,
      [id, approverDiscordUserId]
    );
    return otFromRow(one(result));
  }

  async bossReject(id: string, approverDiscordUserId: string): Promise<OtRequest> {
    const result = await this.pool.query(
      `UPDATE ot_requests
       SET boss_status = 'REJECTED', status = 'REJECTED', boss_approved_by = $2, updated_at = now()
       WHERE id = $1 AND status = 'PENDING_BOSS'
       RETURNING *`,
      [id, approverDiscordUserId]
    );
    return otFromRow(one(result));
  }

  async upsertAvailability(input: {
    employeeId: string;
    weekStart: string;
    availableSlots: WeeklyAvailability["availableSlots"];
    unavailableSlots: WeeklyAvailability["unavailableSlots"];
    notes?: string | null;
  }): Promise<WeeklyAvailability> {
    const result = await this.pool.query(
      `INSERT INTO weekly_availability (employee_id, week_start, available_slots, unavailable_slots, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (employee_id, week_start) DO UPDATE SET
         available_slots = EXCLUDED.available_slots,
         unavailable_slots = EXCLUDED.unavailable_slots,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING *`,
      [
        input.employeeId,
        input.weekStart,
        JSON.stringify(input.availableSlots),
        JSON.stringify(input.unavailableSlots),
        input.notes ?? null
      ]
    );
    return availabilityFromRow(one(result));
  }

  async listAvailability(weekStart: string): Promise<WeeklyAvailability[]> {
    const result = await this.pool.query("SELECT * FROM weekly_availability WHERE week_start = $1", [weekStart]);
    return result.rows.map(availabilityFromRow);
  }

  async listAvailabilityByEmployee(employeeId: string): Promise<WeeklyAvailability[]> {
    const result = await this.pool.query(
      "SELECT * FROM weekly_availability WHERE employee_id = $1 ORDER BY week_start DESC",
      [employeeId]
    );
    return result.rows.map(availabilityFromRow);
  }

  async clearAvailability(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE weekly_availability 
       SET available_slots = '[]', unavailable_slots = '[]', updated_at = now() 
       WHERE id = $1`,
      [id]
    );
  }

  async createDraft(weekStart: string, events: ScheduleEventDraft[]): Promise<ScheduleDraft> {
    const result = await this.pool.query(
      `INSERT INTO schedule_drafts (week_start, ai_output)
       VALUES ($1, $2)
       RETURNING *`,
      [weekStart, JSON.stringify(events)]
    );
    return draftFromRow(one(result));
  }

  async findDraft(id: string): Promise<ScheduleDraft | null> {
    const result = await this.pool.query("SELECT * FROM schedule_drafts WHERE id = $1", [id]);
    return result.rows[0] ? draftFromRow(result.rows[0]) : null;
  }

  async findDraftByWeekStart(weekStart: string): Promise<ScheduleDraft | null> {
    const result = await this.pool.query(
      `SELECT * FROM schedule_drafts 
       WHERE week_start = $1 
       ORDER BY 
         CASE status 
           WHEN 'PUBLISHED' THEN 1 
           WHEN 'APPROVED' THEN 2 
           ELSE 3 
         END, 
         created_at DESC 
       LIMIT 1`,
      [weekStart]
    );
    return result.rows[0] ? draftFromRow(result.rows[0]) : null;
  }

  async approveDraft(id: string, approverDiscordUserId: string): Promise<ScheduleDraft> {
    const result = await this.pool.query(
      `UPDATE schedule_drafts
       SET status = 'APPROVED', approved_by = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, approverDiscordUserId]
    );
    return draftFromRow(one(result));
  }

  async markPublished(id: string, googleCalendarEventIds: string[]): Promise<ScheduleDraft> {
    const result = await this.pool.query(
      `UPDATE schedule_drafts
       SET status = 'PUBLISHED', google_calendar_event_ids = $2, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(googleCalendarEventIds)]
    );
    return draftFromRow(one(result));
  }

  async record(input: AuditLogInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs
        (actor_discord_user_id, action, target_type, target_id, old_status, new_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.actorDiscordUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.oldStatus ?? null,
        input.newStatus ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }

  async recordUsage(input: {
    actorDiscordUserId: string;
    feature: string;
    creditCost: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO bot_usage_events (actor_discord_user_id, feature, credit_cost, metadata)
       VALUES ($1, $2, $3, $4)`,
      [input.actorDiscordUserId, input.feature, input.creditCost, JSON.stringify(input.metadata ?? {})]
    );
  }

  async summarizeUsage(monthStart: Date, monthEnd: Date): Promise<UsageSummaryRow[]> {
    const result = await this.pool.query(
      `SELECT feature, COUNT(*)::int AS request_count, COALESCE(SUM(credit_cost), 0)::int AS credit_cost
       FROM bot_usage_events
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY feature
       ORDER BY feature`,
      [monthStart, monthEnd]
    );
    return result.rows.map((row) => ({
      feature: row.feature,
      requestCount: row.request_count,
      creditCost: row.credit_cost
    }));
  }
}
