import type { AuditRepository, AttendanceRepository, OtRepository } from "../repositories/types";
import type { OtRequest } from "../domain";
import { EmployeeService } from "./employees";
import { AppError, assertFound } from "./errors";

export class OtService {
  constructor(
    private readonly employees: EmployeeService,
    private readonly attendance: AttendanceRepository,
    private readonly ot: OtRepository,
    private readonly audit: AuditRepository,
    private readonly bossUserIds: string[]
  ) {}

  async report(discordUserId: string, input: { startAt: Date; endAt: Date; reason: string }): Promise<OtRequest> {
    if (input.endAt <= input.startAt) {
      throw new AppError("OT end time must be after start time.", "INVALID_OT_RANGE");
    }
    const employee = await this.employees.getApprovedByDiscordId(discordUserId);
    const openSession = await this.attendance.findOpenSession(employee.id);
    const request = await this.ot.createOtRequest({
      employeeId: employee.id,
      sessionId: openSession?.id ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      reason: input.reason
    });
    await this.audit.record({
      actorDiscordUserId: discordUserId,
      action: "OT_REPORTED",
      targetType: "ot_request",
      targetId: request.id,
      newStatus: request.status
    });
    return request;
  }

  async managerApprove(otRequestId: string, managerDiscordUserId: string): Promise<OtRequest> {
    const before = assertFound(await this.ot.findOtRequestById(otRequestId));
    const employee = assertFound(await this.employees.getById(before.employeeId));
    if (employee.managerDiscordUserId !== managerDiscordUserId) {
      throw new AppError("Only direct manager can approve step 1.", "NOT_DIRECT_MANAGER");
    }
    const updated = await this.ot.managerApprove(otRequestId, managerDiscordUserId);
    await this.audit.record({
      actorDiscordUserId: managerDiscordUserId,
      action: "OT_MANAGER_APPROVED",
      targetType: "ot_request",
      targetId: updated.id,
      oldStatus: before.status,
      newStatus: updated.status
    });
    return updated;
  }

  async managerReject(otRequestId: string, managerDiscordUserId: string): Promise<OtRequest> {
    const before = assertFound(await this.ot.findOtRequestById(otRequestId));
    const employee = assertFound(await this.employees.getById(before.employeeId));
    if (employee.managerDiscordUserId !== managerDiscordUserId) {
      throw new AppError("Only direct manager can reject step 1.", "NOT_DIRECT_MANAGER");
    }
    const updated = await this.ot.managerReject(otRequestId, managerDiscordUserId);
    await this.audit.record({
      actorDiscordUserId: managerDiscordUserId,
      action: "OT_MANAGER_REJECTED",
      targetType: "ot_request",
      targetId: updated.id,
      oldStatus: before.status,
      newStatus: updated.status
    });
    return updated;
  }

  async bossApprove(otRequestId: string, bossDiscordUserId: string): Promise<OtRequest> {
    this.assertBoss(bossDiscordUserId);
    const before = assertFound(await this.ot.findOtRequestById(otRequestId));
    if (before.status !== "PENDING_BOSS") {
      throw new AppError("OT must be approved by manager before boss.", "OT_NOT_READY_FOR_BOSS");
    }
    const updated = await this.ot.bossApprove(otRequestId, bossDiscordUserId);
    await this.audit.record({
      actorDiscordUserId: bossDiscordUserId,
      action: "OT_BOSS_APPROVED",
      targetType: "ot_request",
      targetId: updated.id,
      oldStatus: before.status,
      newStatus: updated.status
    });
    return updated;
  }

  async bossReject(otRequestId: string, bossDiscordUserId: string): Promise<OtRequest> {
    this.assertBoss(bossDiscordUserId);
    const before = assertFound(await this.ot.findOtRequestById(otRequestId));
    if (before.status !== "PENDING_BOSS") {
      throw new AppError("OT must be approved by manager before boss.", "OT_NOT_READY_FOR_BOSS");
    }
    const updated = await this.ot.bossReject(otRequestId, bossDiscordUserId);
    await this.audit.record({
      actorDiscordUserId: bossDiscordUserId,
      action: "OT_BOSS_REJECTED",
      targetType: "ot_request",
      targetId: updated.id,
      oldStatus: before.status,
      newStatus: updated.status
    });
    return updated;
  }

  private assertBoss(discordUserId: string) {
    if (!this.bossUserIds.includes(discordUserId)) {
      throw new AppError("Only boss can approve the final step.", "NOT_BOSS");
    }
  }
}
