import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from "discord.js";
import type { AttendanceSession, Employee, OtRequest, WeeklyAvailability } from "../domain";

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
  payslip: "open_payslip_modal"
} as const;

export function panelContent(employee: Employee | null, openSession: AttendanceSession | null, dbLink?: string | null) {
  const status = employee
    ? employee.status === "APPROVED"
      ? openSession
        ? `Working since ${openSession.checkinAt.toLocaleString()}`
        : "Ready to check in"
      : `Profile: ${employee.status}`
    : "No employee profile found";

  return {
    content: [`**IT Attendance Bot**`, `Trang thai: ${status}`, dbLink ? `Database: ${dbLink}` : ""].filter(Boolean).join("\n"),
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
        button(IDS.payslip, "Payslip", ButtonStyle.Secondary)
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
