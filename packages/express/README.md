# @cred-kit/express

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/NehanAhmed/cred/blob/main/LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://github.com/NehanAhmed/cred/blob/main/packages/express/package.json)

Express 5 transport adapter for Cred: one mountable router for registration, login, OAuth, profiles, and audit logs.

> **Pre-1.0:** this package is version `0.1.0`. Its public API may change between minor versions.

## Overview

`@cred-kit/express` is the Express adapter for Cred. It returns an Express `Router` that implements the HTTP endpoints for authentication, profiles, and audit logs. The router owns routing, JSON and cookie parsing, request validation, cookies, redirects, rate limiting, and HTTP error mapping.

Authentication logic, token issuance, password and token hashing, refresh-token rotation, and audit writes are delegated to `@cred-kit/core`. When configured with MongoDB and email options, the adapter constructs the official `@cred-kit/mongo-storage` and `@cred-kit/smtp` implementations at startup. It can also accept prebuilt `@cred-kit/core` adapters for another backend.

What this package does not do:

- It does not create or start an HTTP server. You mount the returned router in your own Express app.
- It does not implement storage or email delivery itself. It constructs the sibling adapters or accepts yours.
- It does not provide CORS, helmet, HTTPS, or `trust proxy` configuration.
- It does not build email verification or password reset links.
- Host routes that need authentication should use the exported `createAuthGuard`.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration reference](#configuration-reference)
- [Mounting and base path](#mounting-and-base-path)
- [Routes reference](#routes-reference)
- [Response and error format](#response-and-error-format)
- [Cookies and sessions](#cookies-and-sessions)
- [OAuth setup](#oauth-setup)
- [Rate limiting](#rate-limiting)
- [Security notes](#security-notes)
- [Limitations and known constraints](#limitations-and-known-constraints)
- [Protecting your own routes](#protecting-your-own-routes)
- [TypeScript](#typescript)
- [Troubleshooting](#troubleshooting)
- [Testing and development](#testing-and-development)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Features

- A single `credExpress(config)` factory that returns a mountable Express 5 `Router` with a `close()` method.
- Registration, login, logout, refresh, email verification, forgot-password, and reset-password routes.
- Google and GitHub OAuth authorization-code flows implemented with `fetch`, without Passport.
- Profile read, update, password change, account deletion, and paginated audit-log routes.
- Startup configuration validation with descriptive errors before any request is served.
- Built-in construction of `@cred-kit/mongo-storage` and `@cred-kit/smtp` from configuration, or injection of prebuilt `@cred-kit/core` adapters.
- Rotating refresh tokens in `httpOnly` cookies, with cookie clearing when core reports an invalid, expired, or replayed refresh token.
- Router-scoped `express.json()` and `cookieParser()` middleware.
- Configurable rate limits with a broad limiter per route group and tighter per-route limiters.
- JSON success and error envelopes, a single `AuthError` boundary, and JSON responses for malformed or oversized request bodies.
- ESM-only package with bundled TypeScript declarations.

## Requirements

| Requirement          | Version                                       | Evidence                                                  |
| -------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Node.js              | `>=22`                                        | `engines.node`; observed tsdown build target `node22.0.0` |
| Express              | `^5.2.1`                                      | `peerDependencies`; the router uses Express 5             |
| `@cred-kit/core`     | `0.1.0` in this repository (workspace-linked) | `peerDependencies`                                        |
| `cookie-parser`      | `^1.4.7`                                      | `peerDependencies`; imported by the router                |
| `express-rate-limit` | `^8.5.2`                                      | `peerDependencies`; imported by the middleware            |
| `mongoose`           | `^9.7.0`                                      | `peerDependencies`; used by the bundled MongoDB adapter   |
| `nodemailer`         | `^10.5.0`                                     | `peerDependencies`; used by the bundled email adapter     |

The package is ESM-only (`"type": "module"`, build format `esm`). The published `exports` map has `types`, `import`, and `default` conditions and no CommonJS `require` condition.

## Installation

Install the adapter and its peer dependencies:

```bash
pnpm add @cred-kit/express @cred-kit/core express cookie-parser express-rate-limit mongoose nodemailer
```

`@cred-kit/mongo-storage` and `@cred-kit/smtp` are dependencies of `@cred-kit/express` and are installed automatically. `mongoose` and `nodemailer` are declared peers because the bundled adapters use those libraries. Install all peers in the host application; do not rely on a transitive copy.

## Quick start

```ts
import express from 'express';
import { credExpress } from '@cred-kit/express';

const app = express();

// Only needed when the app runs behind a proxy. The router reads req.ip for
// audit context and rate limiting.
app.set('trust proxy', 1);

const cred = await credExpress({
  database: { uri: process.env.MONGO_URI! },
  email: {
    EMAIL_FROM: 'no-reply@example.com',
    BACKEND_URL: 'https://api.example.com'
  },
  jwtSecret: process.env.JWT_SECRET!, // at least 32 characters
  clientUrl: 'https://app.example.com',
  backendUrl: 'https://api.example.com'
});

app.use('/api', cred);

const server = app.listen(3000);

const shutdown = async (): Promise<void> => {
  server.close();
  await cred.close();
};

process.on('SIGTERM', () => {
  void shutdown();
});
```

`credExpress` is asynchronous. It resolves the configuration, builds the configured database and email adapters, and waits for the MongoDB connection before returning when it builds the MongoDB adapter. Mount the resolved router, not the promise.

The mount path must match the configured `basePath` (default `/api`). See [Mounting and base path](#mounting-and-base-path).

## How it works

```text
request
  -> mounted Cred router
     -> express.json({ limit }) and cookieParser()
     -> /auth/* or /profile/*
        -> rate limiter(s)
        -> Zod validation where a body is accepted
        -> requireAuth for protected routes
        -> controller
           -> @cred-kit/core service
              -> user / refresh-token / audit adapters
              -> email adapter
  -> error handler
```

| Layer                       | Responsibility                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host Express app            | HTTP server, `trust proxy`, CORS, helmet, HTTPS, global middleware order, 404 handling outside the router                                         |
| `@cred-kit/express` router  | Route table, request parsing, validation wiring, cookies, redirects, rate limiters, response envelopes, `AuthError` and body-parser error mapping |
| `@cred-kit/express` runtime | Constructs `@cred-kit/mongo-storage` and `@cred-kit/smtp` from config, or passes prebuilt adapters through; owns `close()`                        |
| `@cred-kit/core`            | Registration, login, token issuance and verification, refresh rotation, OAuth user creation/linking, profile and audit operations                 |
| Storage and email adapters  | Persistence and delivery                                                                                                                          |

Controllers are thin. They read the request, call a core service with the dependency bundle, set or clear cookies, and send a response. Controllers do not query the database directly.

## Configuration reference

```ts
interface CredExpressConfig {
  database: CredDatabaseInput;
  email: CredEmailInput;
  jwtSecret: string;
  clientUrl: string;
  backendUrl: string;
  basePath?: string;
  oauth?: CredOAuthConfig;
  cookies?: CredCookieConfig;
  rateLimits?: CredRateLimitsInput;
  core?: Partial<CredConfig>;
  jsonBodyLimit?: string;
  logger?: CredErrorLogger;
}
```

| Option                  | Type                  | Required | Default                                           | Description                                                                                                                    |
| ----------------------- | --------------------- | -------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `database`              | `CredDatabaseInput`   | yes      | —                                                 | Mongo options (`{ uri }` or `{ connection }`) or prebuilt `{ user, refreshToken, audit? }` adapters                            |
| `email`                 | `CredEmailInput`      | yes      | —                                                 | Email service options (`EMAIL_FROM`, `BACKEND_URL`, plus adapter options) or a prebuilt `EmailAdapter`                         |
| `jwtSecret`             | `string`              | yes      | —                                                 | JWT signing secret; core requires at least 32 characters                                                                       |
| `clientUrl`             | `string`              | yes      | —                                                 | Absolute `http`/`https` URL used as the prefix for verification and OAuth redirects                                            |
| `backendUrl`            | `string`              | yes      | —                                                 | Absolute `http`/`https` public API URL used to build OAuth callback URLs                                                       |
| `basePath`              | `string`              | no       | `/api`                                            | Public path where the router is mounted; must match `app.use(...)`                                                             |
| `oauth`                 | `CredOAuthConfig`     | no       | `{}`                                              | Optional Google and GitHub credentials                                                                                         |
| `cookies`               | `CredCookieConfig`    | no       | see [Cookies and sessions](#cookies-and-sessions) | Cookie names, paths, lifetimes, and flags                                                                                      |
| `rateLimits`            | `CredRateLimitsInput` | no       | `defaultCredRateLimits`                           | Per-limiter partial overrides                                                                                                  |
| `rateLimitStoreFactory` | `(keyPrefix: string) => Store` | no       | in-memory store                                   | Factory for the rate-limit store. Called once per limiter with a distinct key prefix, so a shared backend keeps counters isolated. |
| `core`                  | `Partial<CredConfig>` | no       | core defaults                                     | Token lifetimes, bcrypt rounds, lockout policy, audit page sizes                                                               |
| `jsonBodyLimit`         | `string`              | no       | `10kb`                                            | JSON body limit for the mounted router                                                                                         |
| `logger`                | `CredErrorLogger`     | no       | `console`                                         | Object with an `error(...args)` method for unexpected errors                                                                   |

### Database

`database` accepts one of three shapes:

```ts
// 1. Build the bundled MongoDB adapter from a URI.
database: { uri: process.env.MONGO_URI! }

// 2. Build it from an existing Mongoose connection.
database: { connection: existingMongooseConnection }

// 3. Supply prebuilt core adapters.
database: {
  user: myUserAdapter,
  refreshToken: myRefreshTokenAdapter,
  audit: myAuditAdapter, // optional
}
```

For `{ uri }`, the adapter creates a `@cred-kit/mongo-storage` instance and awaits `ready()` before returning the router. For `{ connection }`, it uses the existing Mongoose connection. Only the `uri` or `connection` property is passed to the storage adapter; other properties on that object are ignored.

Prebuilt adapters must implement the `@cred-kit/core` interfaces `UserDatabaseAdapter` and `RefreshTokenDatabaseAdapter`; `audit` is optional and must implement `AuditDatabaseAdapter`. The resolver checks the required methods at startup.

`database` cannot combine `uri`/`connection` with prebuilt adapters, and it cannot set both `uri` and `connection`.

If no audit adapter is supplied, core drops audit writes and `GET /profile/me/audit-logs` responds with `503`.

### Email

`email` accepts either email service options or a prebuilt `@cred-kit/core` `EmailAdapter`:

```ts
// Build the bundled @cred-kit/smtp service.
email: {
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
  // Additional fields are forwarded to @cred-kit/smtp's emailServiceOptions.
}

// Or supply a prebuilt adapter.
email: myEmailAdapter
```

When using service options, `EMAIL_FROM` must be a non-empty string and `BACKEND_URL` must be an absolute `http`/`https` URL without a query string or fragment. Other fields are forwarded to the email service, including `authPathPrefix` (default `/api/auth`), which controls the verification and reset links. An object with `sendEmailVerification` or `sendPasswordReset` is treated as a prebuilt adapter, and both methods are required.

### Core tunables

`core` is a `Partial<CredConfig>` merged over core's defaults:

| Field                    | Default               | Meaning                                        |
| ------------------------ | --------------------- | ---------------------------------------------- |
| `accessTokenExpiry`      | `'15m'`               | Access-token lifetime passed to the JWT signer |
| `refreshTokenTtlMs`      | `604800000` (7 days)  | Refresh-token lifetime                         |
| `tokenHashRounds`        | `10`                  | bcrypt rounds for token secrets                |
| `passwordHashRounds`     | `10`                  | bcrypt rounds for passwords                    |
| `lockoutThreshold`       | `5`                   | Failed logins before lockout                   |
| `lockoutDurationMs`      | `900000` (15 minutes) | Lockout duration                               |
| `verificationTokenTtlMs` | `86400000` (24 hours) | Email-verification token lifetime              |
| `resetTokenTtlMs`        | `3600000` (1 hour)    | Password-reset token lifetime                  |
| `auditMaxLimit`          | `100`                 | Maximum audit-log page size                    |
| `auditDefaultLimit`      | `20`                  | Default audit-log page size                    |

### Validation and startup errors

Configuration is resolved before the router is built. Because `credExpress` is an async function, invalid configuration rejects the returned promise and no router is returned. Any resources already created during adapter setup are released before the error is rethrown.

Common messages:

| Condition                         | Error                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Missing config object             | `@cred-kit/express: configuration object is required`                                                                                 |
| Missing database                  | `@cred-kit/express: "database" is required`                                                                                           |
| Unrecognized database shape       | `@cred-kit/express: "database" must provide MongoDB options ("uri" or "connection") or prebuilt adapters ("user" and "refreshToken")` |
| Mixed database input              | `@cred-kit/express: "database" cannot combine "uri"/"connection" options with prebuilt adapters`                                      |
| Both `uri` and `connection`       | `@cred-kit/express: "database" must set either "uri" or "connection", not both`                                                       |
| Missing email                     | `@cred-kit/express: "email" is required`                                                                                              |
| Unrecognized email shape          | `@cred-kit/express: "email" must provide email service options ("EMAIL_FROM" and "BACKEND_URL") or a prebuilt EmailAdapter`           |
| Missing or non-string secret      | `@cred-kit/express: "jwtSecret" is required and must be a string`                                                                     |
| Secret shorter than 32 characters | `@cred-kit/express: Cred: jwtSecret must be at least 32 characters`                                                                   |
| Bad URL                           | `@cred-kit/express: "clientUrl" must be an absolute URL, received "..."`                                                              |
| Non-HTTP URL                      | `@cred-kit/express: "clientUrl" must use http or https, received "..."`                                                               |
| URL with query or fragment        | `@cred-kit/express: "clientUrl" must not contain a query string or fragment`                                                          |
| Bad base path                     | `@cred-kit/express: "basePath" must start with "/", received "..."`                                                                   |
| Invalid same-site value           | `@cred-kit/express: "cookies.sameSite" must be "strict", "lax", or "none", received "..."`                                            |
| `sameSite: 'none'` without secure | `@cred-kit/express: "cookies.sameSite" cannot be "none" while "cookies.secure" is false`                                              |
| Invalid body limit                | `@cred-kit/express: "jsonBodyLimit" must be a size such as "10kb" or "1mb", received "..."`                                           |
| Invalid rate limit                | `@cred-kit/express: "rateLimits.login.max" must be a positive integer, received "0"`                                                  |
| Invalid logger                    | `@cred-kit/express: "logger" must expose an error(...args) method`                                                                    |

`clientUrl` and `backendUrl` are normalized by removing trailing slashes. `basePath` also has trailing slashes removed; `basePath: '/'` becomes an empty string, so the refresh cookie path becomes `/auth`.

### Environment variables

The package reads only `process.env.NODE_ENV`. It is used for one decision: the default value of `cookies.secure` (`NODE_ENV === 'production'`). The package does not read `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `BACKEND_URL`, or any other variable. Reading environment variables and passing them into `credExpress` is the host application's job.

## Mounting and base path

Mount the router at the same path you configure as `basePath`. The default is `/api`.

Correct:

```ts
const cred = await credExpress({
  // ...
  basePath: '/v1'
});

app.use('/v1', cred);
```

Incorrect:

```ts
// basePath stays at its default `/api`, but the router is mounted at `/v1`.
const cred = await credExpress({
  // ...
});

app.use('/v1', cred);
```

`basePath` has two effects:

1. It scopes the refresh-token cookie and the OAuth state cookie to `${basePath}/auth`.
2. It is appended to `backendUrl` to build the OAuth callback URL: `${backendUrl}${basePath}/auth/{provider}/callback`.

It does not build email verification or reset links. The email adapter receives the recipient and the raw token; link construction is that adapter's responsibility. When you use the bundled `@cred-kit/smtp` options, set `authPathPrefix` to match the mount path so emailed links resolve:

```ts
// Router mounted at /v1: basePath and authPathPrefix must agree.
const cred = await credExpress({
  // ...
  basePath: '/v1',
  email: {
    EMAIL_FROM: 'no-reply@example.com',
    BACKEND_URL: 'https://api.example.com',
    authPathPrefix: '/v1/auth'
  }
});

app.use('/v1', cred);
```

Leaving `authPathPrefix` at `/api/auth` while mounting at `/v1` produces verification and reset links that return 404. The two settings are configured independently; the adapter does not derive one from the other.

A mount at `/` works with `basePath: '/'`:

```ts
const cred = await credExpress({ /* ... */ basePath: '/' });
app.use('/', cred);
// Refresh and OAuth-state cookie path: /auth
```

> **Warning:** If the mount path and `basePath` differ, the refresh cookie is scoped to a path the browser will not send to your routes. Refresh then fails with `401 Refresh token not found.` The OAuth callback URL registered with the provider will also point at the wrong path.

`backendUrl` is the public API base. Do not include `basePath` in it, because the adapter appends `basePath`:

```ts
// Correct: callback is https://api.example.com/api/auth/google/callback
backendUrl: 'https://api.example.com',
basePath: '/api',

// Wrong: callback becomes https://api.example.com/api/api/auth/google/callback
backendUrl: 'https://api.example.com/api',
basePath: '/api',
```

`clientUrl` is used verbatim as the redirect prefix after trailing slashes are removed. Email verification redirects to `${clientUrl}/login?verified=...`, OAuth success redirects to `${clientUrl}/auth/callback`, and OAuth failures redirect to `${clientUrl}/login?error=...`.

## Routes reference

All paths are relative to the mount point. With the default configuration, the full paths are `/api/auth/...` and `/api/profile/...`.

| Method   | Path                          | Access         | Limiters                   | Description                                                    |
| -------- | ----------------------------- | -------------- | -------------------------- | -------------------------------------------------------------- |
| `GET`    | `/health`                     | Public         | `health`                   | Check adapter health; does not set CSRF cookies                |
| `POST`   | `/auth`                       | Public         | `auth`, `register`         | Register a user; sends a verification email; `201`             |
| `POST`   | `/auth/login`                 | Public         | `auth`, `login`            | Log in with email or username plus password; sets cookies      |
| `POST`   | `/auth/logout`                | Access cookie  | `auth`, `logout`           | Delete the presented refresh token and clear cookies           |
| `POST`   | `/auth/refresh`               | Refresh cookie | `auth`, `refresh`          | Rotate the refresh token and issue a new access token          |
| `GET`    | `/auth/csrf-token`            | Public         | `auth`                     | Return the CSRF token and ensure the `csrfToken` cookie is set |
| `GET`    | `/auth/verify-email/:token`   | Public         | `auth`, `verifyEmail`      | Verify an email address; always redirects                      |
| `POST`   | `/auth/forgot-password`       | Public         | `auth`, `forgotPassword`   | Request a reset link; always returns the same message          |
| `POST`   | `/auth/reset-password/:token` | Public         | `auth`, `resetPassword`    | Reset a password with a one-time token                         |
| `GET`    | `/auth/reset-password/:token` | Public         | `auth`, `resetPassword`    | Redirect the reset email link to the client reset page         |
| `GET`    | `/auth/google`                | Public         | `auth`, `oauth`            | Start Google OAuth                                             |
| `GET`    | `/auth/google/callback`       | Public         | `auth`, `oauth`            | Finish Google OAuth                                            |
| `GET`    | `/auth/github`                | Public         | `auth`, `oauth`            | Start GitHub OAuth                                             |
| `GET`    | `/auth/github/callback`       | Public         | `auth`, `oauth`            | Finish GitHub OAuth                                            |
| `GET`    | `/profile/me`                 | Access cookie  | `profile`                  | Return the current profile without `password`                  |
| `PUT`    | `/profile/me`                 | Access cookie  | `profile`, `profileUpdate` | Update profile fields                                          |
| `DELETE` | `/profile/me`                 | Access cookie  | `profile`                  | Delete the account and refresh tokens; clear cookies           |
| `POST`   | `/profile/me/change-password` | Access cookie  | `profile`, `profileUpdate` | Change the password using the current password                 |
| `GET`    | `/profile/me/audit-logs`      | Access cookie  | `profile`                  | Return paginated audit logs, newest first                      |

Unmatched paths fall through to the host app's 404 handler and Express's default HTML response.

### CSRF protection

Every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`) must echo the `csrfToken` cookie in the `X-CSRF-Token` header. The router sets the cookie on any request and `GET /auth/csrf-token` also returns the token in the JSON envelope. Requests that create or recover a session — `POST /auth`, `/auth/login`, `/auth/forgot-password`, and `/auth/reset-password/:token` — are exempt; everything else, including logout, refresh, and profile changes, is protected. A missing or mismatched token returns `403` with the standard error envelope.

The cookie is deliberately not `httpOnly` so same-origin browser clients can read it from `document.cookie`. Cross-origin clients can call `GET /auth/csrf-token` and send the returned value in the header while keeping their cookies.

The OAuth routes are always mounted. Configuring `oauth.google` or `oauth.github` determines whether the flow can start; an unconfigured provider redirects to a login error.

### Request bodies

| Route                              | Fields                                                             | Rules                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth`                       | `username`, `email`, `password`, `bio?`, `phoneNumber?`, `gender?` | `username` 3–30 characters; valid email; password at least 8 characters with one uppercase letter and one digit; `bio` 3–200 characters; `phoneNumber` 10–15 digits; `gender` is `male`, `female`, or `other` |
| `POST /auth/login`                 | `email?`, `username?`, `password`                                  | At least one of `email` or `username`; non-empty password                                                                                                                                                     |
| `POST /auth/forgot-password`       | `email`                                                            | Valid email                                                                                                                                                                                                   |
| `POST /auth/reset-password/:token` | `password`                                                         | Same password rules as registration                                                                                                                                                                           |
| `PUT /profile/me`                  | `username?`, `bio?`, `phoneNumber?`, `gender?`                     | Same field rules as registration; all fields optional                                                                                                                                                         |
| `POST /profile/me/change-password` | `currentPassword`, `newPassword`                                   | Non-empty current password; new password follows the password rules                                                                                                                                           |

Schemas come from `@cred-kit/core` (`registerSchema`, `loginSchema`, `passwordForgotSchema`, `passwordResetSchema`, `profileSchema`, `passwordChangeSchema`). Unknown fields are stripped. Validation runs with a middleware that accepts any object with `safeParse`; the adapter does not import Zod directly.

`logout` and `refresh` accept no body validation. The OAuth routes accept no JSON body.

### Auth examples

Register:

```http
POST /api/auth
Content-Type: application/json

{
  "username": "alice",
  "email": "alice@example.com",
  "password": "Password1"
}
```

```json
{
  "success": true,
  "message": "User registered successfully. Verify your email first.",
  "data": {}
}
```

Status: `201`.

Login:

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "alice@example.com", "password": "Password1" }
```

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "user": {
      "id": "user-id",
      "email": "alice@example.com",
      "username": "alice",
      "provider": "local",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

The response also sets the access and refresh cookies.

Refresh:

```json
{ "success": true, "message": "Token refreshed successfully", "data": null }
```

Logout:

```json
{ "success": true, "message": "Logged out successfully", "data": null }
```

Email verification always redirects:

```text
GET /api/auth/verify-email/:token
302 Location: https://app.example.com/login?verified=true
```

A malformed, expired, or already-used token redirects to `https://app.example.com/login?verified=false`. The route never returns a JSON error for a bad token.

Forgot password always returns the same response, whether or not the account exists:

```json
{
  "success": true,
  "message": "If an account exists, a password reset link has been sent",
  "data": null
}
```

Reset password:

```json
{ "success": true, "message": "Password reset successfully", "data": null }
```

If the reset token is invalid or expired, the response is `400` with `Invalid or expired token`.

Password-reset emails link to `GET {backendUrl}{authPathPrefix}/reset-password/:token`. That GET
does not validate or consume the token; it redirects the browser to
`${clientUrl}/reset-password?token=<token>`. The client page collects the new password and submits
`POST /auth/reset-password/:token` with `{ "password": "..." }` to finish the reset. Change
`clientUrl` if your frontend reset page lives somewhere other than `/reset-password`.

### Profile and audit examples

Get profile:

```json
{
  "success": true,
  "message": "Profile fetched successfully",
  "data": {
    "id": "user-id",
    "username": "alice",
    "email": "alice@example.com",
    "provider": "local",
    "isVerified": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Update profile:

```http
PUT /api/profile/me
Content-Type: application/json

{ "bio": "hello there" }
```

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "user-id",
    "username": "alice",
    "email": "alice@example.com",
    "bio": "hello there"
  }
}
```

Change password returns `{ "success": true, "message": "Password updated successfully", "data": ... }`. A wrong current password returns `400` with `Current password is incorrect`.

Delete account returns:

```json
{ "success": true, "message": "Account deleted successfully", "data": null }
```

Audit logs accept `page` and `limit` query parameters. Non-numeric values are ignored, and core clamps the range (maximum 100, default 20). The response shape is:

```json
{
  "success": true,
  "message": "Audit logs fetched successfully",
  "data": {
    "logs": [],
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

Without an audit adapter, the route returns:

```json
{
  "success": false,
  "message": "Audit logging is not configured",
  "error": "Audit logging is not configured"
}
```

Status: `503`.

### OAuth routes

The four OAuth routes redirect rather than returning JSON. See [OAuth setup](#oauth-setup) for configuration, callback URLs, and outcomes.

## Response and error format

Successful JSON responses use:

```ts
interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
```

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": { "user": { "id": "user-id" } }
}
```

Errors use the same envelope, with `message` and `error` set to the same string:

```json
{
  "success": false,
  "message": "Invalid Credentials",
  "error": "Invalid Credentials"
}
```

### AuthError handling

Controllers do not translate error codes. An `AuthError` thrown by `@cred-kit/core` is sent with the status code and message carried by the error:

```ts
sendError(res, error.message, error.statusCode);
```

The `AuthError.code` is not included in the HTTP body. The same code can carry different messages and statuses depending on where core throws it.

Observed responses:

| Core error code                | Status | Message                                               | Trigger                                   |
| ------------------------------ | ------ | ----------------------------------------------------- | ----------------------------------------- |
| `INVALID_CREDENTIALS`          | `401`  | `Invalid Credentials`                                 | Login failure                             |
| `USER_EXISTS`                  | `400`  | `User already exists`                                 | Duplicate registration                    |
| `MISSING_TOKEN`                | `401`  | `Refresh token not found.`                            | Refresh with no refresh cookie            |
| `REFRESH_TOKEN_NOT_FOUND`      | `401`  | `Invalid token.`                                      | Refresh with a malformed or unknown token |
| `REFRESH_TOKEN_REUSE_DETECTED` | `401`  | `Refresh token reuse detected. All sessions revoked.` | Replaying a rotated refresh token         |
| `INVALID_CURRENT_PASSWORD`     | `400`  | `Current password is incorrect`                       | Wrong password on change-password         |
| `INVALID_TOKEN`                | `400`  | `Invalid or expired token`                            | Invalid password-reset token              |

The auth middleware handles missing and invalid access tokens itself:

| Condition                             | Status | Message         |
| ------------------------------------- | ------ | --------------- |
| No access-token cookie                | `401`  | `Unauthorized`  |
| Invalid, expired, or non-access token | `401`  | `Invalid token` |

Other errors:

| Condition                 | Status | Body                                                                                           |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Zod validation failure    | `400`  | `{ "errors": [ ...issues ] }`                                                                  |
| Malformed JSON            | `400`  | `{ "success": false, "message": "Invalid JSON body", "error": "Invalid JSON body" }`           |
| Body over `jsonBodyLimit` | `413`  | `{ "success": false, "message": "Request body too large", "error": "Request body too large" }` |
| Unhandled error           | `500`  | `{ "success": false, "message": "Internal server error", "error": "Internal server error" }`   |
| No audit adapter          | `503`  | `{ "success": false, "message": "Audit logging is not configured", ... }`                      |

Unhandled errors are logged through `logger.error('@cred-kit/express: unhandled request error', error)` and reduced to a generic `500`. Error details are not sent to the client. If response headers have already been sent, the error is passed to the host app's error handler.

### Validation errors

Validation failures are the one response that does not use the success/error envelope:

```json
{
  "errors": [
    {
      "code": "invalid_type",
      "path": ["username"],
      "message": "Invalid input: expected string, received undefined"
    }
  ]
}
```

Status: `400`. The body is the `issues` array from the schema's `safeParse` result.

### Rate-limit responses

Rate-limit responses are not JSON. The body is the limiter's configured `message` string and the status is `429`:

```text
Too many login attempts, please try again in 15 minutes.
```

Express sends this as `text/html; charset=utf-8` with the default string response. `Retry-After` is present. Clients should not assume the normal JSON envelope on `429`.

### Redirects

| Flow               | Condition                                              | Redirect                                          |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------- |
| Email verification | Success                                                | `${clientUrl}/login?verified=true`                |
| Email verification | Invalid, expired, or used token                        | `${clientUrl}/login?verified=false`               |
| OAuth start        | Provider not configured                                | `${clientUrl}/login?error={provider}_auth_failed` |
| OAuth callback     | State missing or mismatched                            | `${clientUrl}/login?error=oauth_state_mismatch`   |
| OAuth callback     | Provider error, missing code, or profile fetch failure | `${clientUrl}/login?error={provider}_auth_failed` |
| OAuth callback     | Core could not create or link the user                 | `${clientUrl}/login?error=oauth_failed`           |
| OAuth success      | User created or linked                                 | `${clientUrl}/auth/callback`                      |

## Cookies and sessions

| Cookie        | Default name   | Path                                    | Max-Age                                                                   | Flags                                                                       |
| ------------- | -------------- | --------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Access token  | `token`        | `cookies.accessTokenPath` (default `/`) | `cookies.accessTokenMaxAgeMs` (default 15 minutes)                        | `httpOnly`, `sameSite` from config (default `strict`), `secure` from config |
| Refresh token | `refreshToken` | `${basePath}/auth`                      | `cookies.refreshTokenMaxAgeMs` (default `core.refreshTokenTtlMs`, 7 days) | `httpOnly`, `sameSite` from config (default `strict`), `secure` from config |
| OAuth state   | `oauth_state`  | `${basePath}/auth`                      | 10 minutes                                                                | `httpOnly`, `sameSite=lax`, `secure` from config                            |
| CSRF token    | `csrfToken`    | `/`                                     | `cookies.refreshTokenMaxAgeMs` (7 days by default)                        | `httpOnly: false`, `sameSite` from config, `secure` from config             |

`secure` defaults to `NODE_ENV === 'production'`. It is not automatically enabled for HTTPS in other environments; set `cookies.secure: true` explicitly when serving over HTTPS outside production.

Cookie options:

| Option                 | Default                     | Notes                      |
| ---------------------- | --------------------------- | -------------------------- |
| `accessTokenName`      | `token`                     | Must be a non-empty string |
| `refreshTokenName`     | `refreshToken`              | Must be a non-empty string |
| `secure`               | `NODE_ENV === 'production'` | Boolean                    |
| `sameSite`             | `strict`                    | `strict`, `lax`, or `none` |
| `domain`               | unset                       | Optional cookie domain     |
| `accessTokenPath`      | `/`                         | Must start with `/`        |
| `accessTokenMaxAgeMs`  | `900000`                    | Positive integer           |
| `refreshTokenMaxAgeMs` | `core.refreshTokenTtlMs`    | Positive integer           |

> **Warning:** `cookies.sameSite: 'none'` requires `cookies.secure: true`. Configuration rejects the combination otherwise.

The refresh token and OAuth state cookies are scoped to `${basePath}/auth`, so they are not sent on profile requests and are not shared with the rest of your app. The access token defaults to path `/`, so it is sent to all paths on the host.

OAuth callbacks set the auth cookies with `sameSite=lax` instead of the configured policy because the request arrives through a cross-site redirect. All other successful login and refresh responses use `cookies.sameSite`.

Logout clears both auth cookies. Account deletion clears both auth cookies. A refresh failure with a token present clears both cookies when core reports one of these codes:

- `REFRESH_TOKEN_NOT_FOUND`
- `REFRESH_TOKEN_EXPIRED`
- `REFRESH_TOKEN_REUSE_DETECTED`
- `UNEXPECTED_ERROR_OCCURRED`

Other refresh errors leave the cookies in place so the client can retry.

The token lifetimes and cookie lifetimes are configured separately:

- The JWT's lifetime comes from `core.accessTokenExpiry` (default `15m`).
- The access cookie's lifetime comes from `cookies.accessTokenMaxAgeMs` (default `900000`).
- The refresh token's lifetime comes from `core.refreshTokenTtlMs` (default 7 days).
- The refresh cookie's lifetime comes from `cookies.refreshTokenMaxAgeMs`, which defaults to `core.refreshTokenTtlMs`.

If you override one side, keep the other side consistent. Setting `cookies.accessTokenMaxAgeMs` does not change the JWT expiry, and setting `core.accessTokenExpiry` does not change the cookie max-age.

Refresh rotation and replay detection are performed by `@cred-kit/core`. This adapter stores the returned tokens in cookies. A replayed refresh token produces `401 Refresh token reuse detected. All sessions revoked.` and clears the cookies.

## OAuth setup

Google and GitHub are implemented with `fetch`; Passport is not used and there is no global strategy registry.

```ts
const cred = await credExpress({
  // ...
  oauth: {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!
    },
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET!
    }
  }
});
```

A provider is enabled only when both `clientId` and `clientSecret` are non-empty strings.

Register these callback URLs with the providers:

```text
{backendUrl}{basePath}/auth/google/callback
{backendUrl}{basePath}/auth/github/callback
```

With the defaults, that is:

```text
https://api.example.com/api/auth/google/callback
https://api.example.com/api/auth/github/callback
```

Provider details:

| Provider | Authorization endpoint                         | Scope/parameters                                                      |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| Google   | `https://accounts.google.com/o/oauth2/v2/auth` | `openid email profile`, `access_type=online`, `prompt=select_account` |
| GitHub   | `https://github.com/login/oauth/authorize`     | `user:email`                                                          |

State handling:

1. `GET /auth/{provider}` generates 32 random bytes as a hex state value.
2. The state is stored in the `oauth_state` cookie (`httpOnly`, `sameSite=lax`, path `${basePath}/auth`, 10 minutes, `secure` from config).
3. The state is sent to the provider as the `state` query parameter.
4. `GET /auth/{provider}/callback` compares the cookie with the query value. Missing or unequal values redirect to `${clientUrl}/login?error=oauth_state_mismatch`.
5. On a match, the state cookie is cleared before the code exchange.

The state cookie follows `cookies.secure`, which defaults to `NODE_ENV === 'production'`. OAuth therefore works over plain HTTP on a non-localhost development origin when `cookies.secure` is `false`; production deployments should keep it `true` and serve over HTTPS.

OAuth outcomes:

| Outcome                                                                   | Redirect                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| Success                                                                   | `${clientUrl}/auth/callback`                      |
| State missing or mismatched                                               | `${clientUrl}/login?error=oauth_state_mismatch`   |
| Provider not configured                                                   | `${clientUrl}/login?error={provider}_auth_failed` |
| Provider returned an error, no code, or the token/profile exchange failed | `${clientUrl}/login?error={provider}_auth_failed` |
| Core could not create or link the user                                    | `${clientUrl}/login?error=oauth_failed`           |

On success, the callback sets the access and refresh cookies with `sameSite=lax` and redirects to `${clientUrl}/auth/callback`.

The profile passed to core contains `provider`, `profileId`, `email`, `displayName`, `avatar`, and `isEmailVerified`.

- Google sets `isEmailVerified` to true only when an email is present and Google reports `email_verified: true`.
- GitHub reads `/user/emails` and selects a verified primary address, falling back to any verified address. It ignores the unverified public email from `/user`. `isEmailVerified` is true when a verified email was found.

Core only uses an OAuth email to link an existing account when `isEmailVerified` is true.

When linking an existing local account, core changes the user's `provider` to the OAuth provider (`google` or `github`). After linking, the account can no longer use password login, password change, or password reset — it must sign in through the linked OAuth provider. If you need to preserve password auth on an existing account, do not let the OAuth flow auto-link by verified email; instead, present the user with their current session and offer an explicit linking step if desired.

Provider requests time out after 10 seconds. Provider and core failures are logged through `logger` with the provider name, and the client receives a redirect rather than a JSON error.

## Rate limiting

Rate limiters are created from `rateLimits` merged over `defaultCredRateLimits`.

| Key              | Window     | Max | Applies to                                            |
| ---------------- | ---------- | --- | ----------------------------------------------------- |
| `auth`           | 15 minutes | 20  | Every `/auth/*` request, including OAuth              |
| `login`          | 15 minutes | 5   | `POST /auth/login`                                    |
| `register`       | 60 minutes | 3   | `POST /auth`                                          |
| `forgotPassword` | 60 minutes | 3   | `POST /auth/forgot-password`                          |
| `refresh`        | 15 minutes | 10  | `POST /auth/refresh`                                  |
| `verifyEmail`    | 15 minutes | 10  | `GET /auth/verify-email/:token`                       |
| `resetPassword`  | 15 minutes | 5   | `POST /auth/reset-password/:token`                    |
| `logout`         | 15 minutes | 20  | `POST /auth/logout`                                   |
| `oauth`          | 15 minutes | 10  | All OAuth routes                                      |
| `profile`        | 15 minutes | 50  | Every `/profile/*` request                            |
| `profileUpdate`  | 15 minutes | 50  | `PUT /profile/me`, `POST /profile/me/change-password` |
| `health`         | 60 seconds | 30  | `GET /health`                                         |

The health limiter is separate and does not share the `auth` or `profile` budget. It is configured through `health.rateLimit`.

Each rule accepts a partial override:

```ts
rateLimits: {
  login: { max: 10, windowMs: 10 * 60 * 1000 },
  register: { message: 'Registration is temporarily limited.' },
}
```

A route passes through the broad group limiter and its route-specific limiter, so the tighter budget applies. For example, login is counted by both `auth` (20 per 15 minutes) and `login` (5 per 15 minutes).

The limiters use `express-rate-limit` with `standardHeaders: true` and `legacyHeaders: false`. By default each limiter uses `express-rate-limit`'s in-memory store. Counters are not shared across processes or hosts. If you run multiple instances, each instance enforces its own counters.

To share counters across processes, pass a `rateLimitStoreFactory` that returns a shared store instance (e.g., `@cred-kit/rate-limit-redis` or a custom `Store` implementation). The factory receives a distinct `keyPrefix` for each limiter so a shared backend can keep counters isolated:

```ts
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const cred = await credExpress({
  // ...
  rateLimitStoreFactory: (keyPrefix) =>
    new RedisStore({
      prefix: `cred:rl:${keyPrefix}:`,
      sendCommand: (...args) => redis.sendCommand(args)
    })
});
```

The factory is called once per limiter (12 total), so each limiter gets its own store instance. `express-rate-limit` rejects sharing a single store instance between multiple limiters. The `keyPrefix` values are stable per limiter (`auth`, `login`, `register`, `forgot-password`, `refresh`, `verify-email`, `reset-password`, `logout`, `oauth`, `profile`, `profile-update`, `health`), so Redis keys never collide across limiters.

> **Note:** Rate-limit keys are based on `req.ip`. The router does not set `trust proxy`. If the app runs behind a proxy, set `app.set('trust proxy', ...)` on the host so limits and audit IPs see the client address rather than the proxy address.

## Security notes

What the package does:

- Rejects invalid configuration at startup, including a JWT secret shorter than 32 characters.
- Stores access and refresh tokens in `httpOnly` cookies. `secure` defaults to production and can be enabled explicitly; `sameSite` defaults to `strict`.
- Uses `sameSite=lax` for OAuth state and OAuth callback cookies because those requests cross sites.
- Generates a random 32-byte OAuth state value and verifies it against an `httpOnly` cookie.
- Issues a double-submit CSRF token cookie and requires `X-CSRF-Token` on unsafe requests outside the session-creation routes.
- Applies rate limits to every auth, profile, and health route.
- Mounts `GET /health` before CSRF middleware, so health probes do not set CSRF cookies.
- Forwards `req.ip` and the `user-agent` header to core for audit logging.
- Returns a generic `500 Internal server error` for unhandled errors and does not include internal error details in the response.
- Returns the canonical forgot-password message for unknown emails and email-send failures.

What remains the host application's responsibility:

- Serving the API over HTTPS and setting `cookies.secure` appropriately.
- Configuring `trust proxy` when behind a proxy.
- CORS. The package does not add a CORS middleware.
- Helmet or other security headers. The package does not add helmet.
- Storing `JWT_SECRET`, OAuth client secrets, database credentials, and SMTP credentials securely.
- Keeping the JWT secret at least 32 characters long.
- Database security, backups, and email deliverability.

### Host setup example

```ts
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { credExpress } from '@cred-kit/express';

const app = express();

// Host-level middleware — runs before the Cred router.
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL!,
    credentials: true,
  }),
);

// Trust the first proxy hop so audit IPs and rate limits see the client address.
app.set('trust proxy', 1);

const cred = await credExpress({
  // ... your config here
});

app.use('/api', cred);
```

Install the required peer packages yourself; they are not included in this adapter:

```bash
pnpm add cors helmet
pnpm add -D @types/cors @types/helmet
```

The 10 KB default JSON body limit applies to the whole mounted router. Increase `jsonBodyLimit` only if a Cred request body actually needs it.

## Limitations and known constraints

- **ESM-only.** The build produces `dist/index.mjs` and `dist/index.d.mts`; `exports` has no `require` condition.
- **Manual base path.** `basePath` is not derived from `req.baseUrl`. You must pass the mount path or use the default `/api`.
- **No email link construction.** The adapter passes the raw token to the email adapter; `basePath` is not used to build verification or reset links. With the bundled SMTP options, set `authPathPrefix` to match the mount path.
- **OAuth routes always exist.** A provider that is not configured redirects to `${clientUrl}/login?error={provider}_auth_failed` instead of returning 404.
- **Database option pass-through is narrow.** For `{ uri }` and `{ connection }`, only that property is passed to `@cred-kit/mongo-storage`; other properties on the same object are ignored.
- **No configurable OAuth scopes, endpoints, or timeout.** Google and GitHub use fixed endpoints, scopes, and a 10-second timeout.
- **No CORS, helmet, or proxy configuration.** These are host responsibilities.
- **No catch-all route.** Unmatched paths fall through to the host app's 404 handling.
- **Audit logs depend on the audit adapter.** Without one, writes are dropped and the audit route returns `503`.
- **Separate token and cookie lifetimes.** `core.accessTokenExpiry` and `cookies.accessTokenMaxAgeMs` are independent, as are `core.refreshTokenTtlMs` and `cookies.refreshTokenMaxAgeMs`.
- **JSON only.** The router mounts `express.json()` and `cookie-parser`; it does not mount a URL-encoded body parser.
- **Pre-1.0.** The public API may change between minor versions.

## Protecting your own routes

`createAuthGuard` applies the same access-token verification the router uses to any host route. It reads the access-token cookie itself, so you do not need to mount `cookie-parser` first, and it sets `req.user` to the verified payload.

```ts
import express from 'express';
import { createAuthGuard } from '@cred-kit/express';

const app = express();

app.get('/dashboard', createAuthGuard({ jwtSecret: process.env.JWT_SECRET! }), (req, res) => {
  // req.user is typed as JWTPayload | undefined; the guard guarantees it here.
  res.json({ id: req.user!.id, email: req.user!.email });
});
```

Options:

| Option       | Type     | Default   | Description                                                  |
| ------------ | -------- | --------- | ------------------------------------------------------------ |
| `jwtSecret`  | `string` | required  | HS256 signing secret; must be at least 32 characters         |
| `cookieName` | `string` | `'token'` | Access-token cookie name, matching `cookies.accessTokenName` |

Failure responses match the router's protected routes: a missing cookie returns `401 { success: false, message: 'Unauthorized', error: 'Unauthorized' }`, and an invalid, expired, or refresh-type token returns `401 { success: false, message: 'Invalid token', error: 'Invalid token' }`. The guard does not apply CSRF or rate limiting; mount those separately if your host routes need them.

`req.user` is a global augmentation of `Express.Request` with `JWTPayload | undefined`. If your application already augments `req.user` for another library, make sure the declarations are compatible.

## TypeScript

The package ships declarations for every export. Run the build before typechecking against `dist`, or rely on the published package.

Runtime exports:

```ts
import {
  credExpress,
  createAuthGuard,
  createCoreRuntime,
  resolveCredConfig,
  resolveCredRateLimits,
  createCoreAuthConfig,
  defaultCredRateLimits
} from '@cred-kit/express';
```

Type exports:

```ts
import type {
  CredExpressConfig,
  ResolvedCredExpressConfig,
  CredExpressRouter,
  CredDatabaseConfig,
  CredDatabaseInput,
  CredMongoStorageOptions,
  CredEmailInput,
  CredEmailServiceOptions,
  CredOAuthConfig,
  CredOAuthProviderConfig,
  CredCookieConfig,
  ResolvedCredCookieConfig,
  CredRateLimitRule,
  CredRateLimits,
  CredRateLimitsInput,
  CredSameSite,
  CredErrorLogger,
  CredCoreDeps,
  CredCoreRuntime,
  CredAuthGuardOptions,
  CredLocals,
  CredOAuthProvider,
  CredRequestContext,
  ResolvedCredDatabase,
  ResolvedCredEmail
} from '@cred-kit/express';
```

Example:

```ts
import { credExpress, type CredExpressConfig, type CredExpressRouter } from '@cred-kit/express';

const config: CredExpressConfig = {
  database: { uri: process.env.MONGO_URI! },
  email: {
    EMAIL_FROM: 'no-reply@example.com',
    BACKEND_URL: 'https://api.example.com'
  },
  jwtSecret: process.env.JWT_SECRET!,
  clientUrl: 'https://app.example.com',
  backendUrl: 'https://api.example.com'
};

const router: CredExpressRouter = await credExpress(config);
await router.close();
```

`CredExpressRouter` extends Express's `Router` with a `close(): Promise<void>` method. `close()` is idempotent. It closes the `@cred-kit/mongo-storage` instance created from `{ uri }` or `{ connection }`, and the `@cred-kit/smtp` service created from email options. Prebuilt adapters supplied by the host are not closed.

The package augments the global Express request type with `user?: JWTPayload`. Use `createAuthGuard` on host routes to populate it; the router's own protected routes populate both `req.user` and `res.locals.credUser`.

## Troubleshooting

| Symptom                                                                                  | Cause                                                                 | Fix                                                                    |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@cred-kit/express: Cred: jwtSecret must be at least 32 characters`                      | Secret is too short                                                   | Use a secret of at least 32 characters                                 |
| `@cred-kit/express: "jwtSecret" is required and must be a string`                        | Missing or non-string secret                                          | Pass `jwtSecret`                                                       |
| `@cred-kit/express: "basePath" must start with "/"`                                      | Path does not start with a slash                                      | Use `/api`, `/v1`, or `/`                                              |
| `@cred-kit/express: "cookieName" must be a non-empty string`                             | `createAuthGuard` received a blank cookie name                        | Omit it to use `token` or pass a real cookie name                      |
| `401 Unauthorized` on a host route using `createAuthGuard`                               | The access-token cookie is missing or has a different name            | Log in first; set `cookieName` to match `cookies.accessTokenName`      |
| `@cred-kit/express: "clientUrl" must be an absolute URL`                                 | Value is not an absolute URL                                          | Use `https://app.example.com`                                          |
| `@cred-kit/express: "clientUrl" must not contain a query string or fragment`             | URL includes `?` or `#`                                               | Pass only the base URL                                                 |
| `@cred-kit/express: "cookies.sameSite" cannot be "none" while "cookies.secure" is false` | Cross-site cookies without HTTPS                                      | Set `cookies.secure: true`                                             |
| `@cred-kit/express: "database" must provide MongoDB options ...`                         | Empty or unrecognized database object                                 | Pass `{ uri }`, `{ connection }`, or `{ user, refreshToken }`          |
| `@cred-kit/express: "email" must provide email service options ...`                      | Missing `EMAIL_FROM`/`BACKEND_URL` or adapter methods                 | Pass both options or a full `EmailAdapter`                             |
| `401 Refresh token not found.` after login                                               | Refresh cookie is missing or scoped to another path                   | Make the mount path match `basePath`; check cookie domain and `secure` |
| Verification or reset link returns 404                                                   | `authPathPrefix` does not match the mount path                        | Set `email.authPathPrefix` to `${basePath}/auth`                       |
| `401 Invalid token` on profile routes                                                    | Access cookie is missing, expired, or is not an access token          | Log in again or refresh                                                |
| OAuth redirects to `...?error=oauth_state_mismatch`                                      | State cookie missing, expired, or path mismatch                       | Check `basePath`, cookie path, and the 10-minute window                |
| OAuth redirects to `...?error=google_auth_failed` or `...?error=github_auth_failed`      | Provider not configured or provider exchange failed                   | Check credentials, callback URL, and logs                              |
| OAuth redirects to `...?error=oauth_failed`                                              | Core could not create or link the user                                | Check `logger.error` output and adapter data                           |
| `429` with a plain-text body                                                             | A rate limit was exceeded                                             | Wait for the window or raise the rule                                  |
| `503 Audit logging is not configured`                                                    | Prebuilt database adapters have no `audit`                            | Add an `AuditDatabaseAdapter`                                          |
| `413 Request body too large`                                                             | Body exceeds `jsonBodyLimit`                                          | Send a smaller body or raise the limit                                 |
| `400 Invalid JSON body`                                                                  | Malformed JSON                                                        | Send valid JSON                                                        |
| `404` HTML page under the mount                                                          | Path is not part of the Cred router                                   | Check the route table; the host handles 404s                           |
| A CommonJS `require()` cannot load the package                                           | The package is ESM-only and the export map has no `require` condition | Import it from an ES module                                            |

For unexpected errors, pass a `logger` and inspect its output. The router logs unhandled request errors, OAuth provider failures, OAuth callback failures, and adapter cleanup failures.

## Testing and development

From the repository root:

```bash
pnpm --filter @cred-kit/express build
pnpm --filter @cred-kit/express typecheck
pnpm --filter @cred-kit/express lint
pnpm --filter @cred-kit/express test
pnpm --filter @cred-kit/express pack --dry-run
```

Verified in this checkout:

- `pnpm --filter @cred-kit/express build` passes and produces `dist/index.mjs` (about 47 kB) and `dist/index.d.mts` (about 10 kB).
- `pnpm --filter @cred-kit/express typecheck` passes.
- `pnpm --filter @cred-kit/express lint` passes.
- `pnpm --filter @cred-kit/express test` passes: **46 tests across 5 files** (`auth`, `guard`, `health`, `rate-limit`, `router`).
- `pnpm --filter @cred-kit/express pack --dry-run` lists `dist/index.d.mts`, `dist/index.mjs`, `package.json`, and `README.md`.

The tests are HTTP-level characterization tests built with Vitest and Supertest. They mount the real router on an Express app with in-memory core adapter fakes, so no MongoDB or SMTP connection is required. Coverage includes registration and verification, login and cookie attributes, refresh rotation, logout, CSRF enforcement, JSON body limits, `AuthError` and unknown-error mapping, router mounts and 404s, auth rate limiting, OAuth start redirects and state validation, the exported auth guard, authenticated profile access, health route, and rate-limit store factory.

Package scripts:

| Script       | Command          |
| ------------ | ---------------- |
| `build`      | `tsdown`         |
| `dev`        | `tsdown --watch` |
| `lint`       | `eslint .`       |
| `lint:fix`   | `eslint . --fix` |
| `test`       | `vitest run`     |
| `test:watch` | `vitest`         |
| `typecheck`  | `tsc --noEmit`   |
| `prepack`    | `pnpm build`     |

## Related packages

- `@cred-kit/core` — core authentication services and adapter interfaces used by this router.
- `@cred-kit/mongo-storage` — MongoDB storage adapter constructed by default from `database` options.
- `@cred-kit/smtp` — email adapter constructed by default from `email` options.

## Contributing

Open an issue or pull request at [github.com/NehanAhmed/cred](https://github.com/NehanAhmed/cred). Keep changes scoped to the package and run the build, typecheck, and lint commands above before submitting.

## License

MIT. See the repository [LICENSE](https://github.com/NehanAhmed/cred/blob/main/LICENSE).

Copyright (c) 2026 Nehan Ahmed — Cred
