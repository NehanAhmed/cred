<p align="center">
  <img src="https://ik.imagekit.io/td7wr0ax7o/Gemini_Generated_Image_cwp7cbcwp7cbcwp7.clean.png" alt="Cred banner" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Mongoose-9.x-880000?logo=mongodb&logoColor=white" alt="Mongoose">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm-10.33.2-F69220?logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="MIT License">
</p>

<h1 align="center">Cred</h1>

<p align="center">
  Adapter-based authentication for Node.js. Mount one Express router to get registration, email
  verification, password login, Google and GitHub OAuth, rotating refresh tokens, profile
  management, and audit logs. The domain logic is framework- and storage-agnostic.
</p>

## Status

Cred is pre-1.0. The four public packages are published on npm at `0.1.0`. The authentication
core, MongoDB storage adapter, and email adapter are covered by Vitest, and the Express adapter has
an HTTP-level Vitest suite that mounts the router with in-memory adapter fakes.

| Package / app | Version | Registry | Tests | Status |
|---|---:|---|---:|---|
| `@cred-kit/core` | 0.1.0 | npm | 138 in 7 files | Implemented and tested |
| `@cred-kit/mongo-storage` | 0.1.0 | npm | 187 in 9 files | Implemented and tested |
| `@cred-kit/smtp` | 0.1.0 | npm | 75 in 5 files | Implemented and tested |
| `@cred-kit/express` | 0.1.0 | npm | 22 in 2 files | Implemented and tested |
| `@cred-kit/shared` | 0.0.0 | private | none | Compatibility re-export shim |
| `@cred-kit/config` | 0.0.0 | private | n/a | Shared TypeScript configs only |
| `apps/cred-testing` | 0.0.1 | private | none | Manual Next.js tester; partially aligned |
| `apps/demo` | 1.0.0 | private | none | Scratch Express host example |

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Packages](#packages)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Security model](#security-model)
- [Known limitations](#known-limitations)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview

Cred is not a standalone authentication server. It is a set of packages that you mount inside
your own Node.js application. `@cred-kit/core` owns the authentication rules — password hashing,
verified email flows, token rotation, account lockout, OAuth account linking, profiles, and audit
events — and talks to storage and email through small adapter interfaces. `@cred-kit/express`
turns those services into an Express 5 router with cookies, CSRF protection, rate limiting,
redirects, and JSON responses.

The host application still owns the HTTP server, TLS, CORS, security headers, proxy trust, secret
storage, and the user experience. Cred supplies the authentication domain and an Express transport
for it.

## Features

- **Registration and email verification** — bcrypt-hashed passwords, single-use verification
  tokens, and rollback of the new user when the verification email cannot be sent.
- **Password login** — email or username, verified-email enforcement, generic invalid-credential
  responses, and a five-attempt / fifteen-minute account lockout.
- **Rotating refresh tokens** — opaque `lookupId.secret` tokens, only the secret stored as a
  bcrypt hash, atomic rotation, and replay detection that revokes the whole token family.
- **Access tokens** — HS256 JWTs with a `tokenType: 'access'` claim, a fifteen-minute default
  lifetime, and a minimum secret length enforced before signing.
- **Password reset** — anti-enumeration responses, one-hour single-use tokens, atomic consumption,
  and revocation of all refresh tokens before the password changes.
- **Google and GitHub OAuth** — authorization-code flow implemented with `fetch` (no Passport),
  a random `oauth_state` cookie, and email-based linking only when the provider verified the email.
- **Profile management** — read, partial update, password change, and account deletion, with
  password and token material stripped from every returned user.
- **Audit logs** — structured events for every authentication action, written fire-and-forget so an
  audit-store outage cannot fail the operation being audited.
- **MongoDB storage adapter** — user, refresh-token, and audit-log models with indexes and TTLs.
- **SMTP and Resend email adapters** — Nodemailer SMTP with pooling and TLS defaults, or the Resend
  HTTP API, selected from configuration.
- **Typed validators** — Zod 4 schemas for registration, login, password reset, password change,
  and profile updates.
- **ESM-only packages** — bundled TypeScript declarations and no CommonJS build.

## Architecture

```text
Your Express application
  │
  └── @cred-kit/express                  HTTP adapter: routes, cookies, CSRF, rate limits
        │
        ├── @cred-kit/core               authentication services, token rules, Zod schemas
        │
        ├── @cred-kit/mongo-storage      default user / refresh-token / audit adapters
        │
        └── @cred-kit/smtp               default SMTP or Resend email adapter
```

`@cred-kit/express` builds the bundled MongoDB and email adapters when you pass database and email
options. You can also pass prebuilt `@cred-kit/core` adapters for another backend.

| Layer | Responsibility |
|---|---|
| Host application | HTTP server, TLS, CORS, helmet, `trust proxy`, global middleware, 404 handling |
| `@cred-kit/express` | Route table, request parsing, Zod validation, cookies, redirects, CSRF, rate limiters, response envelopes, error mapping |
| `@cred-kit/core` | Registration, verification, login, refresh rotation, OAuth user creation/linking, profiles, audit operations |
| Storage adapter | Persistence for users, refresh tokens, and optional audit logs |
| Email adapter | Verification and reset message delivery |

Core never reads environment variables, opens database connections, sends network requests, sets
cookies, or applies rate limits. Those are host or adapter responsibilities.

## Packages

| Package | Purpose | Install |
|---|---|---|
| `@cred-kit/core` | Framework- and storage-agnostic authentication services and adapter interfaces | `npm install @cred-kit/core` |
| `@cred-kit/express` | Express 5 router that mounts the authentication, profile, and audit routes | `npm install @cred-kit/express` |
| `@cred-kit/mongo-storage` | Mongoose models and adapters for users, refresh tokens, and audit logs | `npm install @cred-kit/mongo-storage` |
| `@cred-kit/smtp` | SMTP (Nodemailer) and Resend email adapters | `npm install @cred-kit/smtp` |

`@cred-kit/express` depends on `@cred-kit/mongo-storage` and `@cred-kit/smtp`, and declares
`@cred-kit/core`, `cookie-parser`, `express`, `express-rate-limit`, `mongoose`, and `nodemailer` as
peer dependencies. Install the peers in the host application.

Notable exports:

- `@cred-kit/core` — services such as `register`, `verifyEmail`, `login`, `logout`, `refresh`,
  `forgotPassword`, `resetPassword`, `findOrCreateOAuthUser`, `oauthCallback`, `getProfile`,
  `updateProfile`, `updatePassword`, `deleteAccount`, and `getAuditLogs`; adapter interfaces; Zod
  schemas; token and audit helpers; email HTML templates.
- `@cred-kit/express` — `credExpress`, `createCoreRuntime`, `resolveCredConfig`,
  `resolveCredRateLimits`, `createCoreAuthConfig`, `defaultCredRateLimits`, and the public
  configuration types.
- `@cred-kit/mongo-storage` — `mongooseStorage`, `MongooseStorage`, and `MongooseStorageOptions`.
- `@cred-kit/smtp` — `emailService`, `resolveProvider`, `EmailApiError`, and the SMTP/Resend option
  types.

`@cred-kit/shared` and `@cred-kit/config` are private workspace packages. `@cred-kit/shared`
re-exports core types and validators for compatibility; no package imports it. `@cred-kit/config`
contains only shared `tsconfig` files.

## Quick start

Requirements:

- Node.js **22 or newer** (the published packages declare `engines.node >= 22`).
- A running MongoDB instance, local or hosted.
- SMTP credentials, or a Resend API key, if you want registration and password-reset emails to be
  delivered.

Create a project and install the adapter with its peer dependencies:

```bash
mkdir cred-app
cd cred-app
npm init -y
npm install @cred-kit/express @cred-kit/core express cookie-parser express-rate-limit mongoose nodemailer
npm install -D typescript tsx @types/express @types/node
npm pkg set type=module
```

Create `src/index.ts`:

```ts
import express from 'express';
import { credExpress } from '@cred-kit/express';

const app = express();
app.set('trust proxy', 1);

const cred = await credExpress({
  database: { uri: process.env.MONGO_URI! },
  email: {
    EMAIL_FROM: process.env.EMAIL_FROM ?? 'no-reply@example.com',
    BACKEND_URL: process.env.BACKEND_URL ?? 'http://localhost:3000',
    SMTP_HOST: process.env.SMTP_HOST!,
    SMTP_PORT: process.env.SMTP_PORT ?? 587,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  },
  jwtSecret: process.env.JWT_SECRET!, // at least 32 characters
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:3000',
});

app.use('/api', cred);

const server = app.listen(3000, () => {
  console.log('Cred API listening on http://localhost:3000');
});

const shutdown = async (): Promise<void> => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cred.close();
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
```

Set these environment variables before starting the process:

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string, for example `mongodb://127.0.0.1:27017/cred` |
| `JWT_SECRET` | Yes | At least 32 characters; Cred rejects shorter secrets at startup |
| `SMTP_HOST` | Yes with the SMTP provider | Hostname of your SMTP server |
| `SMTP_PORT` | No | Defaults to `587` in the example |
| `SMTP_USER` / `SMTP_PASS` | No | Set both together if your SMTP server requires authentication |
| `EMAIL_FROM` | No | Defaults to `no-reply@example.com` in the example |
| `BACKEND_URL` | No | Defaults to `http://localhost:3000` in the example |
| `CLIENT_URL` | No | Defaults to `http://localhost:5173` in the example |

Start MongoDB, then run:

```bash
npx tsx src/index.ts
```

The router is mounted at `http://localhost:3000/api`. `GET /api/auth/csrf-token` returns a token
and sets the `csrfToken` cookie.

The server starts even when the SMTP host is unreachable, because the transport connects lazily.
Registration and password-reset requests still need working email credentials; without them those
flows fail at send time. To use Resend instead of SMTP, replace the `SMTP_*` fields with
`RESEND_API_KEY: process.env.RESEND_API_KEY!` and set that variable.

## How it works

A request passes through the mounted router:

```text
request
  -> @cred-kit/express router
     -> express.json({ limit }) and cookieParser()
     -> CSRF middleware
     -> /auth/* or /profile/*
        -> broad rate limiter
        -> route-specific rate limiter
        -> Zod validation where a body is accepted
        -> access-token check on protected routes
        -> controller
           -> @cred-kit/core service
              -> storage adapters and email adapter
  -> error handler
```

Routes are relative to the mount point. With the default `basePath: '/api'`, the full paths are:

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth` | Public | Register and send a verification email; `201` |
| `POST` | `/api/auth/login` | Public | Log in with email or username plus password; sets cookies |
| `POST` | `/api/auth/logout` | Access cookie | Delete the presented refresh token and clear cookies |
| `POST` | `/api/auth/refresh` | Refresh cookie | Rotate the refresh token and issue a new access token |
| `GET` | `/api/auth/csrf-token` | Public | Return the CSRF token and ensure the `csrfToken` cookie is set |
| `GET` | `/api/auth/verify-email/:token` | Public | Verify an email address; always redirects to the client |
| `POST` | `/api/auth/forgot-password` | Public | Request a reset link; always returns the same message |
| `POST` | `/api/auth/reset-password/:token` | Public | Reset a password with a one-time token |
| `GET` | `/api/auth/google` | Public | Start Google OAuth |
| `GET` | `/api/auth/google/callback` | Public | Finish Google OAuth |
| `GET` | `/api/auth/github` | Public | Start GitHub OAuth |
| `GET` | `/api/auth/github/callback` | Public | Finish GitHub OAuth |
| `GET` | `/api/profile/me` | Access cookie | Return the current profile without the password |
| `PUT` | `/api/profile/me` | Access cookie | Partially update username, bio, phone number, or gender |
| `DELETE` | `/api/profile/me` | Access cookie | Delete the account, revoke refresh tokens, and clear cookies |
| `POST` | `/api/profile/me/change-password` | Access cookie | Change the password using the current password |
| `GET` | `/api/profile/me/audit-logs` | Access cookie | Return paginated audit logs, newest first |

There is no health endpoint in `@cred-kit/express`. Unmatched paths fall through to the host
application's 404 handler.

### Response format

Successful JSON responses use:

```json
{ "success": true, "message": "Logged in successfully", "data": {} }
```

Errors use the same envelope:

```json
{ "success": false, "message": "Invalid Credentials", "error": "Invalid Credentials" }
```

Zod validation failures are the exception and return `400 { "errors": [ ...issues ] }`. Rate-limit
responses return the configured message string with status `429`, not the JSON envelope.

### CSRF protection

Every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`) must echo the `csrfToken` cookie in the
`X-CSRF-Token` header. The cookie is intentionally not `httpOnly` so same-origin browser clients
can read it. Requests that create or recover a session — `POST /auth`, `POST /auth/login`,
`POST /auth/forgot-password`, and `POST /auth/reset-password/:token` — are exempt; logout, refresh,
and profile changes are protected.

### Redirects

Email verification redirects to `${clientUrl}/login?verified=true` or
`${clientUrl}/login?verified=false`. OAuth success redirects to `${clientUrl}/auth/callback`.
OAuth failures redirect to `${clientUrl}/login?error=...` with an error code such as
`oauth_state_mismatch`, `google_auth_failed`, `github_auth_failed`, or `oauth_failed`.

## Configuration

`credExpress` validates its configuration before mounting any route, so mistakes fail at startup
rather than on the first request.

### `credExpress` options

| Option | Required | Default | Description |
|---|---|---|---|
| `database` | Yes | — | `{ uri }`, `{ connection }`, or prebuilt `{ user, refreshToken, audit? }` adapters |
| `email` | Yes | — | Email service options or a prebuilt `EmailAdapter` |
| `jwtSecret` | Yes | — | HS256 signing secret; at least 32 characters |
| `clientUrl` | Yes | — | Absolute `http`/`https` URL used for verification and OAuth redirects |
| `backendUrl` | Yes | — | Absolute public API URL used to build OAuth callback URLs; do not include `basePath` |
| `basePath` | No | `/api` | Public mount path; must match the path passed to `app.use(...)` |
| `oauth` | No | `{}` | Optional Google and GitHub `clientId` / `clientSecret` pairs |
| `cookies` | No | see below | Cookie names, paths, lifetimes, `secure`, `sameSite`, and `domain` |
| `rateLimits` | No | `defaultCredRateLimits` | Partial overrides for any limiter |
| `core` | No | core defaults | Token lifetimes, bcrypt rounds, lockout policy, audit page sizes |
| `jsonBodyLimit` | No | `10kb` | JSON body limit for the mounted router |
| `logger` | No | `console` | Object with an `error(...args)` method for unexpected errors |

`database` accepts exactly one shape:

```ts
// Build the bundled MongoDB adapter.
database: { uri: process.env.MONGO_URI! }

// Use an existing Mongoose connection.
database: { connection: existingMongooseConnection }

// Supply prebuilt core adapters.
database: { user, refreshToken, audit }
```

`email` accepts either the bundled email service options or a prebuilt core `EmailAdapter`:

```ts
// SMTP
email: {
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
}

// Resend
email: {
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
  RESEND_API_KEY: process.env.RESEND_API_KEY!,
}
```

SMTP defaults to port `587`, implicit TLS when the port is `465`, and `requireTLS` when the
connection is not already secure. `SMTP_USER` and `SMTP_PASS` must be set together. The Resend
provider is selected automatically when `RESEND_API_KEY` is set, or explicitly with
`provider: 'resend'`. Set `verifyOnStart: true` if you want startup to fail when the email
credentials are invalid; it defaults to `false`.

Email verification and reset links are built from `BACKEND_URL` plus `authPathPrefix` (default
`/api/auth`). If you mount the router at a path other than `/api`, set `authPathPrefix` to
`${basePath}/auth`; for example, `basePath: '/v1'` pairs with `authPathPrefix: '/v1/auth'`.

### Core tunables

`core` is a partial override of the defaults below:

| Field | Default | Meaning |
|---|---:|---|
| `accessTokenExpiry` | `15m` | Access-token lifetime passed to the JWT signer |
| `refreshTokenTtlMs` | `604800000` (7 days) | Refresh-token lifetime |
| `tokenHashRounds` | `10` | bcrypt rounds for refresh, verification, and reset token secrets |
| `passwordHashRounds` | `10` | bcrypt rounds for passwords |
| `lockoutThreshold` | `5` | Failed logins before the account locks |
| `lockoutDurationMs` | `900000` (15 minutes) | Lockout duration |
| `verificationTokenTtlMs` | `86400000` (24 hours) | Email-verification token lifetime |
| `resetTokenTtlMs` | `3600000` (1 hour) | Password-reset token lifetime |
| `auditMaxLimit` | `100` | Maximum audit-log page size |
| `auditDefaultLimit` | `20` | Default audit-log page size |

### Rate limits

| Key | Window | Max | Applies to |
|---|---:|---:|---|
| `auth` | 15 min | 20 | Every `/auth/*` request, including OAuth |
| `login` | 15 min | 5 | `POST /auth/login` |
| `register` | 60 min | 3 | `POST /auth` |
| `forgotPassword` | 60 min | 3 | `POST /auth/forgot-password` |
| `refresh` | 15 min | 10 | `POST /auth/refresh` |
| `verifyEmail` | 15 min | 10 | `GET /auth/verify-email/:token` |
| `resetPassword` | 15 min | 5 | `POST /auth/reset-password/:token` |
| `logout` | 15 min | 20 | `POST /auth/logout` |
| `oauth` | 15 min | 10 | All OAuth routes |
| `profile` | 15 min | 50 | Every `/profile/*` request |
| `profileUpdate` | 15 min | 50 | `PUT /profile/me` and `POST /profile/me/change-password` |

Each rule accepts a partial override:

```ts
rateLimits: {
  login: { max: 10, windowMs: 10 * 60 * 1000 },
  register: { message: 'Registration is temporarily limited.' },
}
```

A route passes through the broad group limiter and its route-specific limiter, so the tighter
budget wins. The limiters use `express-rate-limit`'s default in-memory store; counters are per
process and are not shared across instances.

### Environment variables

The packages read only `process.env.NODE_ENV`, and only for one decision: the default value of
`cookies.secure` (`NODE_ENV === 'production'`). Everything else — MongoDB credentials, the JWT
secret, SMTP or Resend credentials, URLs, and OAuth client secrets — is read by the host
application and passed into `credExpress`.

## Security model

| Area | Implemented behavior |
|---|---|
| Passwords | bcrypt with 10 rounds by default; never returned in API responses |
| Access token | HS256 JWT, 15 minutes by default, payload `{ id, email, username, tokenType: 'access' }` |
| JWT secret | Must be a non-empty string of at least 32 characters; checked before signing |
| Refresh token | Opaque `lookupId.secret`, 7 days by default; only the secret is bcrypt-hashed at rest |
| Rotation | Every refresh atomically claims the old token and issues a successor in the same family |
| Replay detection | Presenting a consumed refresh token revokes the entire family |
| Email verification | Single-use, 24 hours by default, bcrypt-hashed token secret |
| Password reset | Single-use, 1 hour by default, bcrypt-hashed token secret; all refresh tokens revoked before the password changes |
| Login lockout | 5 failed attempts trigger a 15-minute lock; an active lock is not extended by further failures |
| Enumeration | Unknown users and wrong passwords both return `Invalid Credentials`; forgot-password always returns the same message |
| OAuth state | Random 32-byte state stored in an `httpOnly` cookie and compared on callback |
| OAuth linking | An email links an existing account only when the provider reports the email as verified |
| CSRF | Double-submit cookie; unsafe requests require `X-CSRF-Token` |
| Audit logs | Fire-and-forget writes; failures never break the audited operation; 90-day TTL in MongoDB |
| Transport | Cookies, CSRF, CORS, HTTPS, and rate limiting are split between the adapter and the host as described below |

### Cookies

| Cookie | Default name | Path | Max-Age | Flags |
|---|---|---|---:|---|
| Access token | `token` | `/` | 15 min | `httpOnly`, `sameSite=strict` by default, `secure` in production by default |
| Refresh token | `refreshToken` | `${basePath}/auth` | 7 days | `httpOnly`, `sameSite=strict` by default, `secure` in production by default, AES-256-GCM encrypted value |
| CSRF token | `csrfToken` | `/` | 7 days | not `httpOnly`, `sameSite=strict` by default, `secure` in production by default |
| OAuth state | `oauth_state` | `${basePath}/auth` | 10 min | `httpOnly`, `sameSite=lax`, `secure: true` always |

The refresh-token cookie value is encrypted with AES-256-GCM using a key derived from `jwtSecret`.
The access token and refresh token lifetimes are configured separately: the JWT expiry comes from
`core.accessTokenExpiry`, while the cookie lifetime comes from `cookies.accessTokenMaxAgeMs`.

### Host responsibilities

Cred does not add CORS, helmet, HTTPS, or `trust proxy`. Configure those in the host application.
Set `app.set('trust proxy', ...)` when the API runs behind a proxy so rate limits and audit IPs see
the client address. Serve the API over HTTPS and set `cookies.secure: true` outside production when
you do.

## Known limitations

- **No health endpoint.** `@cred-kit/express` does not expose `/api/health`. The `apps/cred-testing`
  health panel and its health rate-limit entry call `/api/health`, which returns 404 against the
  adapter.
- **No CORS, helmet, or proxy configuration.** These remain host responsibilities.
- **No custom rate-limit store.** Counters are in memory and are not shared across processes.
- **No exported auth guard or `req.user` augmentation.** Protected routes live inside the router;
  your own routes must verify the access token themselves with `verifyAccessToken` from
  `@cred-kit/core`.
- **ESM-only.** The packages publish `dist/index.mjs` and `dist/index.d.mts` with no CommonJS
  `require` condition.
- **`basePath` must match the mount path.** A mismatch scopes the refresh cookie to the wrong path
  and builds the wrong OAuth callback URL. With the bundled SMTP options, also set
  `email.authPathPrefix` to `${basePath}/auth`; the two values are configured independently.
- **OAuth requires HTTPS or localhost.** The `oauth_state` cookie is always `secure: true`, so
  browsers will not send it over plain HTTP on a non-localhost origin.
- **Linking a local account through OAuth changes its login method.** The account's `provider` is
  set to `google` or `github`, and password login and password change are then rejected.
- **`pnpm format:check` is not a clean gate.** The command runs, but it reports 136
  pre-existing unformatted files. Format only the files you change; no repository-wide formatting
  commit has been made.
- **`apps/demo` is a scratch example.** It has working build/start scripts and reads credentials
  from `apps/demo/.env.local`; see `apps/demo/README.md`. Do not deploy it as-is.
- **Pre-1.0.** Public APIs may change between minor versions.

## Repository layout

```text
cred/
├── apps/
│   ├── cred-testing/          Next.js 16 manual API tester (private)
│   └── demo/                  Incomplete Express host example (private)
├── packages/
│   ├── core/                  @cred-kit/core
│   ├── express/               @cred-kit/express
│   ├── mongo-storage/         @cred-kit/mongo-storage
│   ├── smtp/                  @cred-kit/smtp
│   ├── shared/                @cred-kit/shared (private compatibility shim)
│   └── config/                @cred-kit/config (private tsconfig files)
├── specs/                     Adapter design notes
├── .github/workflows/         CI
├── API.md                     Old standalone-API reference (not current)
├── AGENTS.md                  Contributor/agent notes (partly stale)
├── LICENSE
└── README.md
```

## Development

Install dependencies with the pinned pnpm version and run the repository checks:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`pnpm format:check` runs, but it currently reports pre-existing formatting issues. Format only the
files you change.

Root `pnpm dev` starts the demo API and the Next.js tester in watch mode. Root `pnpm start` runs
their built start scripts, so run `pnpm build` first.

Package-scoped commands:

```bash
pnpm --filter @cred-kit/core test
pnpm --filter @cred-kit/mongo-storage test
pnpm --filter @cred-kit/smtp test
pnpm --filter @cred-kit/express build
pnpm --filter @cred-kit/express typecheck
pnpm --filter @cred-kit/express lint
pnpm --filter ./packages/* exec pnpm pack --dry-run
```

The Next.js tester runs on port 5173:

```bash
pnpm --filter cred-testing dev
```

The repository uses pnpm `10.33.2` and Turborepo. CI runs `build`, `lint`, `typecheck`, and `test`
on Node 22 and 24 across Ubuntu and Windows, plus a package-contents job that runs the pack
dry-run.

## Testing

The root `pnpm test` runs the Vitest suites in the three tested packages:

| Package | Framework | Files | Tests | Coverage focus |
|---|---|---:|---:|---|
| `@cred-kit/core` | Vitest with in-memory fakes | 7 | 138 | Registration, verification, login and lockout, refresh rotation and replay, password reset, OAuth linking, profiles, audit pagination, token helpers, validators |
| `@cred-kit/mongo-storage` | Vitest + `mongodb-memory-server` | 9 | 187 | User, refresh-token, and audit models and adapters, indexes, TTLs, and atomic updates |
| `@cred-kit/smtp` | Vitest | 5 | 75 | SMTP transport options, Resend HTTP behavior, retries, link construction, and email templates |
| `@cred-kit/express` | Vitest with Supertest and in-memory adapter fakes | 2 | 22 | Registration, login, refresh, logout, CSRF, rate limiting, OAuth start/state, error mapping, and profile access |
| `apps/cred-testing` | none | 0 | 0 | No tests |

That is **390 tests across 21 files**. The first DB-backed run downloads a MongoDB binary for
`mongodb-memory-server`; CI caches it under `.mongodb-binaries`.

## Roadmap

No roadmap is published in this repository. The packages are pre-1.0, and the only design note in
the checkout is `specs/01-express-adapter.md`. Track work in the repository's issue tracker:
[github.com/NehanAhmed/cred/issues](https://github.com/NehanAhmed/cred/issues).

## Contributing

Open an issue or pull request at [github.com/NehanAhmed/cred](https://github.com/NehanAhmed/cred).
Before submitting, run `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`, and keep
changes scoped to the affected package.

## License

MIT. See [LICENSE](./LICENSE).

Copyright © 2026 Nehan Ahmed — Cred
