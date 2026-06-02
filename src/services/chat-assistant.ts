import type { AttendanceSession } from "../domain";
import type { AttendanceService } from "./attendance";
import { AppError } from "./errors";
import type { UsageService } from "./usage";

export interface ChatAssistantContext {
  userId: string;
  channelId: string;
  text: string;
  messageTs?: string;
  isDirectMessage: boolean;
}

export interface ChatAssistantReply {
  text: string;
}

export class ChatAssistantService {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly usage: UsageService
  ) {}

  async handle(input: ChatAssistantContext): Promise<ChatAssistantReply> {
    const text = cleanMention(input.text);
    const intent = parseIntent(text);
    await this.usage.record(input.userId, intent.feature, intent.creditCost, {
      channelId: input.channelId,
      isDirectMessage: input.isDirectMessage
    });

    try {
      if (intent.type === "checkin") {
        const session = await this.attendance.checkIn(input.userId, {
          channelId: input.channelId,
          topic: intent.topic,
          sourceMessageTs: input.messageTs
        });
        return { text: formatCheckin(session) };
      }

      if (intent.type === "checkout") {
        const session = await this.attendance.checkOut(input.userId);
        return { text: `Checked out. Total work time: ${session.durationMinutes} minutes.` };
      }

      if (intent.type === "continue") {
        await this.attendance.continueWorking(input.userId);
        return { text: "Got it. I will remind you again in 2 hours." };
      }

      if (intent.type === "usage") {
        const rows = await this.usage.currentMonthSummary();
        const total = rows.reduce((sum, row) => sum + row.creditCost, 0);
        const detail = rows
          .map((row) => `- ${row.feature}: ${row.requestCount} requests, ${row.creditCost} credits`)
          .join("\n");
        return { text: `This month usage: ${total} credits\n${detail || "- No usage yet"}` };
      }

      return { text: helpText() };
    } catch (error) {
      if (error instanceof AppError) {
        return { text: error.message };
      }
      throw error;
    }
  }
}

type AssistantIntent =
  | { type: "checkin"; topic: string | null; feature: string; creditCost: number }
  | { type: "checkout"; feature: string; creditCost: number }
  | { type: "continue"; feature: string; creditCost: number }
  | { type: "usage"; feature: string; creditCost: number }
  | { type: "help"; feature: string; creditCost: number };

export function parseIntent(text: string): AssistantIntent {
  const lower = text.toLowerCase().trim();

  if (/\b(credit|usage|cost|monthly|month)\b/.test(lower)) {
    return { type: "usage", feature: "usage_summary", creditCost: 0 };
  }

  if (/^\s*(translate|translation|dich|dịch)\b/i.test(text)) {
    return { type: "help", feature: "assistant_help", creditCost: 0 };
  }

  if (/\b(check\s*out|checkout|end work|finish work|stop work|ket ca|kết ca)\b/.test(lower)) {
    return { type: "checkout", feature: "natural_language_attendance", creditCost: 0 };
  }

  if (/\b(continue|keep working|still working|tiếp tục|tiep tuc)\b/.test(lower)) {
    return { type: "continue", feature: "natural_language_attendance", creditCost: 0 };
  }

  if (/\b(check\s*in|checkin|start work|start the work|begin work|i start work|bắt đầu|bat dau)\b/.test(lower)) {
    return {
      type: "checkin",
      topic: extractTopic(text),
      feature: "natural_language_attendance",
      creditCost: 0
    };
  }

  return { type: "help", feature: "assistant_help", creditCost: 0 };
}

function cleanMention(text: string) {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

function extractTopic(text: string): string | null {
  const match = text.match(/\b(?:on|for|topic|about)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function formatCheckin(session: AttendanceSession) {
  const topic = session.topic ? ` Topic: ${session.topic}.` : "";
  return `Checked in at ${session.checkinAt.toLocaleString()}.${topic} I will remind you after 4 hours.`;
}

function helpText() {
  return [
    "I can help in this channel or DM:",
    "- `@attendencebot check in`",
    "- `@attendencebot start work on incident #123`",
    "- `@attendencebot check out`",
    "- `@attendencebot monthly usage`",
    "Limitations: Discord login/2FA is controlled by workspace settings, not this bot."
  ].join("\n");
}
