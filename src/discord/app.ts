import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  AttachmentBuilder,
  EmbedBuilder,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Interaction,
  type MessageCreateOptions
} from "discord.js";
import type { AppConfig } from "../config";
import type { Services } from "../services/container";
import { AppError } from "../services/errors";
import type { ReminderDelivery } from "../jobs/reminder-queue";
import type { CheckoutReminderKind } from "../services/reminders";
import { nextMondayIso, parseDateTime, parseDateTimeInTz, getTodayStrInTz, parseSlotLines } from "../utils/parsers";
import { registerDiscordCommands } from "./commands";
import {
  checkoutReminderComponents,
  employeeApprovalContent,
  employeeDeleteComponents,
  IDS,
  otBossApprovalContent,
  otManagerApprovalContent,
  panelContent,
  scheduleDeleteComponents,
  weeklyScheduleReminderComponents,
  checkoutTasksPanel
} from "./components";
import {
  checkinTasksModal,
  employeeAddModal,
  otReportModal,
  scheduleSubmitModal,
  payslipSubmitModal,
  checkoutNoteModal,
  retroCheckinModal
} from "./modals";

interface PendingPayslip {
  formFields: Record<string, string | undefined>;
  timestamp: number;
}
const userQrCache = new Map<string, string>();
const pendingPayslipForms = new Map<string, PendingPayslip>();

export function createDiscordApp(config: AppConfig, services: Services) {
  const token = requireEnv(config.discord.botToken, "DISCORD_BOT_TOKEN");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once(Events.ClientReady, async () => {
    if (config.discord.clientId) {
      await registerDiscordCommands({ token, clientId: config.discord.clientId, guildId: config.discord.guildId });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteraction(interaction, services, config);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const text = message.content.toLowerCase();
    if (text.includes("payslip")) {
      await message.reply({
        content: "Create NSL payslip from the bot panel."
      });
      return;
    }

    if (pendingPayslipForms.has(message.author.id)) {
      if (!message.channel.isDMBased()) {
        const warning = await message.reply("Please check your **Direct Messages (DMs)** and send the image there for privacy! This message will be deleted.");
        setTimeout(() => {
          warning.delete().catch(() => {});
          message.delete().catch(() => {});
        }, 5000);
        return;
      }

      const pending = pendingPayslipForms.get(message.author.id)!;
      const attachment = message.attachments.first();
      
      let processPayslip = false;
      if (attachment && attachment.contentType?.startsWith("image/")) {
        pending.formFields.qr_path = attachment.url;
        processPayslip = true;
      } else if (text === "skip") {
        processPayslip = true;
      }

      if (processPayslip) {
        pendingPayslipForms.delete(message.author.id);
        const processingMsg = await message.reply("Processing your payslip...");
        try {
          const pdf = await createPayslipPdf(pending.formFields);
          await processingMsg.edit({
            content: `Payslip created: ${pdf.filename}`,
            files: [new AttachmentBuilder(pdf.buffer, { name: pdf.filename })]
          });
        } catch (err) {
          await processingMsg.edit("Failed to create payslip. Please try again.");
          console.error(err);
        }
        return;
      }
    }
    if (message.channel.isDMBased()) {
      const reply = await services.chatAssistant.handle({
        userId: message.author.id,
        channelId: message.channel.id,
        text: message.content,
        messageTs: message.id,
        isDirectMessage: true
      });
      await message.reply(reply.text);
    }
  });

  const delivery: ReminderDelivery = {
    async checkoutReminder(userId: string, text: string, kind: CheckoutReminderKind) {
      const content =
        kind === "INITIAL_4H"
          ? "You have worked for more than 4 hours. Do you want to check out?"
          : "2 hours have passed. Do you want to check out now?";
      await sendDm(client, userId, { content: `${content}\n${text}`, components: checkoutReminderComponents() as any });
    },
    async weeklyScheduleReminder(targetId: string, direct: boolean) {
      const payload = {
        content: direct
          ? "Please submit your working schedule for next week."
          : "It's time to submit your schedule for next week.",
        components: weeklyScheduleReminderComponents() as any
      };
      if (direct) {
        await sendDm(client, targetId, payload);
      } else {
        const channel = await client.channels.fetch(targetId);
        if (channel?.isTextBased() && "send" in channel) await channel.send(payload);
      }
    }
  };

  return {
    client,
    delivery,
    async start() {
      await client.login(token);
    },
    async stop() {
      client.destroy();
    }
  };
}

async function handleInteraction(interaction: Interaction, services: Services, config: AppConfig) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, services, config);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction, services, config);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction, services, config);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction, services, config);
    }
  } catch (error) {
    await replyError(interaction, error);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction, services: Services, config: AppConfig) {
  if (interaction.commandName === "setup_attendance_dashboard") {
    await interaction.reply({ ...(await buildPanel(interaction.user.id, services, config)) } as any);
    return;
  }
  if (interaction.commandName === "diemdanhbu") {
    await interaction.showModal(retroCheckinModal());
    return;
  }
  if (interaction.commandName === "payslip") {
    const qrAttachment = interaction.options.getAttachment("qr");
    if (qrAttachment) {
      // Store the online URL of the Discord attachment in-memory
      userQrCache.set(interaction.user.id, qrAttachment.url);
      
      // Auto-clean cache after 10 minutes if modal is not submitted
      setTimeout(() => {
        if (userQrCache.get(interaction.user.id) === qrAttachment.url) {
          userQrCache.delete(interaction.user.id);
        }
      }, 10 * 60 * 1000);
    }
    await interaction.showModal(payslipSubmitModal());
  }
}

