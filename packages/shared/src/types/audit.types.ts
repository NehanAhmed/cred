import type { AuditAction } from '@cred-kit/core';

export { AUDIT_ACTIONS } from '@cred-kit/core';
export type { AuditAction } from '@cred-kit/core';

/**
 * HTTP-layer audit parameters. Distinct from core's storage-level
 * `AuditLogInterface`: controllers pass a `userId`, and the storage adapter
 * maps it onto the nullable `user` reference.
 */
export interface AuditLogParams {
  userId?: string;
  action: AuditAction;
  status: 'success' | 'failure';
  ip?: string;
  userAgent?: string;
  provider?: 'local' | 'google' | 'github';
  metadata?: Record<string, unknown>;
}
