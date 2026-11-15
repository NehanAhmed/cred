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
