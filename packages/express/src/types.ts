import type {
  AuditDatabaseAdapter,
  EmailAdapter,
  JWTPayload,
  RefreshTokenDatabaseAdapter,
  UserDatabaseAdapter,
} from '@cred/core';

/**
 * The dependency bundle every core service takes. The Express adapter builds
 * the official MongoDB and email adapters from its config, or accepts
 * prebuilt implementations for custom backends, and injects them into core.
 */
export interface CredCoreDeps {
  userDatabase: UserDatabaseAdapter;
  refreshTokenDatabase: RefreshTokenDatabaseAdapter;
  auditDatabase?: AuditDatabaseAdapter;
  email: EmailAdapter;
}

/** Request metadata forwarded to core's audit logging. */
export interface CredRequestContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Per-request state populated by the auth middleware. Kept in `res.locals`
 * instead of augmenting Express's global `Request` type so consuming
 * applications do not inherit a package-specific request shape.
 */
export interface CredLocals {
  credUser?: JWTPayload;
}

/** OAuth providers supported by the adapter. */
export type CredOAuthProvider = 'google' | 'github';
