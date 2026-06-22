import type { Employee, ScheduleEventDraft, WeeklyAvailability } from "../domain";

export interface SchedulePlanner {
  generateDraft(input: {
    weekStart: string;
    employees: Employee[];
    availability: WeeklyAvailability[];
    timezone: string;
  }): Promise<ScheduleEventDraft[]>;
}

export class RuleBasedSchedulePlanner implements SchedulePlanner {
  async generateDraft(input: {
    weekStart: string;
    employees: Employee[];
    availability: WeeklyAvailability[];
    timezone: string;
  }): Promise<ScheduleEventDraft[]> {
    const employeesById = new Map(input.employees.map((employee) => [employee.id, employee]));

    return input.availability.flatMap((availability) => {
      const employee = employeesById.get(availability.employeeId);
      if (!employee) return [];

      return availability.availableSlots.map((slot) => ({
        employeeId: employee.id,
        title: `[${employee.team}] ${employee.name} - Shift`,
        startAt: `${slot.day}T${slot.start}:00`,
        endAt: `${slot.day}T${slot.end}:00`,
        notes: [
          availability.notes,
          `Discord user: ${employee.discordUserId}`,
          `Source: Discord bot weekly availability`,
          `Timezone: ${input.timezone}`
        ]
          .filter(Boolean)
          .join("\n")
      }));
    });
  }
}