async function handleButton(interaction: any, services: Services, config: AppConfig) {
  const customId = interaction.customId as string;
  const actor = interaction.user.id as string;

  if (customId === IDS.addEmployee) {
    await interaction.showModal(employeeAddModal());
    return;
  }
  if (customId === IDS.reportOt) {
    await interaction.showModal(otReportModal());
    return;
  }
  if (customId === IDS.submitSchedule) {
    await interaction.showModal(scheduleSubmitModal());
    return;
  }
  if (customId === IDS.payslip) {
    await interaction.showModal(payslipSubmitModal());
    return;
  }
  if (customId === IDS.checkin) {
    await interaction.showModal(checkinTasksModal());
    return;
  }
  if (customId === IDS.confirmCheckout) {
    await interaction.showModal(checkoutNoteModal());
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (customId === IDS.checkout) {
    const tasks = await services.attendance.getOpenSessionTasks(actor);
    await interaction.editReply(checkoutTasksPanel(tasks) as any);
    return;
  }
  if (customId === IDS.continueWorking) {
    await services.attendance.continueWorking(actor);
    await interaction.editReply("Continue working logged. Bot will remind you again in 2 hours.");
    return;
  }
  if (customId === IDS.deleteEmployee) {
    if (!(await services.employees.isManagerOrBoss(actor, bossIds(config)))) {
      await interaction.editReply("Only manager, HR, or boss can delete employees.");
      return;
    }
    await interaction.editReply(employeeDeleteComponents(await services.employees.listApproved()) as any);
    return;
  }
  if (customId === IDS.deleteSchedule) {
    await interaction.editReply(scheduleDeleteComponents(await services.schedules.listMyAvailability(actor)) as any);
    return;
  }
  if (customId === IDS.syncCalendar) {
    const result = await syncMyCalendar(actor, services);
    await interaction.editReply(result);
    return;
  }
  if (customId.startsWith(`${IDS.approveEmployee}:`)) {
    const employeeId = customId.split(":")[1];
    const pendingEmployee = await services.employees.getById(employeeId);
    if (!pendingEmployee) {
      await interaction.editReply("Employee not found.");
      return;
    }
    if (pendingEmployee.managerDiscordUserId !== actor && !bossIds(config).includes(actor)) {
      await interaction.editReply("Only direct manager or boss can approve this employee.");
      return;
    }
    const employee = await services.employees.approve(employeeId, actor);
    await sendDm(interaction.client, employee.discordUserId, {
      content: "Your profile has been approved. You can now check in/check out."
    });
    await interaction.editReply(`Approved ${employee.name}.`);
    return;
  }
  if (customId.startsWith(`${IDS.otManagerApprove}:`)) {
    const request = await services.ot.managerApprove(customId.split(":")[1], actor);
    const employee = await services.employees.getById(request.employeeId);
    await Promise.all(
      bossIds(config).map((bossId) =>
        sendDm(interaction.client, bossId, otBossApprovalContent({ request, employeeName: employee?.name ?? request.employeeId }) as any)
      )
    );
    await interaction.editReply("OT approved by manager.");
    return;
  }
  if (customId.startsWith(`${IDS.otManagerReject}:`)) {
    await services.ot.managerReject(customId.split(":")[1], actor);
    await interaction.editReply("OT rejected by manager.");
    return;
  }
  if (customId.startsWith(`${IDS.otBossApprove}:`)) {
    await services.ot.bossApprove(customId.split(":")[1], actor);
    await interaction.editReply("OT approved.");
    return;
  }
  if (customId.startsWith(`${IDS.otBossReject}:`)) {
    await services.ot.bossReject(customId.split(":")[1], actor);
    await interaction.editReply("OT rejected by boss.");
  }
}

async function handleSelect(interaction: any, services: Services, config: AppConfig) {
  const actor = interaction.user.id as string;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.customId === IDS.deleteEmployeeSelect) {
    if (!(await services.employees.isManagerOrBoss(actor, bossIds(config)))) {
      await interaction.editReply("Only manager, HR, or boss can delete employees.");
      return;
    }
    await services.employees.deleteEmployee(interaction.values[0], actor, bossIds(config));
    await interaction.editReply("Deleted employee successfully.");
    return;
  }

  if (interaction.customId === IDS.deleteScheduleSelect) {
    await services.schedules.deleteAvailability(interaction.values[0], actor);
    await interaction.editReply("Deleted schedule successfully.");
    return;
  }

  if (
    interaction.customId === IDS.updateTaskDone ||
    interaction.customId === IDS.updateTaskProgress ||
    interaction.customId === IDS.updateTaskNotYet
  ) {
    let status: import("../domain").TaskStatus = "NOT_YET";
    if (interaction.customId === IDS.updateTaskDone) status = "DONE";
    if (interaction.customId === IDS.updateTaskProgress) status = "IN_PROGRESS";

    await services.attendance.updateTaskStatuses(interaction.values, status);
    const tasks = await services.attendance.getOpenSessionTasks(actor);
    await interaction.editReply(checkoutTasksPanel(tasks) as any);
    return;
  }
}

