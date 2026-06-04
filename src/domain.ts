export type EmployeeStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "INACTIVE";
export type EmployeeRole = "EMPLOYEE" | "MANAGER" | "BOSS" | "HR";
export type AttendanceStatus = "OPEN" | "CLOSED" | "MISSING_CHECKOUT";
export type OtApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type OtRequestStatus = "PENDING_MANAGER" | "PENDING_BOSS" | "APPROVED" | "REJECTED";
export type ScheduleDraftStatus = "DRAFT" | "APPROVED" | "CHANGES_REQUESTED" | "PUBLISHED";
export type TaskStatus = "NOT_YET" | "IN_PROGRESS" | "DONE";

export interface Employee {
  id: string;
  discordUserId: string;
  name: string;
  email: string;
  team: string;
  managerDiscordUserId: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceSession {
  id: string;
  employeeId: string;
  checkinAt: Date;
  checkoutAt: Date | null;
  durationMinutes: number | null;
  status: AttendanceStatus;
  channelId: string | null;
  topic: string | null;
  sourceMessageTs: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OtRequest {
  id: string;
  employeeId: string;
  sessionId: string | null;
  startAt: Date;
  endAt: Date;
  reason: string;
  managerStatus: OtApprovalStatus;
  bossStatus: OtApprovalStatus;
  status: OtRequestStatus;
  managerApprovedBy: string | null;
  bossApprovedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShiftTask {
  id: string;
  sessionId: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilitySlot {
  day: string;
  start: string;
  end: string;
}

export interface WeeklyAvailability {
  id: string;
  employeeId: string;
  weekStart: string;
  availableSlots: AvailabilitySlot[];
  unavailableSlots: AvailabilitySlot[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleEventDraft {
  employeeId: string;
  title: string;
  startAt: string;
  endAt: string;
  notes?: string;
}

export interface ScheduleDraft {
  id: string;
  weekStart: string;
  aiOutput: ScheduleEventDraft[];
  status: ScheduleDraftStatus;
  approvedBy: string | null;
  googleCalendarEventIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogInput {
  actorDiscordUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  oldStatus?: string | null;
  newStatus?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AttendanceSummaryRow {
  employeeId: string;
  employeeName: string;
  team: string;
  workMinutes: number;
  approvedOtMinutes: number;
  pendingOtMinutes: number;
  missingCheckoutCount: number;
}

export interface UsageSummaryRow {
  feature: string;
  requestCount: number;
  creditCost: number;
}
