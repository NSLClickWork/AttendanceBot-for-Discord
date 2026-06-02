import type { AuditRepository, EmployeeCreateInput, EmployeeRepository } from "../repositories/types";
import type { Employee } from "../domain";
import { AppError, assertFound } from "./errors";

export class EmployeeService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly audit: AuditRepository
  ) {}

  async requestAdd(input: EmployeeCreateInput, actorDiscordUserId: string): Promise<Employee> {
    const pendingEmployee = await this.employees.createPending(input);
    await this.audit.record({
      actorDiscordUserId,
      action: "EMPLOYEE_ADD_REQUESTED",
      targetType: "employee",
      targetId: pendingEmployee.id,
      newStatus: pendingEmployee.status
    });
    return pendingEmployee;
  }

  async approve(employeeId: string, actorDiscordUserId: string): Promise<Employee> {
    const before = assertFound(await this.employees.findById(employeeId));
    const employee = await this.employees.approve(employeeId);
    await this.audit.record({
      actorDiscordUserId,
      action: "EMPLOYEE_APPROVED",
      targetType: "employee",
      targetId: employee.id,
      oldStatus: before.status,
      newStatus: employee.status
    });
    return employee;
  }

  async deleteEmployee(employeeId: string, actorDiscordUserId: string, bossUserIds: string[] = []): Promise<void> {
    const before = assertFound(await this.employees.findById(employeeId));
    const actor = await this.employees.findByDiscordId(actorDiscordUserId);
    const canDelete =
      bossUserIds.includes(actorDiscordUserId) ||
      actor?.role === "BOSS" ||
      actor?.role === "HR" ||
      before.managerDiscordUserId === actorDiscordUserId;
    if (!canDelete) {
      throw new AppError("Only a manager, HR, or boss can delete employees.", "NOT_AUTHORIZED");
    }
    await this.employees.delete(employeeId);
    await this.audit.record({
      actorDiscordUserId,
      action: "EMPLOYEE_DELETED",
      targetType: "employee",
      targetId: employeeId,
      oldStatus: before.status
    });
  }

  async getApprovedByDiscordId(discordUserId: string): Promise<Employee> {
    const employee = await this.employees.findByDiscordId(discordUserId);
    if (!employee) {
      throw new AppError("Employee profile not found. Please click 'Add employee' to register.", "EMPLOYEE_NOT_FOUND");
    }
    if (employee.status !== "APPROVED") {
      throw new AppError("Your profile is pending approval. You cannot check in yet.", "EMPLOYEE_NOT_APPROVED");
    }
    return employee;
  }

  async getByDiscordId(discordUserId: string): Promise<Employee | null> {
    return this.employees.findByDiscordId(discordUserId);
  }

  async getById(employeeId: string): Promise<Employee | null> {
    return this.employees.findById(employeeId);
  }

  async listApproved(): Promise<Employee[]> {
    return this.employees.listApproved();
  }

  async isManagerOrBoss(discordUserId: string, bossUserIds: string[]): Promise<boolean> {
    if (bossUserIds.includes(discordUserId)) return true;
    const employee = await this.employees.findByDiscordId(discordUserId);
    if (employee?.role === "MANAGER" || employee?.role === "BOSS" || employee?.role === "HR") return true;
    const directReports = await this.employees.findByManagerDiscordId(discordUserId);
    return directReports.length > 0;
  }
}