async function handleModal(interaction: any, services: Services, config: AppConfig) {
  const actor = interaction.user.id as string;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.customId === "retro_checkin_submit") {
    const timeRaw = field(interaction, "time");
    const tasksRaw = field(interaction, "tasks");
    const tasks = tasksRaw.split("\n").map((t: string) => t.trim()).filter(Boolean);

    let checkinAt: Date;
    try {
      if (timeRaw.includes("-")) {
        checkinAt = parseDateTimeInTz(timeRaw, config.companyTimezone);
      } else {
        const [hh, mm] = timeRaw.split(":");
        if (!hh || !mm) throw new Error("Invalid time format");
        const todayStr = getTodayStrInTz(config.companyTimezone);
        checkinAt = parseDateTimeInTz(`${todayStr} ${timeRaw}`, config.companyTimezone);
      }
    } catch (err) {
      throw new AppError("Invalid time format. Please use YYYY-MM-DD HH:mm or HH:mm.", "INVALID_INPUT");
    }

    const previousNotYetTasks = await services.attendance.getPreviousSessionNotYetTasks(actor);
    const carriedOverTasks = previousNotYetTasks.map(t => {
      const desc = t.description.replace(/^\[(?:Ca trước|Prev)\]\s*/, '');
      return `[Prev] ${desc}`;
    });
    const allTasks = [...carriedOverTasks, ...tasks];

    const session = await services.attendance.checkIn(actor, { tasks: allTasks, checkinAt });
    
    let airtableMsg = "";
    if (services.airtable) {
      try {
        const pendingTasks = await services.airtable.getPendingTasks(actor);
        if (pendingTasks.length > 0) {
          const taskLines = pendingTasks.map((t, i) => `${i + 1}. **${t.name}** (Deadline: ${t.deadline || 'None'})`);
          airtableMsg = `\n\n📋 **Reminder! Your pending tasks:**\n${taskLines.join('\n')}`;
        } else {
          airtableMsg = `\n\n📋 **Reminder:** You have no pending tasks! Great job!`;
        }
      } catch (err) {
        console.error("Error fetching Airtable tasks", err);
      }
    }

    let notYetMsg = "";
    if (previousNotYetTasks.length > 0) {
      const lines = previousNotYetTasks.map((t, i) => `${i + 1}. **${t.description.replace(/^\[(?:Ca trước|Prev)\]\s*/, '')}**`);
      notYetMsg = `\n\n⚠️ **Carried over ${previousNotYetTasks.length} "NOT YET" tasks from previous shift:**\n${lines.join("\n")}`;
    }

    const timeStr = session.checkinAt.toLocaleString("en-GB", { timeZone: config.companyTimezone });
    await interaction.editReply(`Retroactively checked in at ${timeStr}.${notYetMsg}${airtableMsg}`);
    return;
  }

  if (interaction.customId === "checkin_submit") {
    const tasksRaw = field(interaction, "tasks");
    const tasks = tasksRaw.split("\n").map((t: string) => t.trim()).filter(Boolean);

    const previousNotYetTasks = await services.attendance.getPreviousSessionNotYetTasks(actor);
    const carriedOverTasks = previousNotYetTasks.map(t => {
      const desc = t.description.replace(/^\[(?:Ca trước|Prev)\]\s*/, '');
      return `[Prev] ${desc}`;
    });
    const allTasks = [...carriedOverTasks, ...tasks];

    const session = await services.attendance.checkIn(actor, { tasks: allTasks });
    
    let airtableMsg = "";
    if (services.airtable) {
      try {
        const pendingTasks = await services.airtable.getPendingTasks(actor);
        if (pendingTasks.length > 0) {
          const taskLines = pendingTasks.map((t, i) => `${i + 1}. **${t.name}** (Deadline: ${t.deadline || 'None'})`);
          airtableMsg = `\n\n📋 **Reminder! Your pending tasks:**\n${taskLines.join('\n')}`;
        } else {
          airtableMsg = `\n\n📋 **Reminder:** You have no pending tasks! Great job!`;
        }
      } catch (err) {
        console.error("Error fetching Airtable tasks", err);
      }
    }

    let notYetMsg = "";
    if (previousNotYetTasks.length > 0) {
      const lines = previousNotYetTasks.map((t, i) => `${i + 1}. **${t.description.replace(/^\[(?:Ca trước|Prev)\]\s*/, '')}**`);
      notYetMsg = `\n\n⚠️ **Carried over ${previousNotYetTasks.length} "NOT YET" tasks from previous shift:**\n${lines.join("\n")}`;
    }

    const timeStr = session.checkinAt.toLocaleString("en-GB", { timeZone: config.companyTimezone });
    await interaction.editReply(`Checked in at ${timeStr}.${notYetMsg}${airtableMsg}`);
    return;
  }

  if (interaction.customId === "checkout_note_submit") {
    const note = field(interaction, "note");
    const session = await services.attendance.checkOut(actor);
    const employee = await services.employees.getByDiscordId(actor);
    const tasks = await services.attendance.getTasksForSessionId(session.id);
    
    const tz = config.companyTimezone;
    const formatTime = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    const checkinStr = formatTime(session.checkinAt);
    const checkoutStr = session.checkoutAt ? formatTime(session.checkoutAt) : "N/A";
    const dateStr = session.checkinAt.toLocaleDateString("en-GB", { timeZone: tz });
    
    let taskLines: string[] = [];
    if (tasks.length > 0) {
      for (const t of tasks) {
        let emoji = "🔴";
        if (t.status === "DONE") emoji = "🟢";
        if (t.status === "IN_PROGRESS") emoji = "🟡";
        taskLines.push(`${emoji} **${t.description}**`);
      }
    } else {
      taskLines.push("*No tasks recorded*");
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${employee?.name || actor}'s Shift Report`, iconURL: interaction.user.displayAvatarURL() })
      .setColor(0x00ff00)
      .addFields(
        { name: "Date", value: dateStr, inline: true },
        { name: "Duration", value: `${checkinStr} - ${checkoutStr} (${session.durationMinutes} mins)`, inline: true },
        { name: "Tasks", value: taskLines.join("\n") }
      )
      .setTimestamp();
      
    if (note) {
      embed.addFields({ name: "Note", value: note, inline: false });
    }

    const targetChannelId = config.discord.channelId || "1511991414148436048";
    const channel = await interaction.client.channels.fetch(targetChannelId).catch(() => null);
    if (channel && channel.isTextBased() && "send" in channel) {
      await channel.send({ embeds: [embed] });
    }

    console.log("DEBUG: config.google.shiftCalendarId =", config.google.shiftCalendarId);
    if (session.checkoutAt && employee && config.google.shiftCalendarId) {
      try {
        const cleanTaskLines = taskLines.map(line => line.replace(/\*\*/g, "").replace(/\*/g, ""));
        const notesContent = [
          `Tasks:\n${cleanTaskLines.join("\n")}`,
          note ? `\nNote:\n${note}` : ""
        ].filter(Boolean).join("\n");

        await services.calendar.createEvents([{
          employeeId: employee.id,
          title: `Shift: ${employee.name}`,
          startAt: session.checkinAt.toISOString(),
          endAt: session.checkoutAt.toISOString(),
          notes: notesContent
        }], config.google.shiftCalendarId);
      } catch (err) {
        console.error("Failed to sync shift to calendar:", err);
      }
    }

    await interaction.editReply(`Checked out. Total time: ${session.durationMinutes} minutes.`);
    return;
  }

  if (interaction.customId === "employee_add_submit") {
    const managerId = field(interaction, "manager");
    if (!/^\d+$/.test(managerId)) {
      throw new AppError(
        "Manager Discord ID must be a sequence of numbers (e.g. 748166123052073152). Please copy the User ID of your manager, not their username.",
        "INVALID_INPUT"
      );
    }
    const employee = await services.employees.requestAdd(
      {
        discordUserId: actor,
        name: field(interaction, "name"),
        email: field(interaction, "email"),
        team: field(interaction, "team"),
        managerDiscordUserId: managerId
      },
      actor
    );
    await sendDm(interaction.client, employee.managerDiscordUserId, employeeApprovalContent(employee) as any);
    await interaction.editReply("Your profile request has been submitted. You can check in after approval.");
    return;
  }

  if (interaction.customId === "ot_report_submit") {
    const employee = await services.employees.getApprovedByDiscordId(actor);
    const request = await services.ot.report(actor, {
      startAt: parseDateTime(field(interaction, "start")),
      endAt: parseDateTime(field(interaction, "end")),
      reason: field(interaction, "reason")
    });
    await sendDm(interaction.client, employee.managerDiscordUserId, otManagerApprovalContent({ request, employeeName: employee.name }) as any);
    await interaction.editReply("OT request submitted to your manager.");
    return;
  }

  if (interaction.customId === "schedule_submit_submit") {
    await services.schedules.submitAvailability(actor, {
      weekStart: field(interaction, "week_start"),
      availableSlots: parseSlotLines(field(interaction, "available")),
      unavailableSlots: parseSlotLines(field(interaction, "unavailable")),
      notes: field(interaction, "notes")
    });
    await interaction.editReply("Received schedule for next week.");
    return;
  }

  if (interaction.customId === "payslip_submit") {
    const onlineQrUrl = userQrCache.get(actor);
    const formFields: Record<string, string | undefined> = {
      ...parsePipeField(field(interaction, "profile"), ["name", "position", "department"]),
      ...parsePipeField(field(interaction, "period"), ["year", "month", "monthly_salary"]),
      ...parsePipeField(field(interaction, "work"), ["full_days", "full_start", "part_days", "part_start"]),
      ...parsePipeField(field(interaction, "ot"), ["ot_day", "ot_hours", "ot_multiplier"]),
      ...parsePipeField(field(interaction, "bank"), ["ben_name", "bank", "account"])
    };

    if (onlineQrUrl) {
      formFields.qr_path = onlineQrUrl;
      const pdf = await createPayslipPdf(formFields);
      userQrCache.delete(actor);
      await interaction.editReply({
        content: `Payslip created: ${pdf.filename}`,
        files: [new AttachmentBuilder(pdf.buffer, { name: pdf.filename })]
      });
    } else {
      pendingPayslipForms.set(actor, { formFields, timestamp: Date.now() });
      await interaction.editReply("Form received! Please check your **Direct Messages (DMs)** with me to continue.");
      await sendDm(interaction.client, actor, "Please drag and drop your **QR Code image** here (or type `skip` if you don't have one). I'll wait for your image to generate the PDF.");
      
      setTimeout(() => {
        if (pendingPayslipForms.has(actor) && pendingPayslipForms.get(actor)?.timestamp === pendingPayslipForms.get(actor)?.timestamp) {
          pendingPayslipForms.delete(actor);
        }
      }, 5 * 60 * 1000); // Expire after 5 minutes
    }
  }
}

