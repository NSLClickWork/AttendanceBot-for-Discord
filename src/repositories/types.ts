import type {
  AttendanceSession,
  AttendanceSummaryRow,
  AuditLogInput,
  Employee,
  EmployeeRole,
  OtRequest,
  ScheduleDraft,
  ScheduleEventDraft,
  UsageSummaryRow,
  WeeklyAvailability,
  ShiftTask,
  TaskStatus
} from "../domain";

export interface EmployeeCreateInput {
  discordUserId: string;
  name: string;
  email: string;
  team: string;
  managerDiscordUserId: string;
  role?: EmployeeRole;
}

export interface EmployeeRepository {
  createPending(input: EmployeeCreateInput): Promise<Employee>;
  findById(id: string): Promise<Employee | null>;
  findByDiscordId(discordUserId: string): Promise<Employee | null>;
  findByManagerDiscordId(managerDiscordUserId: string): Promise<Employee[]>;
  listApproved(): Promise<Employee[]>;
  approve(employeeId: string): Promise<Employee>;
  reject(employeeId: string): Promise<Employee>;
  delete(employeeId: string): Promise<void>;
}

export interface AttendanceRepository {
  createSession(
    employeeId: string,
    checkinAt: Date,
    context?: { channelId?: string | null; topic?: string | null; sourceMessageTs?: string | null }
  ): Promise<AttendanceSession>;
  findOpenSession(employeeId: string): Promise<AttendanceSession | null>;
  closeSession(sessionId: string, checkoutAt: Date, durationMinutes: number): Promise<AttendanceSession>;
  listSessions(employeeId: string, from: Date, to: Date): Promise<AttendanceSession[]>;
  summarize(from: Date, to: Date, employeeIds?: string[]): Promise<AttendanceSummaryRow[]>;
  createTasks(sessionId: string, descriptions: string[]): Promise<void>;
  getTasksForSession(sessionId: string): Promise<ShiftTask[]>;
  updateTaskStatuses(taskIds: string[], status: TaskStatus): Promise<void>;
}

export interface OtCreateInput {
  employeeId: string;
  sessionId: string | null;
  startAt: Date;
  endAt: Date;
  reason: string;
}

export interface OtRepository {
  createOtRequest(input: OtCreateInput): Promise<OtRequest>;
  findOtRequestById(id: string): Promise<OtRequest | null>;
  managerApprove(id: string, approverDiscordUserId: string): Promise<OtRequest>;
  managerReject(id: string, approverDiscordUserId: string): Promise<OtRequest>;
  bossApprove(id: string, approverDiscordUserId: string): Promise<OtRequest>;
  bossReject(id: string, approverDiscordUserId: string): Promise<OtRequest>;
}

export interface ScheduleRepository {
  upsertAvailability(input: {
    employeeId: string;
    weekStart: string;
    availableSlots: WeeklyAvailability["availableSlots"];
    unavailableSlots: WeeklyAvailability["unavailableSlots"];
    notes?: string | null;
  }): Promise<WeeklyAvailability>;
  listAvailability(weekStart: string): Promise<WeeklyAvailability[]>;
  listAvailabilityByEmployee(employeeId: string): Promise<WeeklyAvailability[]>;
  clearAvailability(id: string): Promise<void>;
  createDraft(weekStart: string, events: ScheduleEventDraft[]): Promise<ScheduleDraft>;
  findDraft(id: string): Promise<ScheduleDraft | null>;
  findDraftByWeekStart(weekStart: string): Promise<ScheduleDraft | null>;
  approveDraft(id: string, approverDiscordUserId: string): Promise<ScheduleDraft>;
  markPublished(id: string, googleCalendarEventIds: string[]): Promise<ScheduleDraft>;
}

export interface AuditRepository {
  record(input: AuditLogInput): Promise<void>;
}

export interface UsageRepository {
  recordUsage(input: {
    actorDiscordUserId: string;
    feature: string;
    creditCost: number;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  summarizeUsage(monthStart: Date, monthEnd: Date): Promise<UsageSummaryRow[]>;
}
