import type {
  AttendanceRepository,
  AuditRepository,
  EmployeeRepository,
  OtRepository,
  ScheduleRepository,
  UsageRepository
} from "../repositories/types";
import type { CalendarGateway } from "../calendar/google-calendar";
import type { SchedulePlanner } from "../ai/schedule-planner";
import type { ReminderScheduler } from "./reminders";
import type { Clock } from "./clock";
import { AttendanceService } from "./attendance";
import { EmployeeService } from "./employees";
import { OtService } from "./ot";
import { ReportService } from "./reports";
import { ScheduleService } from "./schedules";
import { ChatAssistantService } from "./chat-assistant";
import { UsageService } from "./usage";

export interface Services {
  employees: EmployeeService;
  attendance: AttendanceService;
  ot: OtService;
  schedules: ScheduleService;
  reports: ReportService;
  usage: UsageService;
  chatAssistant: ChatAssistantService;
  calendar: CalendarGateway;
}

export function createServices(input: {
  repositories: EmployeeRepository &
    AttendanceRepository &
    OtRepository &
    ScheduleRepository &
    AuditRepository &
    UsageRepository;
  reminders: ReminderScheduler;
  planner: SchedulePlanner;
  calendar: CalendarGateway;
  bossUserIds: string[];
  timezone: string;
  clock: Clock;
  scheduleCalendarId?: string;
}): Services {
  const employees = new EmployeeService(input.repositories, input.repositories);
  const attendance = new AttendanceService(
    employees,
    input.repositories,
    input.reminders,
    input.repositories,
    input.clock
  );
  const ot = new OtService(employees, input.repositories, input.repositories, input.repositories, input.bossUserIds);
  const schedules = new ScheduleService(
    employees,
    input.repositories,
    input.repositories,
    input.planner,
    input.calendar,
    input.repositories,
    input.timezone,
    input.scheduleCalendarId
  );
  const reports = new ReportService(input.repositories, input.repositories, input.repositories);
  const usage = new UsageService(input.repositories);
  const chatAssistant = new ChatAssistantService(attendance, usage);

  return { employees, attendance, ot, schedules, reports, usage, chatAssistant, calendar: input.calendar };
}
