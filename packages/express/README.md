# @cred/express

Express 5 adapter for [Cred](https://github.com/NehanAhmed/cred). It exposes the complete
authentication, profile, and audit API as a single mountable router backed by
[`@cred/core`](../core). The adapter owns HTTP concerns — routing, validation, cookies,
redirects, rate limiting, OAuth redirects, and error responses — and delegates every auth
decision to core.

- ESM-only, TypeScript, Express 5
- Builds the official MongoDB (`@cred/mongo-storage`) and SMTP/Resend (`@cred/smtp`)
  adapters from your config, while still accepting prebuilt adapters for custom backends
- Rotating refresh tokens in `httpOnly` cookies with reuse detection
- Google and GitHub OAuth authorization-code flow (no Passport global state)
- Rate limits identical to the shipped Cred API
- Router-scoped JSON parsing and cookie parsing; the rest of your app is untouched

---

## Install

```bash
pnpm add @cred/express @cred/core express cookie-parser express-rate-limit mongoose nodemailer
```

`@cred/express` depends on `@cred/mongo-storage` and `@cred/smtp` to build the default
adapters. `@cred/core`, `express`, `cookie-parser`, `express-rate-limit`, `mongoose`, and
`nodemailer` are peer dependencies, so the host application supplies a single copy of each.

The Mongoose and Nodemailer peers are required because the package loads the official
adapters. If you use prebuilt adapters for another backend, those libraries are installed but
never contacted.

---

## Quick start

```ts
import express from 'express';
import { credExpress } from '@cred/express';

const app = express();

// Cred reads the forwarded client IP for auditing and rate limiting.
app.set('trust proxy', 1);

const router = await credExpress({
  database: { uri: process.env.MONGO_URI! },
  email: {
    EMAIL_FROM: 'no-reply@example.com',
    BACKEND_URL: 'https://api.example.com',
    // RESEND_API_KEY: process.env.RESEND_API_KEY, // omit to use SMTP
  },
  jwtSecret: process.env.JWT_SECRET!, // >= 32 characters
  clientUrl: 'https://app.example.com',
  backendUrl: 'https://api.example.com',
});

app.use('/api', router);

// During graceful shutdown: closes the MongoDB connection and mail transport.
process.on('SIGTERM', async () => {
  await router.close();
  process.exit(0);
});

app.listen(3000);
```

`credExpress` is asynchronous because the email service is built asynchronously, and it waits
for the MongoDB connection before returning. Mount the resolved router; do not mount the
promise.

That single mount exposes `POST /api/auth/login`, `GET /api/profile/me`,
`GET /api/auth/google/callback`, and every other route listed below. Cred does not create an
HTTP server and does not define routes outside the returned router.

---

## Adapters and lifecycle

By default the adapter constructs both dependencies from the supplied options and injects
them into `@cred/core`:

- `database: { uri }` creates a connection with `mongooseStorage` and exposes its user,
  refresh-token, and audit adapters. `database: { connection }` uses an existing
  `mongoose.Connection` instead and does not close it.
- `email: { EMAIL_FROM, BACKEND_URL, ... }` creates an `@cred/smtp` service using SMTP or
  Resend. Additional fields are the same as `@cred/smtp`'s `emailServiceOptions`
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `RESEND_API_KEY`, `provider`,
  `verifyOnStart`, ...).

Resources created this way are released by `router.close()`, which is idempotent. A connection
you pass in through `{ connection }`, and any prebuilt adapters you supply, remain owned by
your application and are never closed by Cred.

### Custom adapters

To use another database or mail provider, pass prebuilt implementations of core's adapter
interfaces instead of options:

```ts
const router = await credExpress({
  database: {
    user: myUserAdapter,
    refreshToken: myRefreshTokenAdapter,
    audit: myAuditAdapter, // optional
  },
  email: myEmailAdapter,
  jwtSecret: process.env.JWT_SECRET!,
  clientUrl: 'https://app.example.com',
  backendUrl: 'https://api.example.com',
});
```

Custom adapters must implement the interfaces exported by `@cred/core`
(`UserDatabaseAdapter`, `RefreshTokenDatabaseAdapter`, `AuditDatabaseAdapter`,
`EmailAdapter`). Cred does not close them; manage their lifecycle in the host application.

---

## Mount path and `basePath`

The path passed to `app.use` **must** match `basePath` (default `/api`):

