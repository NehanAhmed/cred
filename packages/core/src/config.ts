/**
 * Central configuration for every tunable constant in the cred-kit services.
 *
 * Values here are the single source of truth; service entry points merge a
 * caller-supplied `Partial<CredConfig>` over `defaultConfig`, so hosts can
 * override any lifetime without core re-reading environment variables (core
 * never touches `process.env` — wiring real values stays the host's job).
 */
export interface CredConfig {
    /** Access-token lifetime (jsonwebtoken `expiresIn` string). */
    accessTokenExpiry: string;
    /** Refresh-token lifetime in milliseconds. */
    refreshTokenTtlMs: number;
    /** bcrypt rounds used to hash refresh/verification/reset token secrets. */
    tokenHashRounds: number;
    /** bcrypt rounds used to hash user passwords. */
    passwordHashRounds: number;
    /** Failed-login attempts before the account is locked. */
    lockoutThreshold: number;
    /** How long an account stays locked after hitting the threshold. */
    lockoutDurationMs: number;
    /** Lifetime of email-verification tokens. */
    verificationTokenTtlMs: number;
    /** Lifetime of password-reset tokens. */
    resetTokenTtlMs: number;
    /** Maximum page size accepted by the audit-log listing. */
    auditMaxLimit: number;
    /** Default audit-log page size. */
    auditDefaultLimit: number;
}

export const defaultConfig: CredConfig = {
    accessTokenExpiry: '15m',
    refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    tokenHashRounds: 10,
    passwordHashRounds: 10,
    lockoutThreshold: 5,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
    verificationTokenTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    resetTokenTtlMs: 60 * 60 * 1000, // 1 hour
    auditMaxLimit: 100,
    auditDefaultLimit: 20,
};

/** Merges caller overrides over the defaults, field by field. */
export const resolveConfig = (overrides: Partial<CredConfig> = {}): CredConfig => ({
    ...defaultConfig,
    ...overrides,
});
