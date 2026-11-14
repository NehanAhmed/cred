import { AuditLogParams } from "../types/audit.types.js";
import { AuditDatabaseAdapter } from "../types/deps.types.js";

export const logAuditEvent = async (params: AuditLogParams, deps: { auditDatabase?: AuditDatabaseAdapter }): Promise<void> => {
  if (!deps.auditDatabase) return;
  try {
    await deps.auditDatabase.create({
      user: params.user || null,
      action: params.action,
      status: params.status,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
      provider: params.provider || null,
      metadata: params.metadata || null,
    });
  } catch {
    console.error('Audit log error:', params.action, params.status);
  }
};
