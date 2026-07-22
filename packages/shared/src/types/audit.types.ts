export const AUDIT_ACTIONS = [
  'register',
  'login',
  'logout',
  'token_refresh',
  'email_verification',
  'password_reset_request',
  'password_reset',
  'oauth_login',
  'profile_update',
  'password_change',
  'account_deletion',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogParams {
  userId?: string;
  action: AuditAction;
  status: 'success' | 'failure';
  ip?: string;
  userAgent?: string;
  provider?: 'local' | 'google' | 'github';
  metadata?: Record<string, unknown>;
}
