import pino from "pino";
import { RuleBasedSchedulePlanner } from "./ai/schedule-planner";
import { GoogleCalendarGateway } from "./calendar/google-calendar";
import { loadConfig } from "./config";
import { createPool } from "./db/pool";
import { BullReminderScheduler, createQueue, scheduleWeeklyReminder, startWorkers } from "./jobs/reminder-queue";
import { GoogleSheetsRepository } from "./repositories/google-sheets";
import { PostgresRepository } from "./repositories/postgres";
import { createServices } from "./services/container";
import { systemClock } from "./services/clock";
import { createDiscordApp } from "./discord/app";

const logger = pino({ name: "it-attendance-discord-bot" });

async function main() {
  const config = loadConfig();
  const pool = config.dbProvider === "postgres" ? createPool(config.databaseUrl) : null;
  const repository =
    config.dbProvider === "sheets"
      ? new GoogleSheetsRepository({
          spreadsheetId: requireEnv(config.google.sheetsId, "GOOGLE_SHEETS_ID"),
          clientEmail: requireEnv(config.google.clientEmail, "GOOGLE_CLIENT_EMAIL"),
          privateKey: requireEnv(config.google.privateKey, "GOOGLE_PRIVATE_KEY")
        })
      : new PostgresRepository(pool!);
  if (repository instanceof GoogleSheetsRepository) {
    await repository.initialize();
  }

  const { queue } = createQueue(config.redisUrl);
  const reminders = new BullReminderScheduler(queue);
  const planner = new RuleBasedSchedulePlanner();
  const calendar = new GoogleCalendarGateway({
    calendarId: config.google.calendarId,
    clientEmail: config.google.clientEmail,
    privateKey: config.google.privateKey,
    timezone: config.companyTimezone
  });

  const services = createServices({
    repositories: repository,
    reminders,
    planner,
    calendar,
    bossUserIds: config.discord.bossUserIds,
    timezone: config.companyTimezone,
    clock: systemClock,
    scheduleCalendarId: config.google.scheduleCalendarId
  });
  const discordApp = createDiscordApp(config, services);

  const worker = startWorkers({
    redisUrl: config.redisUrl,
    delivery: discordApp.delivery,
    employees: repository,
    attendance: repository,
    itChannelId: config.discord.channelId
  });
  await scheduleWeeklyReminder(queue, config.companyTimezone);

  await discordApp.start();
  logger.info("Discord attendance bot started.");

  const shutdown = async () => {
    logger.info("Shutting down.");
    await worker.close();
    await queue.close();
    discordApp.stop();
    await pool?.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error(error, "Fatal startup error.");
  process.exit(1);
});

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required when DB_PROVIDER=sheets.`);
  }
  return value;
}