```ts
app.use('/api', await credExpress({ /* basePath: '/api' (default) */ }));
// or
app.use('/v1', await credExpress({ /* ... */, basePath: '/v1' }));
```

`basePath` has three effects:

1. It scopes the refresh-token cookie to `${basePath}/auth` and the OAuth state cookie to the
   same path.
2. It appears in the OAuth callback URLs registered with Google/GitHub.
3. It is the path prefix that verification and reset email links must target.

> **Email links:** `@cred/express` passes the raw token to the email adapter; link building
> belongs to that adapter. The bundled `@cred/smtp` service builds
> `${BACKEND_URL}/api/auth/...` links, so use the default `basePath: '/api'` with it (or a
> custom email adapter that targets your base path).

`clientUrl` and `backendUrl` must be absolute `http(s)` origins without a query string,
fragment, or Cred route path. `backendUrl` is the public API origin only; `basePath` is
appended by the adapter.

---

## Configuration

| Option | Required | Default | Description |
|---|---|---|---|
| `database` | yes | — | `{ uri }` or `{ connection }` to build `@cred/mongo-storage`; or `{ user, refreshToken, audit? }` prebuilt adapters |
| `email` | yes | — | `@cred/smtp` options (`EMAIL_FROM`, `BACKEND_URL`, ...); or a prebuilt `EmailAdapter` |
| `jwtSecret` | yes | — | HS256 secret, at least 32 characters |
| `clientUrl` | yes | — | Frontend origin used for login, verification, and OAuth redirects |
| `backendUrl` | yes | — | Public API origin used for OAuth callback URLs |
| `basePath` | no | `/api` | Public mount path; must match `app.use(...)` |
| `oauth.google` | no | — | `{ clientId, clientSecret }` |
| `oauth.github` | no | — | `{ clientId, clientSecret }` |
| `cookies` | no | see below | Cookie names, paths, lifetime, flags |
| `rateLimits` | no | see below | Partial overrides per limiter |
| `core` | no | core defaults | `Partial<CredConfig>`: token lifetimes, bcrypt rounds, lockout policy |
| `jsonBodyLimit` | no | `10kb` | JSON body limit for the mounted router |
| `logger` | no | `console` | Object with `error(...args)` for unexpected errors |

With the built-in MongoDB adapter, audit storage is always available. With prebuilt adapters,
`database.audit` is optional: without it, audit writes are dropped and
`GET /profile/me/audit-logs` returns `503`.

Configuration is validated when `credExpress(...)` is called, and the MongoDB/email adapters
are built before the router is returned. Invalid URLs, a short JWT secret, missing adapter
options, or malformed rate limits throw at startup, before any request is served.

### Cookies

| Cookie | Default name | Path | Lifetime | Flags |
|---|---|---|---|---|
| Access token | `token` | `/` | 15 minutes | `httpOnly`, `sameSite=strict`, `secure` in production |
| Refresh token | `refreshToken` | `${basePath}/auth` | `core.refreshTokenTtlMs` (7 days) | `httpOnly`, `sameSite=strict`, `secure` in production |
| OAuth state | `oauth_state` | `${basePath}/auth` | 10 minutes | `httpOnly`, `sameSite=lax`, `secure` in production |

OAuth callbacks write the auth cookies with `sameSite=lax` because they run during a
cross-site redirect. If the frontend is on a different site and needs cross-site cookies in
other flows, set `cookies.sameSite: 'none'` together with `cookies.secure: true`.

```ts
cookies: {
  accessTokenName: 'token',
  refreshTokenName: 'refreshToken',
  accessTokenPath: '/',
  accessTokenMaxAgeMs: 15 * 60 * 1000,
  refreshTokenMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  secure: true,
  sameSite: 'strict',
  domain: '.example.com',
}
```

### OAuth

Set both fields for each provider you want to enable:

```ts
oauth: {
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  },
  github: {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID!,
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
  },
}
```

Register these callback URLs with the providers:

```text
{backendUrl}{basePath}/auth/google/callback
{backendUrl}{basePath}/auth/github/callback
```

A provider that is not configured still has routes, but starting its flow redirects to
`{clientUrl}/login?error={provider}_auth_failed`.

OAuth outcomes:

| Outcome | Redirect |
|---|---|
| Success | `{clientUrl}/auth/callback` |
| State missing/mismatched | `{clientUrl}/login?error=oauth_state_mismatch` |
| Provider denied or token/profile exchange failed | `{clientUrl}/login?error={provider}_auth_failed` |
| Core could not create/link the user | `{clientUrl}/login?error=oauth_failed` |

