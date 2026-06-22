import { beforeEach, describe, expect, it } from "vitest";
import type { CalendarGateway } from "../src/calendar/google-calendar";
import type { Clock } from "../src/services/clock";
import type { ReminderScheduler } from "../src/services/reminders";
import { RuleBasedSchedulePlanner } from "../src/ai/schedule-planner";
import { MemoryRepository } from "../src/repositories/memory";
import { createServices, type Services } from "../src/services/container";

class FakeClock implements Clock {
  private value = new Date("2026-05-29T09:00:00.000Z");
  now() {
    return this.value;
  }
  set(value: string) {
    this.value = new Date(value);
  }
}

class FakeReminderScheduler implements ReminderScheduler {
  reminders: Array<{ discordUserId: string; sessionId: string; delayMs: number; kind: string }> = [];
  async scheduleCheckoutReminder(input: {
    discordUserId: string;
    sessionId: string;
    delayMs: number;
    kind: "INITIAL_4H" | "FOLLOWUP_2H";
  }) {
    this.reminders.push(input);
  }
}

class FakeCalendar implements CalendarGateway {
  created: unknown[] = [];
  async createEvents(events: any[]) {
    this.created.push(...events);
    return events.map((_, index) => `gcal-${index + 1}`);
  }
}

describe("IT attendance bot services", () => {
  let repo: MemoryRepository;
  let services: Services;
  let clock: FakeClock;
  let reminders: FakeReminderScheduler;
  let calendar: FakeCalendar;

  beforeEach(() => {
    repo = new MemoryRepository();
    clock = new FakeClock();
    reminders = new FakeReminderScheduler();
    calendar = new FakeCalendar();
    services = createServices({
      repositories: repo,
      reminders,
      planner: new RuleBasedSchedulePlanner(),
      calendar,
      airtable: {} as any,
      bossUserIds: ["UBOSS"],
      timezone: "Asia/Ho_Chi_Minh",
      clock
    });
  });

  async function addApprovedEmployee(discordUserId = "UEMP", managerDiscordUserId = "UMANAGER") {
    const employee = await services.employees.requestAdd(
      {
        discordUserId,
        name: "Nguyen Van A",
        email: "a@example.com",
        team: "IT",
        managerDiscordUserId
      },
      discordUserId
    );
    return services.employees.approve(employee.id, managerDiscordUserId);
  }

  it("blocks check-in while employee is pending approval", async () => {
    await services.employees.requestAdd(
      {
        discordUserId: "UEMP",
        name: "Nguyen Van A",
        email: "a@example.com",
        team: "IT",
        managerDiscordUserId: "UMANAGER"
      },
      "UEMP"
    );

    await expect(services.attendance.checkIn("UEMP")).rejects.toMatchObject({ code: "EMPLOYEE_NOT_APPROVED" });
  });

  it("keeps self-service employee adds pending until approval", async () => {
    const employee = await services.employees.requestAdd(
      {
        discordUserId: "UNEW",
        name: "New Employee",
        email: "new@example.com",
        team: "IT",
        managerDiscordUserId: "UMANAGER"
      },
      "UNEW"
    );

    expect(employee.status).toBe("PENDING_APPROVAL");
  });

  it("checks in approved employee, schedules 4h reminder, and checks out with duration", async () => {
    await addApprovedEmployee();

    const session = await services.attendance.checkIn("UEMP");
    expect(session.status).toBe("OPEN");
    expect(reminders.reminders).toMatchObject([{ discordUserId: "UEMP", delayMs: 4 * 60 * 60 * 1000, kind: "INITIAL_4H" }]);

    clock.set("2026-05-29T11:30:00.000Z");
    const closed = await services.attendance.checkOut("UEMP");
    expect(closed.status).toBe("CLOSED");
    expect(closed.durationMinutes).toBe(150);
  });

  it("schedules a 2h follow-up when employee continues working", async () => {
    await addApprovedEmployee();
    await services.attendance.checkIn("UEMP");

    await services.attendance.continueWorking("UEMP");

    expect(reminders.reminders.at(-1)).toMatchObject({
      discordUserId: "UEMP",
      delayMs: 2 * 60 * 60 * 1000,
      kind: "FOLLOWUP_2H"
    });
  });

  it("supports multiple work sessions in one day and summarizes total minutes", async () => {
    const employee = await addApprovedEmployee();

    await services.attendance.checkIn("UEMP");
    clock.set("2026-05-29T10:00:00.000Z");
    await services.attendance.checkOut("UEMP");

    clock.set("2026-05-29T18:00:00.000Z");
    await services.attendance.checkIn("UEMP");
    clock.set("2026-05-29T20:00:00.000Z");
    await services.attendance.checkOut("UEMP");

    const rows = await services.reports.attendanceSummary(
      new Date("2026-05-29T00:00:00.000Z"),
      new Date("2026-05-30T00:00:00.000Z"),
      [employee.id]
    );
    expect(rows[0].workMinutes).toBe(180);
  });

  it("only counts OT after manager and boss approval", async () => {
    const employee = await addApprovedEmployee();
    const request = await services.ot.report("UEMP", {
      startAt: new Date("2026-05-29T19:00:00.000Z"),
      endAt: new Date("2026-05-29T21:00:00.000Z"),
      reason: "Deploy production"
    });

    await expect(services.ot.bossApprove(request.id, "UBOSS")).rejects.toMatchObject({ code: "OT_NOT_READY_FOR_BOSS" });
    await services.ot.managerApprove(request.id, "UMANAGER");
    await services.ot.bossApprove(request.id, "UBOSS");

    const rows = await services.reports.attendanceSummary(
      new Date("2026-05-29T00:00:00.000Z"),
      new Date("2026-05-30T00:00:00.000Z"),
      [employee.id]
    );
    expect(rows[0].approvedOtMinutes).toBe(120);
    expect(rows[0].pendingOtMinutes).toBe(0);
  });

  it("stops OT flow when manager rejects", async () => {
    await addApprovedEmployee();
    const request = await services.ot.report("UEMP", {
      startAt: new Date("2026-05-29T19:00:00.000Z"),
      endAt: new Date("2026-05-29T20:00:00.000Z"),
      reason: "Incident"
    });

    const rejected = await services.ot.managerReject(request.id, "UMANAGER");
    expect(rejected.status).toBe("REJECTED");
    await expect(services.ot.bossApprove(request.id, "UBOSS")).rejects.toMatchObject({ code: "OT_NOT_READY_FOR_BOSS" });
  });

  it("creates schedule draft without publishing until approval", async () => {
    const employee = await addApprovedEmployee();
    await services.schedules.submitAvailability("UEMP", {
      weekStart: "2026-06-01",
      availableSlots: [{ day: "2026-06-01", start: "09:00", end: "13:00" }],
      unavailableSlots: [],
      notes: "Morning only"
    });

    const draft = await services.schedules.generateDraft("2026-06-01", "UMANAGER");
    expect(draft.aiOutput).toHaveLength(1);
    expect(calendar.created).toHaveLength(0);
    expect(draft.aiOutput[0]).toMatchObject({ employeeId: employee.id, title: "[IT] Nguyen Van A - Shift" });

    const published = await services.schedules.approveAndPublishDraft(draft.id, "UBOSS");
    expect(published.status).toBe("PUBLISHED");
    expect(published.googleCalendarEventIds).toEqual(["gcal-1"]);
    expect(calendar.created).toHaveLength(1);
  });

  it("exports attendance summary as CSV", async () => {
    const employee = await addApprovedEmployee();
    await services.attendance.checkIn("UEMP");
    clock.set("2026-05-29T10:00:00.000Z");
    await services.attendance.checkOut("UEMP");

    const csv = await services.reports.attendanceCsv(
      new Date("2026-05-29T00:00:00.000Z"),
      new Date("2026-05-30T00:00:00.000Z"),
      [employee.id]
    );

    expect(csv).toContain("employee_id,employee_name,team,work_minutes");
    expect(csv).toContain("Nguyen Van A,IT,60");
  });

  it("handles natural-language check-in with topic through assistant", async () => {
    await addApprovedEmployee();

    const reply = await services.chatAssistant.handle({
      userId: "UEMP",
      channelId: "CWORK",
      text: "<UBOT> I start work now on production incident",
      messageTs: "123.456",
      isDirectMessage: false
    });

    expect(reply.text).toContain("Checked in");
    const employee = await services.employees.getByDiscordId("UEMP");
    const open = await repo.findOpenSession(employee!.id);
    expect(open).toMatchObject({
      channelId: "CWORK",
      topic: "production incident",
      sourceMessageTs: "123.456"
    });
  });

  it("does not treat removed translation requests as attendance or billable usage", async () => {
    await addApprovedEmployee();

    const translateReply = await services.chatAssistant.handle({
      userId: "UEMP",
      channelId: "D123",
      text: "translate to German: I start work now",
      isDirectMessage: true
    });
    expect(translateReply.text).toContain("I can help");

    const reply = await services.chatAssistant.handle({
      userId: "UEMP",
      channelId: "D123",
      text: "monthly usage",
      isDirectMessage: true
    });

    expect(reply.text).toContain("0 credits");
    expect(reply.text).not.toContain("translation");
    expect(reply.text).not.toContain("natural_language_attendance");
  });

  it("blocks employee deletion by non-manager users", async () => {
    const employee = await addApprovedEmployee("UEMP", "UMANAGER");
    await addApprovedEmployee("UOTHER", "UOTHER_MANAGER");

    await expect(services.employees.deleteEmployee(employee.id, "UOTHER", ["UBOSS"])).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
    expect(await services.employees.getById(employee.id)).not.toBeNull();
  });

  it("blocks managers from deleting employees outside their direct reports", async () => {
    const employee = await addApprovedEmployee("UEMP", "UMANAGER");
    const otherManager = await addApprovedEmployee("UOTHER_MANAGER", "UBOSS");
    await repo.createPending({
      discordUserId: "UDIRECT_REPORT",
      name: "Direct Report",
      email: "direct@example.com",
      team: "IT",
      managerDiscordUserId: otherManager.discordUserId
    });

    await expect(services.employees.deleteEmployee(employee.id, otherManager.discordUserId, ["UBOSS"])).rejects.toMatchObject({
      code: "NOT_AUTHORIZED"
    });
    expect(await services.employees.getById(employee.id)).not.toBeNull();
  });
});
