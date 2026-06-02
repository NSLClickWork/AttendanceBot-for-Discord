export type CheckoutReminderKind = "INITIAL_4H" | "FOLLOWUP_2H";

export interface ReminderScheduler {
  scheduleCheckoutReminder(input: {
    discordUserId: string;
    sessionId: string;
    delayMs: number;
    kind: CheckoutReminderKind;
  }): Promise<void>;
}

export class NoopReminderScheduler implements ReminderScheduler {
  async scheduleCheckoutReminder(): Promise<void> {
    return;
  }
}