Emails are only used to link an existing account when the provider reports them as verified.

### Rate limits

Every rule accepts a partial override: `{ windowMs?, max?, message? }`.

| Key | Window | Max | Applies to |
|---|---|---|---|
| `auth` | 15 min | 20 | All `/auth/*`, including OAuth |
| `login` | 15 min | 5 | `POST /auth/login` |
| `register` | 60 min | 3 | `POST /auth` |
| `forgotPassword` | 60 min | 3 | `POST /auth/forgot-password` |
| `refresh` | 15 min | 10 | `POST /auth/refresh` |
| `verifyEmail` | 15 min | 10 | `GET /auth/verify-email/:token` |
| `resetPassword` | 15 min | 5 | `POST /auth/reset-password/:token` |
| `logout` | 15 min | 20 | `POST /auth/logout` |
| `oauth` | 15 min | 10 | All OAuth routes |
| `profile` | 15 min | 50 | All `/profile/*` |
| `profileUpdate` | 15 min | 50 | `PUT /profile/me`, `POST /profile/me/change-password` |

```ts
rateLimits: {
  login: { max: 10, windowMs: 10 * 60 * 1000 },
}
```

Rate-limit responses are `express-rate-limit`'s plain-text body, not the JSON envelope.

---

## Routes

All paths are relative to the mount (`{basePath}`).

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth` | No | Register; sends a verification email; `201` |
| POST | `/auth/login` | No | Email **or** username + password; sets cookies |
| POST | `/auth/logout` | Yes | Deletes the presented refresh token and clears cookies |
| POST | `/auth/refresh` | Refresh cookie | Rotates the refresh token and issues a new access token |
| GET | `/auth/verify-email/:token` | No | Always redirects to `{clientUrl}/login?verified=true|false` |
| POST | `/auth/forgot-password` | No | Same response for known and unknown emails |
| POST | `/auth/reset-password/:token` | No | One-time reset token; revokes all refresh tokens |
| GET | `/auth/google`, `/auth/google/callback` | No | Google OAuth |
| GET | `/auth/github`, `/auth/github/callback` | No | GitHub OAuth |

### Profile and audit

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile/me` | Yes | Returns the current user without `password` |
| PUT | `/profile/me` | Yes | Partial update; omitted fields are untouched |
| DELETE | `/profile/me` | Yes | Deletes the user and all refresh tokens; clears cookies |
| POST | `/profile/me/change-password` | Yes | Requires the current password; revokes all refresh tokens |
| GET | `/profile/me/audit-logs` | Yes | Paginated (`page`, `limit` 1–100), newest first |

---

## Responses and errors

Successful JSON responses use the shared envelope:

```json
{ "success": true, "message": "Logged in successfully", "data": { "user": {} } }
```

Errors use:

```json
{ "success": false, "message": "Invalid Credentials", "error": "Invalid Credentials" }
```

`AuthError` from `@cred/core` supplies the status code and message, so auth failures keep
core's semantics (`401`, `400`, `404`, `500`, ...). The one exception is body validation,
which returns `400` with Zod issues:

```json
{ "errors": [{ "code": "too_small", "path": ["password"], "message": "..." }] }
```

Malformed JSON returns `400 { success: false, ... }` and an oversized body returns `413`.
Unhandled errors are logged via `logger` and reduced to `500 Internal server error`; internal
details are never sent to the client.

---

## Implementation notes

- **Scope:** `express.json({ limit })` and `cookieParser()` are mounted inside the returned
  router, so they only affect Cred routes.
- **Security middleware:** helmet, CORS, and `app.set('trust proxy', ...)` are host
  responsibilities. Set `trust proxy` whenever the API runs behind a proxy so audit IPs and
  rate limits see the client address.
- **Dependency construction:** the adapter builds `@cred/mongo-storage` and `@cred/smtp` from
  your options and passes only core's adapter interfaces into core. Core never imports a
  concrete driver or mailer.
- **Lifecycle:** `await router.close()` releases connections and transports created by the
  adapter. Prebuilt adapters and caller-owned Mongo connections are left untouched.
- **Stateless instances:** OAuth is implemented with `fetch` rather than Passport, so there is
  no global strategy registry. Multiple routers (for example one per tenant) do not share
  state; rate-limit memory stores are per instance.
- **Testing:** this package intentionally ships without a test suite; its behavior is verified
  against `@cred/core` and the reference API.

## License

MIT
