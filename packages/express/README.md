# @cred/express

Express 5 adapter for [Cred](https://github.com/NehanAhmed/cred). It exposes the complete
authentication, profile, and audit API as a single mountable router backed by
[`@cred/core`](../core). The adapter owns HTTP concerns — routing, validation, cookies,
redirects, rate limiting, OAuth redirects, and error responses — and delegates every auth
decision to core.

- ESM-only, TypeScript, Express 5
- No database or mailer imports: storage and email are injected as adapters
- Rotating refresh tokens in `httpOnly` cookies with reuse detection
- Google and GitHub OAuth authorization-code flow (no Passport global state)
- Rate limits identical to the shipped Cred API
- Router-scoped JSON parsing and cookie parsing; the rest of your app is untouched

---

## Install

```bash
pnpm add @cred/express @cred/core express cookie-parser express-rate-limit
```

Install the adapters you want to use:

```bash
pnpm add @cred/mongo-storage mongoose @cred/smtp
```

`@cred/core`, `express`, `cookie-parser`, and `express-rate-limit` are peer dependencies, so
the host application supplies a single copy of each.

---

## Quick start

```ts
import express from 'express';
import { credExpress } from '@cred/express';
import { mongooseStorage } from '@cred/mongo-storage';
import { emailService } from '@cred/smtp';

const app = express();

// Cred reads the forwarded client IP for auditing and rate limiting.
app.set('trust proxy', 1);

const storage = mongooseStorage({ uri: process.env.MONGO_URI! });
await storage.ready();

const { EMAIL } = await emailService({
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
});

app.use(
  '/api',
  credExpress({
    database: {
      user: storage.user,
      refreshToken: storage.refreshToken,
      audit: storage.auditLogs, // optional
    },
    email: EMAIL,
    jwtSecret: process.env.JWT_SECRET!, // >= 32 characters
    clientUrl: 'https://app.example.com',
    backendUrl: 'https://api.example.com',
  }),
);

app.listen(3000);
```

That single mount exposes `POST /api/auth/login`, `GET /api/profile/me`,
`GET /api/auth/google/callback`, and every other route listed below. Cred does not create an
HTTP server and does not define routes outside the returned router.

---

## Mount path and `basePath`

The path passed to `app.use` **must** match `basePath` (default `/api`):

```ts
app.use('/api', credExpress({ /* basePath: '/api' (default) */ }));
// or
app.use('/v1', credExpress({ /* ... */, basePath: '/v1' }));
```

`basePath` has three effects:

1. It scopes the refresh-token cookie to `${basePath}/auth` and the OAuth state cookie to the
   same path.
2. It appears in the OAuth callback URLs registered with Google/GitHub.
3. It is the path prefix that verification and reset email links must target.

> **Email links:** `@cred/express` passes the raw token to the injected `EmailAdapter`; link
> building belongs to that adapter. The current `@cred/smtp` adapter builds
> `${BACKEND_URL}/api/auth/...` links, so use the default `basePath: '/api'` with it (or a
> custom email adapter that targets your base path).

`clientUrl` and `backendUrl` must be absolute `http(s)` origins without a query string,
fragment, or Cred route path. `backendUrl` is the public API origin only; `basePath` is
appended by the adapter.

---

## Configuration

| Option | Required | Default | Description |
|---|---|---|---|
| `database.user` | yes | — | `UserDatabaseAdapter` |
| `database.refreshToken` | yes | — | `RefreshTokenDatabaseAdapter` |
| `database.audit` | no | — | `AuditDatabaseAdapter`. Without it, audit writes are dropped and `GET /profile/me/audit-logs` returns `503` |
| `email` | yes | — | `EmailAdapter` (`sendEmailVerification`, `sendPasswordReset`) |
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

Configuration is validated when `credExpress(...)` is called. Invalid URLs, a short JWT
secret, missing adapters, or malformed rate limits throw at startup, before any request is
served.

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
- **Stateless instances:** OAuth is implemented with `fetch` rather than Passport, so there is
  no global strategy registry. Multiple routers (for example one per tenant) do not share
  state; rate-limit memory stores are per instance.
- **Testing:** this package intentionally ships without a test suite; its behavior is verified
  against `@cred/core` and the reference API.

## License

MIT
