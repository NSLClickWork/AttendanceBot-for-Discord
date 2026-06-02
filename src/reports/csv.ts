import type { AttendanceSummaryRow } from "../domain";

function escapeCsv(value: string | number): string {
  let raw = String(value);
  if (/^[=+\-@]/.test(raw)) {
    raw = " " + raw;
  }
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function attendanceSummaryToCsv(rows: AttendanceSummaryRow[]): string {
  const header = [
    "employee_id",
    "employee_name",
    "team",
    "work_minutes",
    "approved_ot_minutes",
    "pending_ot_minutes",
    "missing_checkout_count"
  ];
  const body = rows.map((row) =>
    [
      row.employeeId,
      row.employeeName,
      row.team,
      row.workMinutes,
      row.approvedOtMinutes,
      row.pendingOtMinutes,
      row.missingCheckoutCount
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [header.join(","), ...body].join("\n");
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoString;
  }
}

export function scheduleDraftToCsv(draft: import("../domain").ScheduleDraft, employees: Map<string, import("../domain").Employee>): string {
  const header = [
    "No.",
    "Employee",
    "Team",
    "Shift",
    "Start Time",
    "End Time"
  ];
  const body = draft.aiOutput.map((event, index) => {
    const emp = employees.get(event.employeeId);
    let shiftTitle = event.title;
    // Clean up prefix if exists e.g. "[IT] Nguyen Viet Tien - Ca Sang" -> "Ca Sang"
    if (emp) {
      shiftTitle = shiftTitle.replace(new RegExp(`^\\[${emp.team}\\] ${emp.name} - `), "");
    }
    return [
      (index + 1).toString(),
      emp?.name ?? "Unknown",
      emp?.team ?? "Unknown",
      shiftTitle,
      formatDateTime(event.startAt),
      formatDateTime(event.endAt)
    ]
      .map(escapeCsv)
      .join(",");
  });

  return [header.join(","), ...body].join("\n");
}
