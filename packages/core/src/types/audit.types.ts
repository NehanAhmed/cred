
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
    user?: string | null;
    action: AuditAction;
    status: 'success' | 'failure';
    ip?: string | null;
    userAgent?: string | null;
    provider?: 'local' | 'google' | 'github' | null;
    metadata?: Record<string, unknown> | null;
}

export interface AuditLogInterface {
    user: string | null;
    action: AuditAction;
    status: 'success' | 'failure';
    ip: string | null;
    userAgent: string | null;
    provider: 'local' | 'google' | 'github' | null;
    metadata: Record<string, unknown> | null;
}