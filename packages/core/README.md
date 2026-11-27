<div align="center">

# @cred-kit/core

**Framework-agnostic, storage-agnostic authentication primitives for Node.js.**

Registration · email verification · password login · rotating refresh tokens · OAuth account linking · profiles · audit logs.

[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/package.json)
[![ESM only](https://img.shields.io/badge/modules-ESM%20only-f9a03c)](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/package.json)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/package.json)
[![Tested with Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/vitest.config.ts)

</div>

`@cred-kit/core` contains cred-kit's authentication domain logic as plain TypeScript functions. It hands you the hard parts of authentication — password hashing, verified email flows, single-use tokens, refresh-token rotation with reuse detection, account lockout, OAuth account linking, profile mutations, and audit events — while leaving the HTTP layer, database, mail transport, and OAuth strategy entirely to you.

The package ships **no HTTP server, no database driver, no mailer, and no Passport strategy**. You implement three small adapter interfaces (a fourth is optional) and pass them into each service call. There are no classes, singletons, or module-level mutable state, and core never reads `process.env`.

Runtime dependencies are only `bcryptjs`, `jsonwebtoken`, and `zod`.

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Design principles](#design-principles)
- [Configuration](#configuration)
- [Adapter contracts](#adapter-contracts)
- [API reference](#api-reference)
  - [Auth services](#auth-services)
  - [OAuth services](#oauth-services)
  - [Profile services](#profile-services)
  - [Audit services](#audit-services)
  - [Helpers](#helpers)
  - [Email templates](#email-templates)
  - [Validators](#validators)
- [Error handling](#error-handling)
- [Security model](#security-model)
- [Production checklist](#production-checklist)
- [Testing](#testing)
- [Project layout](#project-layout)
- [License](#license)

---

## Features

- **Registration and email verification** — bcrypt-hashed passwords, single-use verification tokens, and rollback when the verification email cannot be sent.
- **Password login** — login by email or username, `isVerified` enforcement, and a 5-attempt / 15-minute account lockout.
- **Rotating refresh tokens** — opaque `lookupId.secret` tokens, bcrypt-hashed at rest, grouped into families, with atomic single-use rotation and replay detection that revokes the whole family.
- **Access tokens** — HS256 JWTs with a `tokenType: 'access'` claim, 15-minute default lifetime, and a minimum secret length enforced before signing.
- **Password reset** — anti-enumeration responses, 1-hour single-use tokens, atomic consumption, and revocation of every refresh token before the password changes.
- **OAuth account linking** — Google and GitHub profile linking that only trusts provider-verified emails, plus safe account creation with a sanitized unique username.
- **Profile management** — read, partial update, password change, and account deletion, with password and token material always stripped from returned users.
- **Audit logging** — structured events for every auth action, written fire-and-forget so an audit-store outage can never fail an auth operation.
- **Opt-in validation** — Zod 4 schemas exported for your HTTP layer; the services themselves deliberately do not validate.
- **Fully injectable** — every dependency arrives as an argument, so the entire package is testable with in-memory fakes.

---

## Requirements

| Requirement | Details |
|---|---|
| Node.js | **22 or newer** (`engines.node: ">=22"`) |
| Module system | **ESM only** — `dist/index.mjs` with `dist/index.d.mts` types. There is no CommonJS build. |
| TypeScript | Built with TypeScript 6. Declarations (`.d.mts`) are bundled; use `NodeNext` or `bundler` module resolution. |
| Runtime peers | None. `bcryptjs`, `jsonwebtoken`, and `zod` are regular dependencies. |

CommonJS applications can load the package with dynamic `import()`.

---

## Installation

```bash
npm install @cred-kit/core
# or
pnpm add @cred-kit/core
# or
yarn add @cred-kit/core
```

Then implement the [adapter contracts](#adapter-contracts) for your storage, mail provider, and (optionally) audit store.

---

## How it works

Core owns the *rules*; your application owns the *edges*.

```text
┌─────────────────────────────────────────────┐
│ Your HTTP layer                             │
│ Express / Fastify / Hono / serverless       │
│                                             │
│ • parses and validates the request body     │
│ • authenticates the caller for profile APIs │
│ • maps AuthError to a response              │
│ • sets cookies / headers if it wants to     │
└──────────────────────┬──────────────────────┘
                       │ calls
                       ▼
┌─────────────────────────────────────────────┐
│ @cred-kit/core                                  │
│                                             │
│ register        verifyEmail    login        │
│ logout          refresh        forgot/reset │
│ findOrCreateOAuthUser          oauthCallback│
│ get/updateProfile  updatePassword           │
│ deleteAccount      getAuditLogs             │
└───────┬──────────────────────┬──────────────┘
        │                      │
        ▼                      ▼
  UserDatabaseAdapter     EmailAdapter
  RefreshTokenDatabase    AuditDatabaseAdapter
  Adapter                 (optional)
```

Every call follows the same idea: **input**, **dependencies**, sometimes **config**, sometimes **request context**. The service performs the domain operation and either returns a typed result or throws an `AuthError` with a stable code and an HTTP-friendly status.

Core does not:

- read environment variables,
- open database connections,
- send network requests directly,
- set cookies or headers,
- apply rate limits,
- validate request payloads automatically,
- know which framework you use.

---

## Quick start

The example below is Express-style pseudocode; the adapter objects are your implementations.

```ts
import {
  AuthError,
  login,
  loginSchema,
  logout,
  refresh,
  register,
  registerSchema,
} from '@cred-kit/core';
import {
  auditDatabase,
  email,
  refreshTokenDatabase,
  userDatabase,
} from './adapters.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

// POST /auth/register
app.post('/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);

    await register(
      input,
      { userDatabase, email, auditDatabase },
      { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
    );

    res.status(201).json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    next(error);
  }
});

// POST /auth/login
app.post('/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);

    const result = await login(
      input,
      { userDatabase, refreshTokenDatabase, auditDatabase },
      { jwtSecret: JWT_SECRET },
      { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
    );

    // result: { accessToken, refreshToken, user }
    // Cookie placement is a transport decision that core intentionally leaves to you.
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /auth/refresh — read the refresh token from wherever you stored it.
app.post('/auth/refresh', async (req, res, next) => {
  try {
    const result = await refresh(
      { rawToken: req.cookies?.refreshToken ?? '' },
      { userDatabase, refreshTokenDatabase, auditDatabase },
      { jwtSecret: JWT_SECRET },
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /auth/logout
app.post('/auth/logout', async (req, res, next) => {
  try {
    await logout(
      {
        rawToken: req.cookies?.refreshToken ?? '',
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      },
      { refreshTokenDatabase, auditDatabase },
    );

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
```

Map errors once, at the edge:

```ts
app.use((error, _req, res, _next) => {
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      metadata: error.metadata,
    });
  }

  return res.status(500).json({ success: false, code: 'INTERNAL_ERROR' });
});
```

> `JWT_SECRET` is required by `login`, `refresh`, and `oauthCallback`. It must be a non-empty string of **at least 32 characters**; access-token signing throws before issuing a token if it is not.

---

## Design principles

1. **Dependencies are explicit.** Every service receives `deps`; nothing is imported from a global container or configured at module load time.
2. **Storage stays behind the adapter boundary.** Core never inspects driver error codes. Adapters translate native uniqueness violations into `DuplicateKeyError`.
3. **The host owns policy and transport.** Cookies, CSRF, OAuth state, rate limiting, and request validation belong to your application.
4. **Token consumption is atomic.** Single-use guarantees depend on `findOneAndUpdate` being an atomic compare-and-set in your storage.
5. **Audit failures are isolated.** Audit writes are fire-and-forget and are swallowed on failure; they never change the result of the operation being audited.
6. **No hidden state.** There is no in-memory session store, cache, or configuration singleton.

---

## Configuration

All tunable constants live in `CredConfig`. Every service that accepts a config merges your partial overrides over `defaultConfig` with `resolveConfig`; you never need to supply the full object.

```ts
import { defaultConfig, resolveConfig, type CredConfig } from '@cred-kit/core';

defaultConfig;
// {
//   accessTokenExpiry: '15m',
//   refreshTokenTtlMs: 604800000,
//   tokenHashRounds: 10,
//   passwordHashRounds: 10,
//   lockoutThreshold: 5,
//   lockoutDurationMs: 900000,
//   verificationTokenTtlMs: 86400000,
//   resetTokenTtlMs: 3600000,
//   auditMaxLimit: 100,
//   auditDefaultLimit: 20,
// }

const config = resolveConfig({ lockoutThreshold: 8 });
```

| Key | Default | Description |
|---|---:|---|
| `accessTokenExpiry` | `'15m'` | `jsonwebtoken` `expiresIn` value for access tokens. |
| `refreshTokenTtlMs` | `604800000` | Refresh-token lifetime in milliseconds (7 days). |
| `tokenHashRounds` | `10` | bcrypt rounds for refresh, verification, and reset token secrets. |
| `passwordHashRounds` | `10` | bcrypt rounds for user passwords. |
| `lockoutThreshold` | `5` | Consecutive failed logins before the account locks. |
| `lockoutDurationMs` | `900000` | Lock duration in milliseconds (15 minutes). |
| `verificationTokenTtlMs` | `86400000` | Email-verification token lifetime (24 hours). |
| `resetTokenTtlMs` | `3600000` | Password-reset token lifetime (1 hour). |
| `auditMaxLimit` | `100` | Maximum accepted audit-log page size. |
| `auditDefaultLimit` | `20` | Default audit-log page size. |

Config parameter positions vary by service — see the exact signatures in the [API reference](#api-reference).

---

## Adapter contracts

Import the interfaces and error type from the package root. A complete reference implementation of all four adapters lives in [`src/__tests__/fakes.ts`](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/src/__tests__/fakes.ts).

### `UserDatabaseAdapter`

```ts
interface UserDatabaseAdapter {
  findOne(filter: Partial<User>): Promise<User | null>;
  create(user: CreateUserInput): Promise<User>;
  delete(id: string): Promise<void>;
  update(id: string, updates: Partial<User>): Promise<User>;
  findOneByTwoConditions(
    filter1: Partial<User>,
    filter2: Partial<User>,
  ): Promise<User | null>;
  incrementLoginAttempts(id: string): Promise<number>;
  findOneAndUpdate(
    condition: UserQuery,
    updates: Partial<User>,
  ): Promise<User | null>;
}
```

Contract requirements:

- **`findOneAndUpdate` must be atomic.** It is the compare-and-set used to consume verification and reset tokens and to claim refresh tokens. It must return the updated user or `null` when nothing matches, and a no-match **must not throw**.
- **`UserQuery` supports comparison operators.** `$gt`, `$gte`, `$lt`, `$lte`, and `$ne` are valid on any `User` field, for example `{ verificationTokenExpires: { $gt: new Date() } }`.
- **`findOneByTwoConditions` is an OR lookup.** Login passes `{ username }` and `{ email }` and expects the first user matching *either* filter. Undefined filter values must be ignored rather than matched.
- **`incrementLoginAttempts` returns the new attempt count.**
- **Uniqueness violations must be translated.** Catch your driver's native duplicate-key error (e.g. MongoDB `11000`) and throw `DuplicateKeyError` (optionally with the field name). Never let driver-specific errors escape into core.
- **`create` must return the stored user.** `register` uses the returned `id` for audit and rollback.

### `RefreshTokenDatabaseAdapter`

```ts
interface RefreshTokenDatabaseAdapter {
  findOne(filter: Partial<RefreshToken>): Promise<RefreshToken | null>;
  create(token: RefreshToken): Promise<RefreshToken>;
  delete(token: string): Promise<void>;
  update(id: string, updates: Partial<RefreshToken>): Promise<RefreshToken>;
  findOneAndUpdate(
    condition: Partial<RefreshToken>,
    updation: Partial<RefreshToken>,
  ): Promise<RefreshToken | null>;
  deleteMany(filter: Partial<RefreshToken>): Promise<void>;
}
```

Contract requirements:

- **`findOneAndUpdate` must be atomic.** Rotation claims a token with `{ lookupId, consumed: false } → { consumed: true }`; only one concurrent caller may win.
- **`findOne` is used with `{ lookupId }`.**
- **`deleteMany` is used with `{ family, user }` and `{ user }`.** It revokes every token for a user (`resetPassword`, `updatePassword`, `deleteAccount`) and revokes a whole family (`refresh` replay detection).
- **`delete` receives the stored token hash**, not the raw token. This is the value held in the record's `token` field.
- Records need an `id` if you implement the adapter's `update(id, …)` method; core's `RefreshToken` type describes the domain fields (`lookupId`, `token`, `user`, `family`, `expiresAt`, `consumed`).

### `EmailAdapter`

```ts
interface EmailAdapter {
  sendEmailVerification(email: string, rawToken: string): Promise<void>;
  sendPasswordReset(email: string, rawToken: string): Promise<void>;
}
```

The adapter receives the **raw** token. It is your job to build the link (for example `${CLIENT_URL}/verify-email/${rawToken}`) and send the message. Core exports minimal HTML bodies in [email templates](#email-templates) if you want consistent markup.

### `AuditDatabaseAdapter` (optional)

```ts
interface AuditDatabaseAdapter {
  create(audit: Partial<AuditLogInterface>): Promise<AuditLogInterface>;
  find(
    filter: AuditLogFilter,
    options: { skip: number; limit: number },
  ): Promise<AuditLogInterface[]>;
  count(filter: AuditLogFilter): Promise<number>;
}
```

Contract requirements:

- **`find` returns newest first** and honors `skip` and `limit`.
- **`count` returns the number of logs matching the filter.**
- **`create` may fail.** Core wraps it and drops errors, so an audit outage cannot break authentication.
- If you omit `auditDatabase` from a service's dependencies, audit writes become no-ops and every other behavior stays the same.

### Error translation

```ts
import { DuplicateKeyError } from '@cred-kit/core';

try {
  return await model.create(document);
} catch (error: any) {
  if (error?.code === 11000) {
    throw new DuplicateKeyError(Object.keys(error.keyPattern ?? {})[0]);
  }
  throw error;
}
```

`DuplicateKeyError` is the only storage-specific concern core knows about, and only as a neutral class.

---

## API reference

All services are exported from the package root. `context` always means `{ ip?: string; userAgent?: string }` unless noted otherwise. The exact signature order is shown for every function because config, context, and deps are not in a single universal order.

### Auth services

#### `register`

```ts
register(
  input: RegisterRequest,
  deps: {
    userDatabase: UserDatabaseAdapter;
    email: EmailAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  context?: { ip?: string; userAgent?: string },
  config?: Partial<CredConfig>,
): Promise<void>
```

`RegisterRequest` is `{ username, email, password, bio?, phoneNumber?, gender? }`.

What happens:

1. The email is trimmed and lowercased.
2. Username and email lookups run in parallel; if either exists, the call throws `USER_EXISTS` and audits the failure.
3. The password is hashed with `passwordHashRounds`.
4. A verification token is generated: a public 16-byte lookup id, a 32-byte secret, and a bcrypt hash of the secret. The raw token is `lookupId.secret`.
5. The user is created with the token hash, lookup id, and a `verificationTokenExpires` deadline (`verificationTokenTtlMs`, 24 hours by default).
6. The raw token is passed to `email.sendEmailVerification`.
7. If the email fails, core deletes the just-created user and throws `EMAIL_SEND_FAILED`. If that compensating delete also fails, `USER_DELETION_FAILED` is thrown instead.
8. Successful registration and the documented duplicate/exists/email failures are audited, including concurrent uniqueness races reported as `DuplicateKeyError`.

Returns nothing. The user must verify their email before password login succeeds.

#### `verifyEmail`

```ts
verifyEmail(
  token: string,
  deps: {
    userDatabase: UserDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  context?: { ip?: string; userAgent?: string },
): Promise<{ isVerified: true }>
```

The token's lookup id finds the user; the secret is checked against the stored bcrypt hash and the expiry deadline. Consumption and `isVerified: true` are applied in one conditional atomic update that also clears all verification-token fields. Unknown, malformed, expired, and already-used tokens all throw `INVALID_TOKEN` (400).

#### `login`

```ts
login(
  input: LoginRequest,
  deps: {
    userDatabase: UserDatabaseAdapter;
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  config: { jwtSecret: string } & Partial<CredConfig>,
  context?: { ip?: string; userAgent?: string },
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    bio?: string;
    phoneNumber?: string;
    gender?: 'male' | 'female' | 'other';
    avatar: string | null;
    provider: 'local' | 'github' | 'google';
    createdAt: Date;
    updatedAt: Date;
  };
}>
```

`LoginRequest` requires `password` and at least one of `email` or `username`.

Checks run in this order:

1. Account lock (`lockoutUntil` in the future) → `ACCOUNT_LOCKED`.
2. Provider must be `local` → otherwise `INVALID_LOGIN_METHOD`.
3. Email must be verified → otherwise `EMAIL_NOT_VERIFIED`.
4. bcrypt password comparison.

An unknown user or a wrong password both produce `INVALID_CREDENTIALS` (401). A wrong password increments `loginAttempts`; at `lockoutThreshold` the account is locked for `lockoutDurationMs`. Core only arms the lock when it is inactive, so repeated failures cannot extend an existing lock indefinitely.

On success, core clears `loginAttempts` and `lockoutUntil`, records `lastLogin` and `lastIp`, signs a 15-minute HS256 access token with `{ id, email, username, tokenType: 'access' }`, creates a fresh refresh-token family, and returns the tokens plus the user projection above. No password, verification token, reset token, lockout counter, or `isVerified` field is included in that projection.

#### `logout`

```ts
logout(
  context: {
    rawToken: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
  },
  deps: {
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
): Promise<void>
```

Logout is idempotent. When a token is present, core parses its lookup id, loads the record, verifies the bcrypt hash, and deletes **only that record**. A missing, malformed, or unknown token is a silent no-op. The event is audited as a successful logout either way. Other sessions are untouched.

#### `refresh`

```ts
refresh(
  context: {
    rawToken: string;
    ip?: string;
    userAgent?: string;
  },
  deps: {
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    userDatabase: UserDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  config: { jwtSecret: string } & Partial<CredConfig>,
): Promise<{ accessToken: string; refreshToken: string }>
```

Rotation algorithm:

1. An empty token throws `MISSING_TOKEN` (401).
2. The lookup id finds the record and the raw secret is verified against the stored bcrypt hash. A malformed token, unknown record, or hash mismatch throws `REFRESH_TOKEN_NOT_FOUND` (401).
3. The record is atomically claimed with `{ lookupId, consumed: false } → { consumed: true }`.
4. If the claim misses but the record now exists, the token was replayed: **delete the entire `{ family, user }` set** and throw `REFRESH_TOKEN_REUSE_DETECTED` (401). If the record no longer exists, throw `REFRESH_TOKEN_NOT_FOUND` (401).
5. An expired token throws `REFRESH_TOKEN_EXPIRED` (401). Note that the claim happens before this check, so an expired token is consumed by the attempt.
6. The owning user is loaded; if missing, `UNEXPECTED_ERROR_OCCURRED` (500) is thrown.
7. A successor is created in the **same family** with a fresh 7-day lifetime, and a new access token is signed.
8. The predecessor is re-read. If a concurrent replay revoked the family between issuing the successor and this check, the successor is deleted and `REFRESH_TOKEN_REUSE_DETECTED` is thrown.

Returns only the new token pair.

#### `forgotPassword`

```ts
forgotPassword(
  input: { email: string },
  deps: {
    userDatabase: UserDatabaseAdapter;
    email: EmailAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  context?: { ip?: string; userAgent?: string },
  config?: Partial<CredConfig>,
): Promise<{ message: string }>
```

This endpoint is intentionally non-enumerating:

- A blank email returns immediately.
- An unknown email returns the same generic message after a failure audit.
- A non-local (OAuth) account also returns the generic message after a failure audit.
- A local account gets a new reset token (bcrypt-hashed secret, lookup id, 1-hour expiry), the raw token is emailed, and the success is audited.

If the email send fails, the stored reset token, expiry, and lookup id are cleared before `EMAIL_SEND_FAILED` is thrown, so a stale link never remains valid.

The returned strings are:

```ts
// Unknown email, blank email, or social account:
'If an account exists, a password reset link has been sent'

// Successful local account:
'If an account exists, a password reset link has been sent.'
```

The only difference is the trailing period. Treat the response as opaque and do not compare or forward it in a way that leaks which branch ran.

#### `resetPassword`

```ts
resetPassword(
  input: { token: string; newPassword: string },
  deps: {
    userDatabase: UserDatabaseAdapter;
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  context?: { ip?: string; userAgent?: string },
  config?: Partial<CredConfig>,
): Promise<{ message: string }>
```

The token is validated by lookup id, expiry, and bcrypt comparison. Core then:

1. Hashes `newPassword` with `passwordHashRounds`.
2. Revokes **all** refresh tokens for the user.
3. Atomically consumes the reset token and replaces the password in one conditional update that also clears `loginAttempts` and `lockoutUntil`.

Revocation happens before the password write so a failure leaves the old password and the reset token intact, allowing the same link to be retried. Because revocation is not rolled back if the later update fails, a retry simply revokes again.

Returns `{ message: 'Password Updated.' }`. Password strength is **not** checked here — validate with `passwordResetSchema` or your own rules first.

### OAuth services

#### `findOrCreateOAuthUser`

```ts
findOrCreateOAuthUser(
  input: {
    provider: 'google' | 'github';
    profileId: string;
    email?: string;
    displayName?: string;
    avatar?: string;
    isEmailVerified: boolean;
  },
  deps: {
    userDatabase: UserDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  config?: Partial<CredConfig>,
): Promise<User>
```

Resolution order:

1. **Existing provider identity** — a user whose `googleId` or `githubId` equals `profileId` is returned unchanged.
2. **Verified email link** — only when `isEmailVerified` is `true` and an email is present. The normalized email is matched; the provider id is attached, the avatar is filled in only if the account has none, and a successful `oauth_login` audit is written **only when a local account is converted** to the provider. If the existing account already belongs to another provider, its `provider` field is preserved.
3. **New account** — a sanitized username is derived from `displayName` or the email local-part: lowercase, alphanumerics only, max 25 characters, a random `_<6 hex>` suffix when taken, or `user_<8 hex>` when nothing remains. The account is created with `isVerified: true`, the provider id, the avatar, and a random 32-byte bcrypt password that no one knows, so password login is impossible.

If `isEmailVerified` is `false`, email-based linking is skipped. If the provider's email collides with an existing account during creation, the adapter's `DuplicateKeyError` surfaces as `DUPLICATE_KEY` (400). This prevents account takeover through unverified addresses.

> **Linking changes the account's login method.** When a **local** account is linked through OAuth, its `provider` field is set to `google` or `github`. From then on, password login and `updatePassword` are rejected with `INVALID_LOGIN_METHOD` / `SOCIAL_LOGIN_ACCOUNT`. Decide whether that is the behavior you want before linking by verified email.

#### `oauthCallback`

```ts
oauthCallback(
  input: {
    user?: {
      id?: string;
      email?: string;
      username?: string;
      provider?: 'local' | 'google' | 'github';
    } | null;
    provider: 'google' | 'github';
  },
  deps: {
    userDatabase: UserDatabaseAdapter;
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  config: { jwtSecret: string } & Partial<CredConfig>,
  context?: { ip?: string; userAgent?: string },
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    provider?: 'local' | 'google' | 'github';
  };
}>
```

Call this after your OAuth strategy has authenticated the provider response and produced a user record. It validates that `id`, `email`, and `username` are present, updates `lastLogin` / `lastIp`, signs an access token, creates a fresh refresh-token family, and audits `oauth_login` using the **current request's** `provider`. The returned `user.provider` is the account's stored provider, which may differ if an account is linked to more than one provider.

Failures:

- Missing user → `OAUTH_FAILED` (401).
- Missing required user fields → `OAUTH_INVALID_USER` (401).
- Account no longer exists, or the metadata update throws → `OAUTH_FAILED` (401).
- The refresh-token adapter fails to persist the new token → `REFRESH_TOKEN_CREATION_FAILED` (500).

OAuth `state`, PKCE, callback URLs, and redirect handling are **not** part of core; they belong to your strategy and HTTP layer.

### Profile services

Profile services assume the caller is already authenticated — for example by verifying an access token with `verifyAccessToken` and passing `payload.id` as `userId`.

#### `getProfile`

```ts
getProfile(
  context: { userId: string },
  deps: { userDatabase: UserDatabaseAdapter },
): Promise<UserWithoutPassword>
```

Loads the user or throws `USER_NOT_FOUND` (404). The response is built from a fixed allowlist: `id`, `username`, `email`, `bio`, `phoneNumber`, `gender`, `avatar`, `provider`, `isVerified`, `googleId`, `githubId`, `lastLogin`, `lastIp`, `createdAt`, `updatedAt`. Password hashes, token hashes, lookup ids, expiry deadlines, login attempts, and lockout state never appear.

#### `updateProfile`

```ts
updateProfile(
  input: {
    username?: string;
    bio?: string;
    phoneNumber?: string;
    gender?: 'male' | 'female' | 'other';
  },
  context: { userId: string; ip?: string; userAgent?: string },
  deps: {
    userDatabase: UserDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
): Promise<UserWithoutPassword>
```

Only `!== undefined` fields are written, so omitted fields are untouched. There is no built-in validation; use `profileSchema` first. If the adapter throws `DuplicateKeyError` (for example a taken username), core maps it to `DUPLICATE_KEY` (400) with a `<field> is already taken` message and audits the failure. Unknown database errors are re-thrown unchanged.

#### `updatePassword`

```ts
updatePassword(
  input: { currentPassword: string; newPassword: string },
  context: { userId: string; ip?: string; userAgent?: string },
  deps: {
    userDatabase: UserDatabaseAdapter;
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
  config?: Partial<CredConfig>,
): Promise<UserWithoutPassword>
```

Requirements and effects:

- The account must exist (`USER_NOT_FOUND`, 404).
- The account must be `local` (`SOCIAL_LOGIN_ACCOUNT`, 400).
- `currentPassword` must match (`INVALID_CURRENT_PASSWORD`, 400).
- All refresh tokens are revoked **before** the password is replaced; if revocation fails, the password is unchanged and the caller can retry.
- The new password is hashed with `passwordHashRounds`; `loginAttempts` and `lockoutUntil` are reset.
- The updated public profile is returned.

Password strength is not validated here.

#### `deleteAccount`

```ts
deleteAccount(
  context: { userId: string; ip?: string; userAgent?: string },
  deps: {
    userDatabase: UserDatabaseAdapter;
    refreshTokenDatabase: RefreshTokenDatabaseAdapter;
    auditDatabase?: AuditDatabaseAdapter;
  },
): Promise<void>
```

Loads the user (`USER_NOT_FOUND`, 404), revokes every refresh token for the user, deletes the user, then audits `account_deletion`. If the deletion throws, no success audit is written. If the user is already gone, nothing is audited.

### Audit services

#### `getAuditLogs`

```ts
getAuditLogs(
  input: { userId: string; page?: number; limit?: number },
  deps: { auditDatabase: AuditDatabaseAdapter },
  config?: Partial<CredConfig>,
): Promise<{
  logs: AuditLogInterface[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}>
```

Pagination behavior:

- `page` is truncated to an integer and clamped to a minimum of `1`.
- `limit` is truncated and clamped to `1…auditMaxLimit` (default 100), defaulting to `auditDefaultLimit` (20).
- Non-finite values (`NaN`, `Infinity`) fall back to the defaults.
- `skip = (page - 1) * limit`.
- `totalPages = Math.ceil(total / limit)`; an empty result yields `0`.
- Ordering is newest-first **as guaranteed by your adapter's `find`**.

The repo's `AUDIT_ACTIONS` constant lists every action core emits:

```ts
[
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
]
```

`AuditLogInterface` fields are `user`, `action`, `status` (`success | failure`), `ip`, `userAgent`, `provider`, and `metadata`.

### Helpers

Token and JWT utilities are exported for middleware and custom flows:

| Export | Behavior |
|---|---|
| `generateToken(secretBytes = 32, config?)` | Returns `{ rawToken, hashedToken, lookupId }`. `lookupId` is 16 random bytes as 32 hex characters; `rawToken` is `${lookupId}.${secret}`; `hashedToken` is bcrypt(secret). Only the secret is hashed, because the full raw token can exceed bcrypt's 72-byte input limit. |
| `generateRefreshTokenData(config?)` | Adds a UUID `family` and a `refreshTokenTtlMs` deadline (7 days by default). |
| `generateAccessToken(user, secret, config?)` | Asserts the secret is a string of at least 32 characters, then signs `{ id, email, username, tokenType: 'access' }` with HS256 and `accessTokenExpiry`. |
| `verifyAccessToken(token, secret)` | Verifies HS256 and the `tokenType`, and requires `id`, `email`, and `username`. Missing, malformed, expired, wrong-secret, and refresh-type tokens all throw `AuthError('INVALID_TOKEN', '…', 401)`. |
| `hashToken(token, config?)` / `verifyToken(token, hash)` | bcrypt hash/compare for token secrets using `tokenHashRounds`. |
| `verifyRawToken(rawToken, hashedToken)` | Splits `lookupId.secret` and compares the secret. Returns `false` for malformed input instead of throwing. |
| `parseToken(rawToken)` | Returns `{ lookupId, secret }` or `null`. |
| `parseTokenLookupId(rawToken)` | Returns the lookup id or `null`. |
| `assertJwtSecret(secret)` | Assertion helper: throws unless the value is a non-empty string of at least 32 characters. |
| `logAuditEvent(params, { auditDatabase?, logger? })` | Fire-and-forget audit writer. Returns immediately when no audit database is configured; swallows `create` failures and reports them to the optional `AuditErrorLogger`. |
| `defaultConfig` / `resolveConfig(overrides?)` | Configuration defaults and merge helper. |

> Services call `logAuditEvent` with only the audit adapter, so audit errors are silently dropped during normal service calls. Pass an `AuditErrorLogger` only when you call `logAuditEvent` yourself.

### Email templates

Two minimal HTML fragments are exported for adapter authors:

```ts
emailVerification(verificationLink: string): string
passwordReset(resetLink: string, expiresAt: string): string
```

They return snippets, not complete HTML documents. Wrap them in your own email layout.

### Validators

Zod 4 schemas are exported for the HTTP layer. They are optional and are **not** applied by the services.

| Schema | Fields and rules |
|---|---|
| `registerSchema` | `username`: 3–30 chars; `email`: valid email; `password`: min 8 chars, at least one uppercase letter and one digit; `bio?`: 3–200 chars; `phoneNumber?`: 10–15 digits; `gender?`: `male \| female \| other`. Unknown keys are stripped. |
| `loginSchema` | `password`: min 1 char; `email?`: valid email; `username?`: string; refined so at least one of `email` or `username` is required. |
| `passwordForgotSchema` | `email`: valid email, required. |
| `passwordResetSchema` | `{ password }`: same password rules as registration. The service expects `{ token, newPassword }`, so rename the validated field in your handler. |
| `passwordChangeSchema` | `currentPassword`: min 1 char; `newPassword`: same password rules. |
| `profileSchema` | All fields optional: `username` 3–30; `bio` 3–200; `phoneNumber` 10–15 digits; `gender` enum. An empty object is valid. |

Recommended pattern:

```ts
const input = registerSchema.parse(req.body);
await register(input, deps, context);
```

Zod validation failures are yours to format — core never sees them.

---

## Error handling

Services throw `AuthError` for expected domain failures. Each instance carries:

```ts
class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly statusCode: number;
  readonly metadata?: Record<string, unknown>;
}
```

| Code | Status | Thrown by |
|---|---:|---|
| `USER_EXISTS` | 400 | `register` (pre-check or `DuplicateKeyError` race) |
| `USER_CREATION_FAILED` | 500 | `register` (adapter returned no user) |
| `USER_DELETION_FAILED` | 500 | `register` (rollback after email failure also failed) |
| `EMAIL_SEND_FAILED` | 500 | `register`, `forgotPassword` |
| `INVALID_TOKEN` | 400 | `verifyEmail`, `resetPassword` |
| `INVALID_TOKEN` | 401 | `verifyAccessToken` |
| `INVALID_CREDENTIALS` | 401 | `login` (unknown user or wrong password) |
| `ACCOUNT_LOCKED` | 401 | `login` |
| `INVALID_LOGIN_METHOD` | 400 | `login` (non-local account) |
| `EMAIL_NOT_VERIFIED` | 401 | `login` |
| `MISSING_TOKEN` | 401 | `refresh` (empty raw token) |
| `REFRESH_TOKEN_NOT_FOUND` | 401 | `refresh` |
| `REFRESH_TOKEN_EXPIRED` | 401 | `refresh` |
| `REFRESH_TOKEN_REUSE_DETECTED` | 401 | `refresh` (family revoked) |
| `REFRESH_TOKEN_CREATION_FAILED` | 500 | `login`, `refresh`, `oauthCallback` |
| `UNEXPECTED_ERROR_OCCURRED` | 500 | `refresh` (token's user no longer exists) |
| `USER_NOT_FOUND` | 404 | profile services |
| `SOCIAL_LOGIN_ACCOUNT` | 400 | `updatePassword` |
| `INVALID_CURRENT_PASSWORD` | 400 | `updatePassword` |
| `DUPLICATE_KEY` | 400 | `updateProfile`, `updatePassword`, `findOrCreateOAuthUser`; also defensive handling in `login` and `forgotPassword` |
| `OAUTH_FAILED` | 401 | `oauthCallback` |
| `OAUTH_INVALID_USER` | 401 | `oauthCallback` |

`AuthErrorCode` also declares `MISSING_CREDENTIALS` and `INVALID_EMAIL`. No shipped service currently throws either; they exist for adapters or host code.

Anything else is passed through unchanged: a database outage is not converted into an auth error, except where a service explicitly documents otherwise (for example `oauthCallback` maps a user-update failure to `OAUTH_FAILED`).

`DuplicateKeyError` is the storage-neutral uniqueness contract:

```ts
class DuplicateKeyError extends Error {
  constructor(public readonly field?: string);
}
```

---

## Security model

The values below are the shipped defaults and are enforced in code, not just documentation.

| Aspect | Shipped behavior |
|---|---|
| Password hashing | bcrypt, 10 rounds by default (`passwordHashRounds`). Password fields are stripped from login/profile results. |
| Access token | JWT **HS256**, **15 minutes** by default, payload `{ id, email, username, tokenType: 'access' }`. `verifyAccessToken` rejects any other `tokenType`. |
| JWT secret | Must be a non-empty string of **at least 32 characters**; checked before signing. |
| Refresh token | Opaque `lookupId.secret`; **7 days** by default. Only the secret is bcrypt-hashed at rest. The 16-byte lookup id lets storage find the record before one constant-time bcrypt comparison. |
| Rotation | Every `refresh` atomically claims the old token and issues a successor in the same family. |
| Replay detection | Presenting an already-claimed token revokes the entire family. A post-issuance predecessor re-check closes the race between successor creation and family revocation. |
| Email verification | Single-use, 24 hours by default, atomic expiry-guarded consumption. Unknown, expired, and used tokens are indistinguishable (`INVALID_TOKEN`). |
| Password reset | Single-use, 1 hour by default, atomic expiry-guarded consumption. All refresh tokens are revoked before the password changes. |
| Login lockout | 5 failed attempts → 15-minute lock by default. An active lock is re-checked before password comparison, and its window is not extended by further failures. |
| Enumeration behavior | Unknown-user and wrong-password login both return `INVALID_CREDENTIALS`. `forgotPassword` always returns the generic message for unknown and social accounts. Note that lockout, unverified-email, and social-account states intentionally return distinct codes, so `login` is not fully indistinguishable across all account states. |
| OAuth linking | Email-based linking requires `isEmailVerified: true`. OAuth-created accounts receive a random, unusable bcrypt password and `isVerified: true`. |
| Audit isolation | Audit writes can never fail the operation that triggered them. |
| Transport | Not handled. Core returns raw tokens; cookie flags, CSRF, CORS, rate limits, and TLS belong to the host. |

**Deployment requirements for these guarantees:** atomic `findOneAndUpdate` implementations, unique indexes on username and email (and ideally token lookup ids), a shared database across instances, and synchronized clocks.

---

## Production checklist

- **Validate before calling services.** Use the exported schemas or your own rules. `register` will hash a 2-character password if you pass one, and `resetPassword` will accept it too.
- **Keep the JWT secret out of source control.** Generate at least 32 characters, rotate deliberately, and remember that rotating invalidates existing access tokens.
- **Store both tokens safely.** If you use cookies, set `httpOnly`, `secure` in production, an appropriate `sameSite` policy, and scope the refresh cookie narrowly. If you use headers or a body, protect them with the same care.
- **Make adapters truly atomic.** Refresh rotation, email verification, and password reset all rely on compare-and-set semantics. A read-then-write adapter silently breaks single-use guarantees.
- **Translate uniqueness errors.** Map native duplicate errors to `DuplicateKeyError`; never leak driver errors into core.
- **Add indexes.** Unique username/email, refresh-token `lookupId`, `family`, `user`, and expiry cleanup are storage responsibilities.
- **Rate-limit at the edge.** Core implements lockout, not request throttling. Add IP- and account-based limits to registration, login, refresh, forgot-password, and OAuth endpoints.
- **Handle send failures deliberately.** `register` rolls back the user; `forgotPassword` clears the token. Surface `EMAIL_SEND_FAILED` as a retryable service error.
- **Treat `forgotPassword` output as opaque.** Do not let clients distinguish the trailing-period branches or the audit metadata.
- **Decide OAuth linking policy up front.** Linking a local account flips its `provider` and disables password login/change. If you need multi-provider password accounts, plan an explicit linking flow instead.
- **Keep audit stores available but non-critical.** Never make an auth request depend on an audit write succeeding.
- **Log responsibly.** Do not log raw refresh tokens, verification tokens, reset tokens, passwords, or JWT secrets. Audit metadata from core contains reasons and identifiers, not credentials.
- **Clean up expired records.** Core enforces expiry on use; adapters/storage should also expire old refresh tokens and audit logs according to your retention policy.

---

## Testing

The package uses **Vitest** and runs entirely against in-memory fake adapters — no database, SMTP server, or network is required.

```bash
pnpm test        # vitest run
pnpm test:watch  # watch mode
```

Current state: **7 test files, 138 passing tests**, covering registration, verification, login and lockout, refresh rotation and replay races, password reset, OAuth linking and callbacks, profiles, audit pagination, token helpers, and every exported validator. If the counts drift, the tests in `src/**/*.test.ts` are the source of truth.

The fakes in [`src/__tests__/fakes.ts`](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/src/__tests__/fakes.ts) are a working reference for adapter behavior, including `DuplicateKeyError` translation, query-operator matching, and newest-first audit pagination. Reuse that pattern to test your own adapter against the contracts above.

---

## Project layout

```text
packages/core/
├── src/
│   ├── index.ts                  public barrel (everything is exported here)
│   ├── config.ts                 CredConfig, defaults, resolveConfig
│   ├── errors/
│   │   ├── auth-error.ts         AuthError + AuthErrorCode
│   │   └── duplicate-key-error.ts
│   ├── helpers/
│   │   ├── auth.helper.ts        token, JWT, bcrypt utilities
│   │   └── audit.helper.ts       fire-and-forget audit writer
│   ├── services/
│   │   ├── auth.service.ts       register, verifyEmail, login, logout,
│   │   │                         refresh, forgotPassword, resetPassword
│   │   ├── oauth.service.ts      findOrCreateOAuthUser, oauthCallback
│   │   ├── profile.service.ts    get/update profile, password, deletion
│   │   └── audit.service.ts      paginated audit-log listing
│   ├── templates/
│   │   └── email.templates.ts    minimal HTML email fragments
│   ├── types/
│   │   ├── auth.types.ts         User, token, request/response types
│   │   ├── deps.types.ts         adapter interfaces
│   │   ├── oauth.types.ts        OAuth input/result types
│   │   └── audit.types.ts        audit actions and log shape
│   ├── validators/
│   │   └── auth.validators.ts    Zod 4 schemas
│   └── __tests__/
│       └── fakes.ts              reference in-memory adapters
├── tsdown.config.ts              ESM + declaration build
├── vitest.config.ts              Node test environment
└── package.json
```

Build output is `dist/index.mjs` plus `dist/index.d.mts`, generated by tsdown.

---

## License

Released under the **MIT License**. See [`package.json`](https://github.com/NehanAhmed/cred-kit/blob/main/packages/core/package.json) for the license identifier.
