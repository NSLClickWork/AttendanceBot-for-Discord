import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  DISCORD_BOSS_USER_IDS: z.string().default(""),
  DB_PROVIDER: z.enum(["postgres", "sheets"]).default("postgres"),
  DATABASE_URL: z.string().default(""),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  COMPANY_TIMEZONE: z.string().default("Asia/Ho_Chi_Minh"),
  GOOGLE_CALENDAR_ID: z.string().default("primary"),
  GOOGLE_SCHEDULE_CALENDAR_ID: z.string().optional(),
  GOOGLE_SHEETS_ID: z.string().optional(),
  GOOGLE_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional()
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const parsed = envSchema.parse(process.env);

  return {
    discord: {
      botToken: parsed.DISCORD_BOT_TOKEN,
      clientId: parsed.DISCORD_CLIENT_ID,
      guildId: parsed.DISCORD_GUILD_ID,
      channelId: parsed.DISCORD_CHANNEL_ID,
      bossUserIds: parsed.DISCORD_BOSS_USER_IDS.split(",").map((id) => id.trim()).filter(Boolean)
    },
    dbProvider: parsed.DB_PROVIDER,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    companyTimezone: parsed.COMPANY_TIMEZONE,
    google: {
      calendarId: parsed.GOOGLE_CALENDAR_ID,
      scheduleCalendarId: parsed.GOOGLE_SCHEDULE_CALENDAR_ID,
      sheetsId: parsed.GOOGLE_SHEETS_ID,
      clientEmail: parsed.GOOGLE_CLIENT_EMAIL,
      privateKey: parsed.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    }
  };
}