async function buildPanel(userId: string, services: Services, config: AppConfig) {
  const dbLink =
    (await services.employees.isManagerOrBoss(userId, bossIds(config))) && config.dbProvider === "sheets" && config.google.sheetsId
      ? `https://docs.google.com/spreadsheets/d/${config.google.sheetsId}`
      : null;
  return panelContent(dbLink);
}

async function syncMyCalendar(userId: string, services: Services) {
  const nextMonday = nextMondayIso();
  const availabilities = await services.schedules.listMyAvailability(userId);
  const nextWeek = availabilities.find(a => a.weekStart === nextMonday);
  
  if (!nextWeek || nextWeek.availableSlots.length === 0) {
    return "You haven't submitted your schedule for next week yet.";
  }

  const employee = await services.employees.getByDiscordId(userId);
  const name = employee ? employee.name : userId;

  const googleIds = await services.calendar.createEvents(
    nextWeek.availableSlots.map((slot) => ({
      employeeId: nextWeek.employeeId,
      title: `Work: ${name}`,
      startAt: `${slot.day}T${slot.start}:00+07:00`,
      endAt: `${slot.day}T${slot.end}:00+07:00`,
      notes: nextWeek.notes || "Submitted availability"
    }))
  );
  return `Synced ${googleIds.length} slots for next week to Google Calendar.`;
}

