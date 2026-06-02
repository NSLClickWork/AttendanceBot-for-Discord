import type { EmployeeRepository, ScheduleRepository, AuditRepository } from "../repositories/types";
import type { AvailabilitySlot, ScheduleDraft, WeeklyAvailability, ScheduleEventDraft } from "../domain";
import type { SchedulePlanner } from "../ai/schedule-planner";
import type { CalendarGateway } from "../calendar/google-calendar";
import { EmployeeService } from "./employees";
import { AppError, assertFound } from "./errors";

export class ScheduleService {
  constructor(
    private readonly employeesService: EmployeeService,
    private readonly employees: EmployeeRepository,
    private readonly schedules: ScheduleRepository,
    private readonly planner: SchedulePlanner,
    private readonly calendar: CalendarGateway,
    private readonly audit: AuditRepository,
    private readonly timezone: string,
    private readonly scheduleCalendarId?: string
  ) {}

  async submitAvailability(
    discordUserId: string,
    input: {
      weekStart: string;
      availableSlots: AvailabilitySlot[];
      unavailableSlots: AvailabilitySlot[];
      notes?: string | null;
    }
  ): Promise<WeeklyAvailability> {
    const employee = await this.employeesService.getApprovedByDiscordId(discordUserId);
    const availability = await this.schedules.upsertAvailability({
      employeeId: employee.id,
      weekStart: input.weekStart,
      availableSlots: input.availableSlots,
      unavailableSlots: input.unavailableSlots,
      notes: input.notes
    });
    await this.audit.record({
      actorDiscordUserId: discordUserId,
      action: "WEEKLY_AVAILABILITY_SUBMITTED",
      targetType: "weekly_availability",
      targetId: availability.id
    });


    return availability;
  }

  async listMyAvailability(discordUserId: string): Promise<WeeklyAvailability[]> {
    const employee = await this.employees.findByDiscordId(discordUserId);
    if (!employee) {
      throw new Error("Employee not found");
    }
    return this.schedules.listAvailabilityByEmployee(employee.id);
  }

  async deleteAvailability(id: string, discordUserId: string): Promise<void> {
    const employee = await this.employees.findByDiscordId(discordUserId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify ownership
    const availabilities = await this.schedules.listAvailabilityByEmployee(employee.id);
    const target = availabilities.find(a => a.id === id);
    if (!target) {
      throw new Error("Schedule not found or you do not have permission to delete it.");
    }

    await this.schedules.clearAvailability(id);

    await this.audit.record({
      actorDiscordUserId: discordUserId,
      action: "DELETE_SCHEDULE",
      targetType: "SCHEDULE",
      targetId: id
    });
  }

  async generateDraft(weekStart: string, actorDiscordUserId: string): Promise<ScheduleDraft> {
    const [employees, availability] = await Promise.all([
      this.employees.listApproved(),
      this.schedules.listAvailability(weekStart)
    ]);
    if (availability.length === 0) {
      throw new AppError("No employee has submitted availability for this week.", "NO_AVAILABILITY");
    }

    const events = await this.planner.generateDraft({
      weekStart,
      employees,
      availability,
      timezone: this.timezone
    });
    const draft = await this.schedules.createDraft(weekStart, events);
    await this.audit.record({
      actorDiscordUserId,
      action: "SCHEDULE_DRAFT_GENERATED",
      targetType: "schedule_draft",
      targetId: draft.id,
      newStatus: draft.status,
      metadata: { eventCount: events.length }
    });
    return draft;
  }

  async approveAndPublishDraft(draftId: string, approverDiscordUserId: string): Promise<ScheduleDraft> {
    const draft = assertFound(await this.schedules.findDraft(draftId));
    if (draft.status === "PUBLISHED") {
      return draft;
    }
    const approved = await this.schedules.approveDraft(draftId, approverDiscordUserId);
    const googleIds = await this.calendar.createEvents(approved.aiOutput);
    const published = await this.schedules.markPublished(draftId, googleIds);
    await this.audit.record({
      actorDiscordUserId: approverDiscordUserId,
      action: "SCHEDULE_DRAFT_PUBLISHED",
      targetType: "schedule_draft",
      targetId: published.id,
      oldStatus: draft.status,
      newStatus: published.status,
      metadata: { googleCalendarEventIds: googleIds }
    });
    return published;
  }
}
