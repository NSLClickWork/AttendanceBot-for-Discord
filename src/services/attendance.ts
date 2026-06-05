import type { AttendanceRepository, AuditRepository } from "../repositories/types";
import type { AttendanceSession } from "../domain";
import type { Clock } from "./clock";
import type { ReminderScheduler } from "./reminders";
import { minutesBetween } from "./clock";
import { AppError } from "./errors";
import { EmployeeService } from "./employees";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export class AttendanceService {
  constructor(
    private readonly employees: EmployeeService,
    private readonly attendance: AttendanceRepository,
    private readonly reminders: ReminderScheduler,
    private readonly audit: AuditRepository,
    private readonly clock: Clock
  ) {}

  async checkIn(
    discordUserId: string,
    context?: { channelId?: string | null; topic?: string | null; sourceMessageTs?: string | null; tasks?: string[] }
  ): Promise<AttendanceSession> {
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    const open = await this.attendance.findOpenSession(employee.id);
    if (open) {
      throw new AppError("You have an open shift. Please check out first.", "SESSION_ALREADY_OPEN");
    }

    const session = await this.attendance.createSession(employee.id, this.clock.now(), context);
    if (context?.tasks && context.tasks.length > 0) {
      await this.attendance.createTasks(session.id, context.tasks);
    }
    await this.reminders.scheduleCheckoutReminder({
      discordUserId,
      sessionId: session.id,
      delayMs: FOUR_HOURS_MS,
      kind: "INITIAL_4H"
    });
    await this.audit.record({
      actorDiscordUserId: discordUserId,
      action: "ATTENDANCE_CHECKIN",
      targetType: "attendance_session",
      targetId: session.id,
      newStatus: session.status
    });
    return session;
  }

  async checkOut(discordUserId: string): Promise<AttendanceSession> {
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    const open = await this.attendance.findOpenSession(employee.id);
    if (!open) {
      throw new AppError("You don't have any open shift to check out.", "NO_OPEN_SESSION");
    }

    const checkoutAt = this.clock.now();
    const durationMinutes = minutesBetween(open.checkinAt, checkoutAt);
    const session = await this.attendance.closeSession(open.id, checkoutAt, durationMinutes);
    await this.audit.record({
      actorDiscordUserId: discordUserId,
      action: "ATTENDANCE_CHECKOUT",
      targetType: "attendance_session",
      targetId: session.id,
      oldStatus: open.status,
      newStatus: session.status,
      metadata: { durationMinutes }
    });
    return session;
  }

  async continueWorking(discordUserId: string): Promise<void> {
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    const open = await this.attendance.findOpenSession(employee.id);
    if (!open) {
      throw new AppError("You don't have any open shift.", "NO_OPEN_SESSION");
    }

    await this.reminders.scheduleCheckoutReminder({
      discordUserId,
      sessionId: open.id,
      delayMs: TWO_HOURS_MS,
      kind: "FOLLOWUP_2H"
    });
    await this.audit.record({
      actorDiscordUserId: discordUserId,
      action: "ATTENDANCE_CONTINUE_WORKING",
      targetType: "attendance_session",
      targetId: open.id
    });
  }

  async mySessions(discordUserId: string, from: Date, to: Date): Promise<AttendanceSession[]> {
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    return this.attendance.listSessions(employee.id, from, to);
  }

  async getOpenSessionTasks(discordUserId: string) {
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    const open = await this.attendance.findOpenSession(employee.id);
    if (!open) {
      throw new AppError("You don't have any open shift.", "NO_OPEN_SESSION");
    }
    return this.attendance.getTasksForSession(open.id);
  }

  async getTasksForSessionId(sessionId: string) {
    return this.attendance.getTasksForSession(sessionId);
  }

  async updateTaskStatuses(taskIds: string[], status: import("../domain").TaskStatus) {
    return this.attendance.updateTaskStatuses(taskIds, status);
  }

  async getPreviousSessionNotYetTasks(discordUserId: string) {
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    const lastSession = await this.attendance.getLastClosedSession(employee.id);
    if (!lastSession) return [];

    const tasks = await this.attendance.getTasksForSession(lastSession.id);
    return tasks.filter(t => t.status === "NOT_YET");
  }
}
