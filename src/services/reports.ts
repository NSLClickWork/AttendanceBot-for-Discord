import type { AttendanceRepository, EmployeeRepository, ScheduleRepository } from "../repositories/types";
import { attendanceSummaryToCsv, scheduleDraftToCsv } from "../reports/csv";

export class ReportService {
  constructor(
    private readonly attendance: AttendanceRepository,
    private readonly employees: EmployeeRepository,
    private readonly schedules: ScheduleRepository
  ) {}

  async attendanceCsv(from: Date, to: Date, employeeIds?: string[]): Promise<string> {
    const rows = await this.attendance.summarize(from, to, employeeIds);
    return attendanceSummaryToCsv(rows);
  }

  async attendanceSummary(from: Date, to: Date, employeeIds?: string[]) {
    return this.attendance.summarize(from, to, employeeIds);
  }

  async scheduleCsv(weekStart: string): Promise<string | null> {
    const draft = await this.schedules.findDraftByWeekStart(weekStart);
    if (!draft) {
      return null;
    }
    const employees = await this.employees.listApproved();
    const map = new Map(employees.map(e => [e.id, e]));
    return scheduleDraftToCsv(draft, map);
  }
}
