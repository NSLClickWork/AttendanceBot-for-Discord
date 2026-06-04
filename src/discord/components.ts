import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder
} from "discord.js";
import type { AttendanceSession, Employee, OtRequest, WeeklyAvailability, ShiftTask } from "../domain";

export const IDS = {
  panel: "panel",
  checkin: "attendance_checkin",
  checkout: "attendance_checkout",
  continueWorking: "attendance_continue_working",
  addEmployee: "employee_add_open",
  deleteEmployee: "employee_delete_open",
  deleteEmployeeSelect: "employee_delete_select",
  approveEmployee: "employee_approve",
  reportOt: "ot_report_open",
  otManagerApprove: "ot_manager_approve",
  otManagerReject: "ot_manager_reject",
  otBossApprove: "ot_boss_approve",
  otBossReject: "ot_boss_reject",
  submitSchedule: "schedule_submit_open",
  deleteSchedule: "schedule_delete_open",
  deleteScheduleSelect: "schedule_delete_select",
  syncCalendar: "sync_calendar",
  payslip: "open_payslip_modal",
  confirmCheckout: "attendance_confirm_checkout",
  updateTaskDone: "update_task_done",
  updateTaskProgress: "update_task_progress",
  updateTaskNotYet: "update_task_not_yet"
} as const;

export function panelContent(dbLink?: string | null) {
  const embed = new EmbedBuilder()
    .setTitle('🏢 HR Team: Attendance & Shift Dashboard')
    .setDescription('Click the buttons below to check in, check out, or manage your schedule. No commands needed!\n' + (dbLink ? `\n🔗 **Database:** [View Google Sheet](${dbLink})` : ''))
    .setColor('#9b59b6')
    .setFooter({ text: 'NSL Bot System • Designed by Khoi Nguyen (Tom)' });

  return {
    content: "",
    embeds: [embed],
    components: [
      row(
        button(IDS.checkin, "Check in", ButtonStyle.Primary),
        button(IDS.checkout, "Check out", ButtonStyle.Secondary),
        button(IDS.addEmployee, "Add employee", ButtonStyle.Secondary),
        button(IDS.deleteEmployee, "Delete employee", ButtonStyle.Danger)
      ),
      row(
        button(IDS.reportOt, "Report OT", ButtonStyle.Secondary),
        button(IDS.submitSchedule, "Submit weekly schedule", ButtonStyle.Secondary),
        button(IDS.deleteSchedule, "Delete Schedule", ButtonStyle.Secondary),
        button(IDS.syncCalendar, "Sync Calendar", ButtonStyle.Secondary),
        button(IDS.payslip, "Payslip (Dùng /payslip để up QR)", ButtonStyle.Secondary)
      )
    ]
  };
}

export function checkoutReminderComponents() {
  return [
    row(
      button(IDS.checkout, "Check out", ButtonStyle.Primary),
      button(IDS.continueWorking, "Continue working", ButtonStyle.Secondary),
      button(IDS.reportOt, "Report OT", ButtonStyle.Secondary)
    )
  ];
}

export function weeklyScheduleReminderComponents() {
  return [row(button(IDS.submitSchedule, "Submit weekly schedule", ButtonStyle.Primary))];
}

export function employeeApprovalContent(employee: Employee) {
  return {
    content: `New employee pending approval:\n**${employee.name}** <@${employee.discordUserId}>\nTeam: ${employee.team}\nManager: <@${employee.managerDiscordUserId}>`,
    components: [row(button(`${IDS.approveEmployee}:${employee.id}`, "Approve", ButtonStyle.Primary))]
  };
}

export function employeeDeleteComponents(employees: Employee[]) {
  if (employees.length === 0) {
    return { content: "No approved employees found.", components: [] };
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(IDS.deleteEmployeeSelect)
    .setPlaceholder("Select employee to delete")
    .addOptions(
      employees.slice(0, 25).map((employee) => ({
        label: `${employee.name}`.slice(0, 100),
        description: `${employee.email || employee.team || employee.discordUserId}`.slice(0, 100),
        value: employee.id
      }))
    );
  return { content: "Select employee to delete:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

export function scheduleDeleteComponents(availabilities: WeeklyAvailability[]) {
  const valid = availabilities.filter((availability) => availability.availableSlots.length > 0);
  if (valid.length === 0) {
    return { content: "You haven't submitted any schedules yet.", components: [] };
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(IDS.deleteScheduleSelect)
    .setPlaceholder("Select schedule to delete")
    .addOptions(
      valid.slice(0, 25).map((availability) => ({
        label: `Week of ${availability.weekStart}`.slice(0, 100),
        value: availability.id
      }))
    );
  return { content: "Select schedule to delete:", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
}

export function otManagerApprovalContent(input: { request: OtRequest; employeeName: string }) {
  return {
    content: `OT pending manager approval:\n**${input.employeeName}**\nReason: ${input.request.reason}`,
    components: [
      row(
        button(`${IDS.otManagerApprove}:${input.request.id}`, "Manager approve", ButtonStyle.Primary),
        button(`${IDS.otManagerReject}:${input.request.id}`, "Reject", ButtonStyle.Danger)
      )
    ]
  };
}

export function otBossApprovalContent(input: { request: OtRequest; employeeName: string }) {
  return {
    content: `OT approved by manager, pending boss approval:\n**${input.employeeName}**\nReason: ${input.request.reason}`,
    components: [
      row(
        button(`${IDS.otBossApprove}:${input.request.id}`, "Boss approve", ButtonStyle.Primary),
        button(`${IDS.otBossReject}:${input.request.id}`, "Reject", ButtonStyle.Danger)
      )
    ]
  };
}

function row(...components: ButtonBuilder[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...components);
}

function button(customId: string, label: string, style: ButtonStyle) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

export function checkoutTasksPanel(tasks: ShiftTask[]) {
  if (tasks.length === 0) {
    return {
      content: "No tasks were recorded for this shift. Do you want to check out?",
      components: [row(button(IDS.confirmCheckout, "✅ Confirm Checkout", ButtonStyle.Success))]
    };
  }

  const lines = tasks.map(t => {
    let emoji = "🔴";
    if (t.status === "DONE") emoji = "🟢";
    if (t.status === "IN_PROGRESS") emoji = "🟡";
    return `${emoji} ${t.description}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("Shift Tasks Status")
    .setDescription(lines.join("\n"))
    .setColor(0x2b2d31);

  const doneMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.updateTaskDone)
    .setPlaceholder("Mark tasks as DONE 🟢")
    .setMinValues(1)
    .setMaxValues(Math.min(tasks.length, 25))
    .addOptions(tasks.map(t => ({ label: t.description.slice(0, 100), value: t.id })));

  const progressMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.updateTaskProgress)
    .setPlaceholder("Mark tasks as IN PROGRESS 🟡")
    .setMinValues(1)
    .setMaxValues(Math.min(tasks.length, 25))
    .addOptions(tasks.map(t => ({ label: t.description.slice(0, 100), value: t.id })));

  const notYetMenu = new StringSelectMenuBuilder()
    .setCustomId(IDS.updateTaskNotYet)
    .setPlaceholder("Mark tasks as NOT YET 🔴")
    .setMinValues(1)
    .setMaxValues(Math.min(tasks.length, 25))
    .addOptions(tasks.map(t => ({ label: t.description.slice(0, 100), value: t.id })));

  return {
    content: "Please update your task statuses, then click **Confirm Checkout**:",
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(doneMenu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(progressMenu),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(notYetMenu),
      row(button(IDS.confirmCheckout, "✅ Confirm Checkout", ButtonStyle.Success))
    ]
  };
}
