import { Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { CheckoutReminderKind, ReminderScheduler } from "../services/reminders";
import type { EmployeeRepository, AttendanceRepository } from "../repositories/types";

export const ATTENDANCE_QUEUE = "attendance-bot";

export type AttendanceJob =
  | {
      type: "checkout-reminder";
      discordUserId: string;
      sessionId: string;
      kind: CheckoutReminderKind;
    }
  | {
      type: "weekly-schedule-reminder";
    };

export class BullReminderScheduler implements ReminderScheduler {
  constructor(private readonly queue: Queue) {}

  async scheduleCheckoutReminder(input: {
    discordUserId: string;
    sessionId: string;
    delayMs: number;
    kind: CheckoutReminderKind;
  }): Promise<void> {
    await this.queue.add(
      "checkout-reminder",
      {
        type: "checkout-reminder",
        discordUserId: input.discordUserId,
        sessionId: input.sessionId,
        kind: input.kind
      },
      { delay: input.delayMs, removeOnComplete: true, removeOnFail: 100 }
    );
  }
}

export function createQueue(redisUrl: string) {
  const connection = redisConnection(redisUrl);
  return {
    queue: new Queue(ATTENDANCE_QUEUE, { connection })
  };
}

export async function scheduleWeeklyReminder(queue: Queue, timezone: string) {
  const options: JobsOptions = {
    repeat: { pattern: "0 9 * * 0", tz: timezone },
    removeOnComplete: true,
    removeOnFail: 100
  };
  await queue.add("weekly-schedule-reminder", { type: "weekly-schedule-reminder" }, options);
}

export function startWorkers(input: {
  redisUrl: string;
  delivery: ReminderDelivery;
  employees: EmployeeRepository;
  attendance: AttendanceRepository;
  itChannelId?: string;
}) {
  const connection = redisConnection(input.redisUrl);

  return new Worker<AttendanceJob>(
    ATTENDANCE_QUEUE,
    async (job) => {
      if (job.data.type === "checkout-reminder") {
        const employee = await input.employees.findByDiscordId(job.data.discordUserId);
        if (!employee) return;
        
        const openSession = await input.attendance.findOpenSession(employee.id);
        if (!openSession || openSession.id !== job.data.sessionId) {
          return;
        }

        const text = job.data.kind === "INITIAL_4H"
          ? "Do you want to check out now?"
          : "You are still working. Do you want to check out now?";

        await input.delivery.checkoutReminder(job.data.discordUserId, text, job.data.kind);
        return;
      }

      const employees = await input.employees.listApproved();
      if (input.itChannelId) {
        await input.delivery.weeklyScheduleReminder(input.itChannelId, false);
      }
      await Promise.all(
        employees.map((employee) =>
          input.delivery.weeklyScheduleReminder(employee.discordUserId, true)
        )
      );
    },
    { connection }
  );
}

export interface ReminderDelivery {
  checkoutReminder(userId: string, text: string, kind: CheckoutReminderKind): Promise<void>;
  weeklyScheduleReminder(targetId: string, direct: boolean): Promise<void>;
}

function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.slice(1) || 0) : 0,
    maxRetriesPerRequest: null
  };
}

export function checkoutReminderBlocks(kind: CheckoutReminderKind) {
  const text = kind === "INITIAL_4H"
    ? "You have worked for more than 4 hours. Do you want to check out?"
    : "2 hours have passed. Do you want to check out now?";

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text }
    },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Check out" }, action_id: "attendance_checkout" },
        {
          type: "button",
          text: { type: "plain_text", text: "Continue working" },
          action_id: "attendance_continue_working"
        },
        { type: "button", text: { type: "plain_text", text: "Report OT" }, action_id: "ot_report_open" }
      ]
    }
  ];
}

export function weeklyScheduleReminderBlocks() {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "Today is Sunday. Please submit your availability for next week." }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Submit weekly schedule" },
          action_id: "schedule_submit_open"
        }
      ]
    }
  ];
}