async function createPayslipPdf(form: Record<string, string | undefined>): Promise<{ buffer: Buffer; filename: string }> {
  return new Promise((resolve, reject) => {
    const pythonPath = "python";
    const scriptPath = path.join(process.cwd(), "src", "python_scripts", "cli.py");
    const child = spawn(pythonPath, [scriptPath, "-", "-"]);
    
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errChunks.push(chunk));
    
    child.on("close", (code) => {
      if (code !== 0) {
        const errStr = Buffer.concat(errChunks).toString("utf-8");
        reject(new Error(`Python process exited with code ${code}: ${errStr}`));
      } else {
        const buffer = Buffer.concat(chunks);
        const namePart = (form.name || "payslip").replace(/\s+/g, "_");
        const monthPart = form.month ? form.month.padStart(2, "0") : "";
        const yearPart = form.year || "";
        const filename = `Payslip_${namePart}_${monthPart}${yearPart}.pdf`;
        resolve({ buffer, filename });
      }
    });
    
    child.on("error", (err) => {
      reject(err);
    });
    
    child.stdin.write(JSON.stringify(form));
    child.stdin.end();
  });
}

function parsePipeField(value: string, keys: string[]) {
  const parts = value.split("|").map((part) => part.trim());
  return Object.fromEntries(keys.map((key, index) => [key, parts[index] ?? ""]));
}

function field(interaction: any, customId: string): string {
  return interaction.fields.getTextInputValue(customId)?.trim() ?? "";
}

function bossIds(config: AppConfig): string[] {
  return config.discord.bossUserIds;
}

async function sendDm(client: Client, userId: string, payload: string | MessageCreateOptions) {
  const user = await client.users.fetch(userId);
  await user.send(typeof payload === "string" ? { content: payload } : payload);
}

async function replyError(interaction: Interaction, error: unknown) {
  const message = error instanceof AppError || error instanceof Error ? error.message : "Unexpected error.";
  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral } as any).catch(() => {});
    }
  }
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
