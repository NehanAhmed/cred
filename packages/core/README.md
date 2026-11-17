<div align="center">

# @cred/core

[![npm version](https://img.shields.io/badge/version-0.1.0-blue)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](./package.json)
[![ESM only](https://img.shields.io/badge/modules-ESM%20only-f9a03c)](./package.json)
[![Tests](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](./vitest.config.ts)
[![License](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)

</div>

**A framework-agnostic, storage-agnostic authentication core for Node.js.**

`@cred/core` contains the complete authentication business logic of [Cred](https://github.com/NehanAhmed/cred) — registration, login, email verification, password reset, Google/GitHub OAuth account linking, rotating refresh tokens, profile management, and audit logging — as **pure TypeScript functions with zero framework or database dependencies**.

It does **not** ship an HTTP server, a database driver, or a mailer. You inject those as small adapters (or use the official ones), and `@cred/core` handles everything auth-related on top of them:

- Password hashing (bcrypt, 10 rounds)
- JWT access tokens (HS256, 15 minutes) with `tokenType` claims
- Refresh tokens: opaque, bcrypt-hashed at rest, family-based rotation with replay detection
- Email verification and password-reset tokens: hashed, expiring, single-use, consumed atomically
- Login lockout after repeated failures
- Anti-enumeration responses for password reset
- Fire-and-forget audit logging that can never break your auth flow

Because nothing is hidden inside a framework, every branch of this logic is directly unit-testable — which is how the package itself is tested.

---

## Table of contents

- [Installation](#installation)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Adapters](#adapters)
- [API reference](#api-reference)
- [Error handling](#error-handling)
- [Validation](#validation)
- [Security model](#security-model)
- [Writing your own adapter](#writing-your-own-adapter)
- [Testing](#testing)
- [The Cred ecosystem](#the-cred-ecosystem)
- [License](#license)

---

## Installation

```bash
npm install @cred/core
# or
pnpm add @cred/core
```

Runtime dependencies: `bcryptjs`, `jsonwebtoken`, `zod`. That's it — no database, no HTTP, no email libraries.

Requirements:

- **Node.js 20+** (matching the official adapter packages)
- **ESM-only.** The package is published as ES modules (`dist/index.mjs` + `.d.mts` types); there is no CJS build. If your app is CommonJS, use dynamic `import()`.

---

## How it works

`@cred/core` inverts the usual framework coupling. Instead of a library that owns your database and your routes, it owns only the logic, and you hand it the edges at call time:

```
┌──────────────────────────────────────┐
│  Your HTTP layer                     │
│  (Express / Fastify / Hono / …)      │
│  validates input with the exported   │
│  Zod schemas, maps AuthError to      │
│  responses                           │
└──────────────────┬───────────────────┘
                   │ calls
                   ▼
┌──────────────────────────────────────┐
│  @cred/core services                 │
│  register · verifyEmail · login      │
│  refresh · forgotPassword · oauth    │
│  profile · audit logs                │
└───────┬──────────────┬───────────────┘
        │              │
        ▼              ▼
   storage          email
   adapters         adapter
 (@cred/mongo-storage)  (@cred/smtp)
   or your own        or your own
```

Three design rules define the package:

1. **Stateless functions.** There are no classes to instantiate, no singletons, no global state. Every service function takes its dependencies (`deps`) explicitly.
2. **Storage never leaks in.** Core services never inspect driver-specific errors. Storage adapters translate native uniqueness violations into `DuplicateKeyError` (see [Adapters](#adapters)).
3. **Audit logging is fire-and-forget.** An audit write failure is logged (if you provide an `AuditErrorLogger`) and dropped. It can never change the outcome of the operation that triggered it.

---

## Quick start

A minimal Express integration using the two official adapters, `@cred/mongo-storage` (Mongoose) and `@cred/smtp` (Nodemailer/Resend):

```ts
import express from 'express';
import { register, login, AuthError } from '@cred/core';
import { mongooseStorage } from '@cred/mongo-storage';
import { emailService } from '@cred/smtp';
import { registerSchema } from '@cred/core';

const app = express();
app.use(express.json());

// --- Wire the adapters once at startup ---
const storage = mongooseStorage({ uri: process.env.MONGO_URI! });
await storage.ready(); // resolves when the Mongo connection is open

const { EMAIL } = await emailService({
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com', // used to build verification/reset links
});

// --- Register ---
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body); // core does not validate; you do (see Validation)

    await register(
      input,
      { userDatabase: storage.user, email: EMAIL }, // auditDatabase is optional
      { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
    );

    res.status(201).json({ message: 'Verification email sent' });
  } catch (err) {
    next(err);
  }
});

// --- Login ---
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const result = await login(
      req.body, // { email | username, password }
      { userDatabase: storage.user, refreshTokenDatabase: storage.refreshToken },
      { jwtSecret: process.env.JWT_SECRET! }, // must be >= 32 characters (enforced)
      { ip: req.ip, userAgent: req.get('user-agent') ?? undefined },
    );

    // result = { accessToken, refreshToken, user }
    // Cookie them, put them in a body, your choice — core doesn't own your transport.
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message });
    }
    next(err);
  }
});

app.listen(3000);
```

> **`jwtSecret` is validated:** a non-empty string of at least 32 characters is enforced, and `login`/`refresh`/`oauthCallback` throw if it isn't. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

Everything else — `refresh`, `logout`, `verifyEmail`, `forgotPassword`, `resetPassword`, profile, OAuth, audit logs — follows the same shape: `(input, deps, config?, context?)`. See the [API reference](#api-reference) for each signature.

---

## Adapters

Core is compiled against these interfaces (all exported from the package root). Implement them yourself or use an official package.

### `UserDatabaseAdapter`

```ts
interface UserDatabaseAdapter {
  findOne(filter: Partial<User>): Promise<User | null>;
  create(user: CreateUserInput): Promise<User>;
  delete(id: string): Promise<void>;
  update(id: string, updates: Partial<User>): Promise<User>;
  findOneByTwoConditions(filter1: Partial<User>, filter2: Partial<User>): Promise<User | null>;
  incrementLoginAttempts(id: string): Promise<number>;
  /**
   * Atomically updates the first user matching `condition`.
   * Returns `null` when no user matches; a no-match must not throw.
   */
  findOneAndUpdate(condition: UserQuery, updates: Partial<User>): Promise<User | null>;
}
```

Contract details that matter:

- **`findOneAndUpdate` must be atomic** in your storage. Core relies on it for single-use token consumption (email verification, password reset) — two concurrent consumers must not both succeed.
- **`UserQuery` supports comparison operators** (`{ $gt, $gte, $lt, $lte, $ne }`) on any `User` field, e.g. `{ verificationTokenExpires: { $gt: new Date() } }`.
- **Uniqueness violations must be translated** into `DuplicateKeyError` (exported by this package) instead of your driver's native error, e.g. MongoDB code `11000`.

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
  ): Promise<RefreshToken | null>; // atomic, null on no-match
  deleteMany(filter: Partial<RefreshToken>): Promise<void>;
}
```

### `EmailAdapter`

```ts
interface EmailAdapter {
  sendEmailVerification(email: string, rawToken: string): Promise<void>;
  sendPasswordReset(email: string, rawToken: string): Promise<void>;
}
```

Your adapter receives the **raw token** and is responsible for turning it into a link. The [`emailVerification`](./src/templates/email.templates.ts) and `passwordReset` HTML templates are exported from this package if you want ready-made bodies.

### `AuditDatabaseAdapter` (optional)

```ts
interface AuditDatabaseAdapter {
  create(audit: Partial<AuditLogInterface>): Promise<AuditLogInterface>;
  /** Returns the logs matching `filter`, newest first. */
  find(filter: AuditLogFilter, options: { skip: number; limit: number }): Promise<AuditLogInterface[]>;
  /** Returns the number of logs matching `filter`. */
  count(filter: AuditLogFilter): Promise<number>;
}
```

If you omit `auditDatabase` from a service's deps, audit writes become no-ops — nothing else changes.

---

## API reference

All functions are exported from the package root. Every optional `context` (`{ ip?, userAgent? }`) is forwarded to the audit log.

### Auth — `auth.service`

#### `register(input, deps, context?) => Promise<void>`

| Param | Type |
|---|---|
| `input` | `RegisterRequest` — `{ username, email, password, bio?, phoneNumber?, gender? }` |
| `deps` | `{ userDatabase, email, auditDatabase? }` |

Normalizes the email (trim + lowercase), rejects an existing username or email, hashes the password with bcrypt, creates the user with a hashed verification token (24 h expiry), and sends the verification email. **If the email cannot be sent, the just-created user is deleted and `EMAIL_SEND_FAILED` is thrown** — no unverified ghost accounts.

#### `verifyEmail(token, deps, context?) => Promise<{ isVerified: true }>`

| Param | Type |
|---|---|
| `token` | the raw token received in the email link |
| `deps` | `{ userDatabase, auditDatabase? }` |

Validates expiry and the bcrypt hash of the secret, then consumes the token and sets `isVerified: true` in one atomic conditional update, so a token can never be verified twice. Throws `INVALID_TOKEN` for unknown, malformed, expired, or already-used tokens.

#### `login(input, deps, config, context?) => Promise<{ accessToken, refreshToken, user }>`

| Param | Type |
|---|---|
| `input` | `LoginRequest` — `{ password }` plus `email` **or** `username` |
| `deps` | `{ userDatabase, refreshTokenDatabase, auditDatabase? }` |
| `config` | `{ jwtSecret: string }` |

Flow, in order: account lockout check → provider check (only `local` accounts can log in with a password) → `isVerified` check → bcrypt compare. After 5 failed attempts the account is locked for **15 minutes**. On success it resets the lockout counters, records `lastLogin`/`lastIp`, signs a 15-minute access token, persists a new refresh token, and returns the tokens plus the user **without the password field**. Failures return a generic `INVALID_CREDENTIALS` (no user enumeration).

#### `logout(context, deps) => Promise<void>`

| Param | Type |
|---|---|
| `context` | `{ rawToken, userId?, ip?, userAgent? }` |
| `deps` | `{ refreshTokenDatabase, auditDatabase? }` |

Deletes **only the presented refresh token** (matched by lookup id and verified against its bcrypt hash) and audits the event. Unknown or malformed tokens are a silent no-op, not an error.

#### `refresh(context, deps, config) => Promise<{ accessToken, refreshToken }>`

| Param | Type |
|---|---|
| `context` | `{ rawToken, ip?, userAgent? }` |
| `deps` | `{ refreshTokenDatabase, userDatabase, auditDatabase? }` |
| `config` | `{ jwtSecret: string }` |

**Rotating refresh tokens with reuse detection:**

1. The raw token (`lookupId.secret`) is matched by lookup id and verified against the stored bcrypt hash.
2. The token is atomically claimed (`consumed: true`) — only one concurrent request wins.
3. If the claim fails because the token was **already consumed, the whole token family is revoked** and `REFRESH_TOKEN_REUSE_DETECTED` is thrown: a replayed token burns every session that descended from it.
4. A successor token is issued into the same family (7-day expiry), and the predecessor is re-checked afterwards to close the race window where a replay revoked the family between the claim and the successor write.
5. Expired tokens throw `REFRESH_TOKEN_EXPIRED`.

#### `forgotPassword(input, deps, context?) => Promise<{ message }>`

| Param | Type |
|---|---|
| `input` | `{ email }` |
| `deps` | `{ userDatabase, email, auditDatabase? }` |

**Always returns the same message** — for unknown emails, for social-login accounts, and for success — so the endpoint cannot be used to enumerate users. For real local accounts it issues a single-use reset token (1 h expiry) and emails it; if the email send fails, the stored token is rolled back and `EMAIL_SEND_FAILED` is thrown.

#### `resetPassword(input, deps, context?) => Promise<{ message }>`

| Param | Type |
|---|---|
| `input` | `{ token, newPassword }` |
| `deps` | `{ userDatabase, refreshTokenDatabase, auditDatabase? }` |

Validates the token (existence, expiry, bcrypt match), **revokes all of the user's refresh tokens first** (so a failed later step leaves the old password and a retryable link), then consumes the token and replaces the password in one atomic conditional update. Also clears lockout state.

### OAuth — `oauth.service`

#### `findOrCreateOAuthUser(input, deps) => Promise<User>`

| Param | Type |
|---|---|
| `input` | `FindOrCreateOAuthUserInput` — `{ provider: 'google' \| 'github', profileId, email?, displayName?, avatar?, isEmailVerified }` |
| `deps` | `{ userDatabase, auditDatabase? }` |

The core logic behind any OAuth strategy (this is what the original Passport strategies called):

1. Find an existing user by provider id (`googleId` / `githubId`) → return as-is.
2. Else, if `isEmailVerified` and an email is present, link to the existing account with that email. **Unverified emails are never used for linking** — that would allow account takeover.
3. Else create a new user: sanitized unique username, `isVerified: true`, a random password (unusable for password login), and the provider id.

#### `oauthCallback(input, deps, config, context?) => Promise<OAuthCallbackResult>`

| Param | Type |
|---|---|
| `input` | `OAuthCallbackInput` — `{ user?: OAuthUser \| null, provider }` |
| `deps` | `{ userDatabase, refreshTokenDatabase, auditDatabase? }` |
| `config` | `{ jwtSecret: string }` |

Validates the user object handed over by your strategy, records `lastLogin`/`lastIp`, and issues an access token + a fresh refresh-token family. Returns `{ accessToken, refreshToken, user: { id, email, username, provider } }`.

### Profile — `profile.service`

All functions take `context: { userId, ip?, userAgent? }` and expect the caller to have already authenticated the user (e.g. by verifying an access token with `verifyAccessToken`).

| Function | Deps | Returns |
|---|---|---|
| `getProfile(context, { userDatabase })` | — | `UserWithoutPassword` |
| `updateProfile(input, context, { userDatabase, auditDatabase? })` | `ProfileUpdateRequest` — `username?` / `bio?` / `phoneNumber?` / `gender?` — omitted fields untouched | `UserWithoutPassword` |
| `updatePassword(input, context, { userDatabase, refreshTokenDatabase, auditDatabase? })` | `PasswordChangeRequest` — `{ currentPassword, newPassword }` | `UserWithoutPassword` |
| `deleteAccount(context, { userDatabase, refreshTokenDatabase, auditDatabase? })` | — | `void` |

Details:

- `updateProfile` maps an adapter-thrown `DuplicateKeyError` (e.g. taken username) to `AuthError('DUPLICATE_KEY', '<field> is already taken')`.
- `updatePassword` requires a `local` account (`SOCIAL_LOGIN_ACCOUNT` otherwise), verifies the current password, **revokes all refresh tokens**, then updates the password and clears lockout state.
- `deleteAccount` removes all of the user's refresh tokens and then the user, and audits `account_deletion`.

### Audit — `audit.service`

#### `getAuditLogs(input, deps) => Promise<{ logs, pagination }>`

| Param | Type |
|---|---|
| `input` | `{ userId, page?, limit? }` |
| `deps` | `{ auditDatabase }` |

Paginated, newest first. `limit` is clamped to **1–100** (default 20), `page` to ≥ 1 (default 1). Returns:

```ts
{
  logs: AuditLogInterface[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
```

### Helpers

Exported token utilities, in case you need to build middleware or custom flows:

| Export | Purpose |
|---|---|
| `generateToken(secretBytes?)` | Creates `{ rawToken, hashedToken, lookupId }`. The raw token is `lookupId.secret`; only the secret is bcrypt-hashed (a raw token exceeds bcrypt's 72-byte input limit). |
| `generateRefreshTokenData()` | Adds a `family` UUID and a 7-day `expiresAt` on top of `generateToken`. |
| `generateAccessToken(user, secret)` | Signs `{ id, email, username, tokenType: 'access' }` with HS256, 15-minute expiry. Validates the secret first. |
| `verifyAccessToken(token, secret)` | Verifies and returns the `JWTPayload`. Rejects missing/malformed/expired tokens and anything whose `tokenType` is not `'access'` (i.e. you can't log in with a refresh token) with `AuthError('INVALID_TOKEN')`. |
| `hashToken` / `verifyToken` | bcrypt hash/compare for token secrets (10 rounds). |
| `verifyRawToken(rawToken, hashedToken)` | Splits `lookupId.secret` and verifies the secret; returns `false` (never throws) for malformed tokens. |
| `parseToken` / `parseTokenLookupId` | Split a raw token into its parts; `null` for malformed input. |
| `assertJwtSecret(secret)` | Type-guard assertion: non-empty string, ≥ 32 characters. |

### Templates

Two minimal HTML email bodies, exported for adapter authors:

```ts
emailVerification(verificationLink: string): string
passwordReset(resetLink: string, expiresAt: string): string
```

### Validators

Zod 4 schemas for your HTTP layer — see [Validation](#validation):

`registerSchema`, `loginSchema`, `passwordForgotSchema`, `passwordResetSchema`, `passwordChangeSchema`, `profileSchema`

---

## Error handling

Everything thrown by the services is an **`AuthError`** carrying a stable machine-readable `code`, a human-readable `message`, and an HTTP-friendly `statusCode` (plus optional `metadata`). Catch it and map it to your framework's response type:

```ts
import { AuthError } from '@cred/core';

try {
  await login(/* … */);
} catch (err) {
  if (err instanceof AuthError) {
    // err.code        e.g. 'ACCOUNT_LOCKED'
    // err.statusCode  e.g. 401
    // err.message     e.g. 'Account locked due to too many failed login attempts. …'
  }
}
```

Codes thrown by the services:

| Code | Status | Thrown by |
|---|---|---|
| `USER_EXISTS` | 400 | `register` |
| `USER_CREATION_FAILED` | 500 | `register`, `findOrCreateOAuthUser` |
| `USER_DELETION_FAILED` | 500 | `register` (rollback after email failure) |
| `EMAIL_SEND_FAILED` | 500 | `register`, `forgotPassword` |
| `INVALID_TOKEN` | 400 | `verifyEmail`, `resetPassword` |
| `INVALID_TOKEN` | 401 | `verifyAccessToken` |
| `INVALID_CREDENTIALS` | 401 | `login` |
| `ACCOUNT_LOCKED` | 401 | `login` |
| `INVALID_LOGIN_METHOD` | 400 | `login` (non-local provider) |
| `EMAIL_NOT_VERIFIED` | 401 | `login` |
| `MISSING_TOKEN` | 404 | `logout`, `refresh` |
| `REFRESH_TOKEN_NOT_FOUND` | 401 | `refresh` |
| `REFRESH_TOKEN_EXPIRED` | 401 | `refresh` |
| `REFRESH_TOKEN_REUSE_DETECTED` | 401 | `refresh` (whole family revoked) |
| `REFRESH_TOKEN_CREATION_FAILED` | 500 | `login`, `refresh`, `oauthCallback` |
| `UNEXPECTED_ERROR_OCCURED` | 500 | `forgotPassword`, `refresh` (spelling as shipped — match it exactly) |
| `USER_NOT_FOUND` | 404 | profile services |
| `SOCIAL_LOGIN_ACCOUNT` | 400 | `updatePassword` |
| `INVALID_CURRENT_PASSWORD` | 400 | `updatePassword` |
| `DUPLICATE_KEY` | 400 | `updateProfile` (from `DuplicateKeyError`) |
| `OAUTH_FAILED` | 401 | `oauthCallback` |
| `OAUTH_INVALID_USER` | 401 | `oauthCallback` |

The `AuthErrorCode` union also declares `MISSING_CREDENTIALS` and `INVALID_EMAIL`; these are currently not produced by any service but exist for adapter/framework use.

**`DuplicateKeyError`** is the storage-independent contract for uniqueness violations: adapters throw it (optionally naming the `field`), and core maps it to `AuthError('DUPLICATE_KEY')`. Your storage never leaks into core, and core never learns your driver.

---

## Validation

**Core services do not validate their inputs.** `register` will happily hash and store a 2-character password if you pass it one. This is deliberate: the schemas live next to the logic so *your* HTTP layer decides when and how to enforce them.

The exported Zod 4 schemas encode Cred's rules:

| Schema | Rules |
|---|---|
| `registerSchema` | `username` 3–30 chars; valid email; password ≥ 8 chars with at least one uppercase letter and one digit; optional `bio` (3–200 chars), `phoneNumber` (10–15 digits), `gender` (`male \| female \| other`) |
| `loginSchema` | `password` required; `email` and/or `username` (at least one) |
| `passwordForgotSchema` | valid `email` |
| `passwordResetSchema` | password rules as above |
| `passwordChangeSchema` | `currentPassword` non-empty; `newPassword` per password rules |
| `profileSchema` | all fields optional; same constraints as `registerSchema` |

Recommended usage: `schema.parse(req.body)` in your route handler, then pass the typed result to the service.

---

## Security model

The numbers and mechanics below are the actual shipped behavior — they are enforced in code, not just documented intent.

| Aspect | Behavior |
|---|---|
| Access tokens | JWT **HS256**, **15 min** expiry, payload `{ id, email, username, tokenType: 'access' }`. `verifyAccessToken` rejects any token with a different `tokenType`. |
| JWT secret | Must be a non-empty string of **≥ 32 characters**; enforced before signing. |
| Refresh tokens | Opaque `lookupId.secret` strings, **7 days** expiry. Only the secret part is bcrypt-hashed at rest (10 rounds); the random lookup id lets the adapter find the record before the constant-time bcrypt compare. |
| Rotation | Every `refresh` consumes the old token (`consumed: true`, atomic claim) and issues a successor in the same **family**. |
| Replay detection | Presenting an already-consumed token revokes **the entire family** and throws `REFRESH_TOKEN_REUSE_DETECTED`. A post-issuance re-check of the predecessor closes the concurrent-replay race window. |
| Password hashing | bcrypt, **10 rounds**. Passwords are stripped from every returned user object (`UserWithoutPassword`). |
| Email verification | SHA-style opaque token, **24 h** expiry, single use, consumed atomically with an expiry guard. |
| Password reset | Opaque token, **1 h** expiry, single use, atomic consumption; **revokes all refresh tokens** before the password changes. |
| Login lockout | **5 failed attempts → 15-minute lock** (`ACCOUNT_LOCKED`). Successful login resets attempts and lockout. |
| Enumeration resistance | `login` failures are a generic `INVALID_CREDENTIALS`; `forgotPassword` returns the identical message whether or not the account exists (and for social accounts). |
| OAuth linking | An email may only link an existing local account when **the provider has verified it** (`isEmailVerified`). OAuth accounts get a random unusable password and cannot log in or change passwords locally. |
| Audit logging | Fire-and-forget. A failing audit write is logged via the optional `AuditErrorLogger` and swallowed — it can never fail the auth operation. |

Cookie handling (`httpOnly`, `sameSite`, `secure`, `path=/api/auth` in the reference API) is intentionally **out of scope here** — core returns raw tokens and leaves transport decisions to you.

---

## Writing your own adapter

To plug in PostgreSQL, Redis, DynamoDB, an ORM, or a test double, implement the interfaces from [Adapters](#adapters) and pass them in. The rules the core relies on:

1. **Translate uniqueness violations.** Catch your driver's native duplicate error and reject with `new DuplicateKeyError('username')` (field name optional). Do not let driver errors escape.
2. **`findOneAndUpdate` is a CAS primitive.** It must be atomic, return the updated document, and return `null` on no match — never throw. Time-based conditions arrive as `{ verificationTokenExpires: { $gt: new Date() } }`; honor the comparison operators in `QueryValue`.
3. **Audit `find` returns newest first** and supports `{ skip, limit }`; `count` returns the number of matching logs.
4. **Email adapter receives raw tokens** and builds the links itself; use the exported `emailVerification` / `passwordReset` templates if you want consistent HTML.
5. **Never throw from audit writes into core** — core already wraps `create` in try/catch; still, keep your adapter's `create` honest.

A minimal in-memory fake (the shape used by this package's own test suite) is often all you need to get started.

---

## Testing

The package is tested with **Vitest** against in-memory fake adapters (`src/__tests__/fakes.ts` in the repository), covering the service functions' success and failure paths, token rotation and replay races, lockout behavior, and adapter-contract edge cases.

```bash
pnpm test    # inside packages/core
```

Because every dependency is injected, you can test your integration the same way — implement fakes for `UserDatabaseAdapter` and friends, or use the official Mongo adapter against an in-memory MongoDB.

---

## The Cred ecosystem

| Package | Role |
|---|---|
| **`@cred/core`** (this package) | Framework- and storage-agnostic auth logic, types, errors, validators, templates |
| [`@cred/mongo-storage`](https://github.com/NehanAhmed/cred/tree/main/packages/mongo-storage) | Official Mongoose adapters for `UserDatabaseAdapter`, `RefreshTokenDatabaseAdapter`, `AuditDatabaseAdapter`, plus ready-made models |
| [`@cred/smtp`](https://github.com/NehanAhmed/cred/tree/main/packages/smtp) | Official `EmailAdapter` backed by Nodemailer (SMTP) or the Resend HTTP API, with auto-detection between the two |

Bring your own adapters for anything else — that is the entire point of the split.

## License

ISC — see [package.json](./package.json).
