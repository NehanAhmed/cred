import { AuditLogParams } from "../types/audit.types.js";
import { AuditDatabaseAdapter, AuditErrorLogger } from "../types/deps.types.js";

export const logAuditEvent = async (
  params: AuditLogParams,
  deps: { auditDatabase?: AuditDatabaseAdapter; logger?: AuditErrorLogger },
): Promise<void> => {
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
  } catch (error) {
    // Audit failures must stay isolated from the operation being audited.
    deps.logger?.error('Audit log error:', params.action, params.status, error);
  }
};
