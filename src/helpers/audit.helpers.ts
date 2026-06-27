import auditLogModel from '../models/auditLog.models';
import { AuditLogParams } from '../types/audit.types';

export const logAuditEvent = async (params: AuditLogParams): Promise<void> => {
  try {
    await auditLogModel.create({
      user: params.userId || null,
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
