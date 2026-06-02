import type { UsageRepository } from "../repositories/types";

export class UsageService {
  constructor(private readonly usage: UsageRepository) {}

  async record(actorDiscordUserId: string, feature: string, creditCost: number, metadata?: Record<string, unknown>) {
    await this.usage.recordUsage({ actorDiscordUserId, feature, creditCost, metadata });
  }

  async currentMonthSummary(now = new Date()) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return this.usage.summarizeUsage(monthStart, monthEnd);
  }
}
