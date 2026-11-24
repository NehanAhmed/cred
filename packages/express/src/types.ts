import type {
  AuditDatabaseAdapter,
  EmailAdapter,
  JWTPayload,
  RefreshTokenDatabaseAdapter,
  UserDatabaseAdapter
} from '@cred-kit/core';

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
 * Per-request state populated by the auth middleware. `req.user` is also
 * augmented globally for host routes; `res.locals.credUser` remains the
 * router's internal channel so controllers do not depend on the global type.
 */
export interface CredLocals {
  credUser?: JWTPayload;
  credCsrfToken?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Verified access-token payload, set by the router's protected routes and
       * by `createAuthGuard`. Undefined on unauthenticated requests.
       */
      user?: JWTPayload;
    }
  }
}

/** OAuth providers supported by the adapter. */
export type CredOAuthProvider = 'google' | 'github';
