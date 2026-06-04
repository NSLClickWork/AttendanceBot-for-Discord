import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { nextMondayIso } from "../utils/parsers";

export function employeeAddModal() {
  return modal("employee_add_submit", "Add employee", [
    input("name", "Full name"),
    input("email", "Email"),
    input("team", "Team"),
    input("manager", "Manager Discord user ID, e.g. 123456789")
  ]);
}

export function checkinTasksModal() {
  return modal("checkin_submit", "Check-in Tasks", [
    input("tasks", "Tasks for this shift (one per line)", TextInputStyle.Paragraph, "", false)
  ]);
}

export function otReportModal() {
  return modal("ot_report_submit", "Report OT", [
    input("start", "Start time, e.g. 2026-05-29 19:00"),
    input("end", "End time, e.g. 2026-05-29 21:00"),
    input("reason", "OT Reason", TextInputStyle.Paragraph)
  ]);
}

export function scheduleSubmitModal() {
  return modal("schedule_submit_submit", "Weekly schedule", [
    input("week_start", "Week start YYYY-MM-DD", TextInputStyle.Short, nextMondayIso()),
    input(
      "available",
      "Available slots, one per line",
      TextInputStyle.Paragraph,
      "2026-06-01 09:00-13:00\n2026-06-02 14:00-18:00",
      false
    ),
    input("unavailable", "Unavailable slots, same format", TextInputStyle.Paragraph, "", false),
    input("notes", "Notes", TextInputStyle.Paragraph, "", false)
  ]);
}

export function payslipSubmitModal() {
  return modal("payslip_submit", "Payslip", [
    input("profile", "name|position|department", TextInputStyle.Paragraph, "Nguyen Van A|Developer|NSL Click & Work UG"),
    input("period", "year|month|salary", TextInputStyle.Short, "2026|5|1500"),
    input("work", "full_days|full_start|part_days|part_start", TextInputStyle.Short, "0,1,2,3,4|08:30|5|08:30"),
    input("ot", "ot_day|ot_hours|ot_multiplier", TextInputStyle.Short, "|4|1.5", false),
    input("bank", "beneficiary|bank|account", TextInputStyle.Paragraph, "Nguyen Van A||", false)
  ]);
}

function modal(customId: string, title: string, fields: TextInputBuilder[]) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(...fields.map((field) => new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
}

function input(
  customId: string,
  label: string,
  style: TextInputStyle = TextInputStyle.Short,
  value = "",
  required = true
) {
  const builder = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setRequired(required);
  if (value) builder.setValue(value);
  return builder;
}

export function checkoutNoteModal() {
  return modal("checkout_note_submit", "Checkout Summary", [
    input("note", "Note (optional)", TextInputStyle.Paragraph, "", false)
  ]);
}
