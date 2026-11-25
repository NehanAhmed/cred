# AGENTS.md — Cred

Cred is a drop-in authentication API adapter: Express 5 + Mongoose 9 + TypeScript, packaged as a
pnpm/Turborepo monorepo. There is no frontend and no CI in this repository. The adapter
packages (`@cred-kit/express`, `@cred-kit/core`, `@cred-kit/mongo-storage`, `@cred-kit/smtp`)
are published separately; `apps/cred-testing` and `apps/demo` are private example apps.

## Project state (verified 2026-11-25)

- `pnpm build` passes: Turborepo builds all packages (`tsup` for shared, `tsdown` for
  express/core/mongo-storage/smtp). The private `@cred-kit/shared` package exists as a
  compatibility shim; no adapter package depends on it at runtime.
- Vitest defines **448 tests across 4 packages**: core 138 in 7 files, mongo-storage 187 in
  9 files, smtp 77 in 5 files, express 46 in 5 files. `README.md` and `CONTRIBUTING.md` document
  these counts; the test suites remain the source of truth if they drift.
- This checkout is a git repo on branch `fix/known-limitations`. Use git freely.
- `pnpm dev` starts the Next.js tester at port 5173 and `tsx watch` on the demo. Both work on
  Windows when `.env.local` is present.
- `pnpm test` runs Vitest per-package (no cross-platform env syntax issues). DB-backed tests use
  `mongodb-memory-server`; the first run downloads the binary into `%USERPROFILE%\.cache\mongodb-binaries`.
- ESLint and Prettier run at the package level. Root `pnpm format:check` reports 136 pre-existing
  unformatted files. Do not reformat the whole repo as a side effect.
- Changesets manage versions. `@cred-kit/express` (minor) and `@cred-kit/smtp` (minor) have pending
  changesets from the known-limitations fixes.

## Commands

```bash
pnpm install          # pnpm 10.33.2; workspace packages apps/* and packages/*
pnpm build            # turbo build -> tsup @cred-kit/shared, tsdown for each adapter
pnpm start            # turbo start -> cred-testing next start + demo node dist/index.mjs
pnpm test             # vitest run per-package
pnpm format           # Prettier --write over apps/**/*.ts and packages/**/*.ts
pnpm format:check     # currently fails on 136 pre-existing files
pnpm exec changeset status  # review pending changesets before versioning
```

Single suite / single test (Vitest):

```powershell
pnpm --filter @cred-kit/express test -- --reporter=verbose src/__tests__/router.test.ts
pnpm --filter @cred-kit/express test -- -t "returns the standard envelope"
```

`pnpm build` is the typecheck gate for each package (`tsc --noEmit` is a separate script you can
run with `pnpm --filter <pkg> typecheck`). Do not run `pnpm format` across the repo unless the
task is explicitly a formatting task.

## Stack

- **Express 5**, **Mongoose 9**, **TypeScript 6** (strict, ES2022, ESM + NodeNext)
- **Zod 4** validators/types shared between packages
- **JWT** access tokens via `jsonwebtoken`; rotating refresh tokens in httpOnly cookies; **bcryptjs**
  (10 rounds)
- Google + GitHub OAuth implemented with `fetch` (no Passport). Optional; disabled when credentials
  are absent.
- **Nodemailer** SMTP with pooling (optional) and Resend HTTP API (optional) via `@cred-kit/smtp`
- `express-rate-limit`, 10 KB JSON body limit, `trust proxy = 1` — host responsibilities per the
  README
- **Vitest 5** + supertest + mongodb-memory-server across all packages

## Architecture

```text
cred/
  packages/core/                  @cred-kit/core — auth services, adapters, helpers
    src/services/auth.service.ts  registration, login, refresh, logout, verify, reset
    src/services/oauth.service.ts Google + GitHub find-or-create/link
    src/services/profile.service.ts read, update, change password, delete
    src/services/audit.service.ts structured audit event writes
    src/helpers/auth.helper.ts   token generation/verification, SHA-256 hashers
    src/helpers/audit.helper.ts  audit log builder
    src/templates/email.templates.ts HTML email bodies
    src/validators/*.ts          Zod 4 schemas
    src/types/*.ts               JWTPayload, adapter interfaces, errors
    src/__tests__/*.test.ts      138 tests across 7 files
  packages/mongo-storage/         @cred-kit/mongo-storage — Mongoose 9 models & adapters
    src/adapters/{user,refreshToken,audit}.adapter.ts
    src/models/{user,refreshToken,audit}.models.ts
    src/index.ts                 MongooseStorageOptions export + adapter construction
    src/__tests__/*.test.ts      187 tests across 9 files
  packages/smtp/                  @cred-kit/smtp — Nodemailer SMTP + Resend adapter
    src/index.ts                 emailService() factory
    src/helpers/email.helper.ts  link building with configurable authPathPrefix
    src/lib/{transporter,resend,http}.ts
    src/__tests__/*.test.ts      77 tests across 5 files
  packages/express/               @cred-kit/express — mountable Express 5 router
    src/router.ts                route table + middleware wiring
    src/controllers/{auth,oauth,profile}.controller.ts
    src/middleware/{auth,csrf,error,validate,rate-limit}.ts
    src/helpers/{api,cookie,path,request,oauth}.ts
    src/config.ts                resolveCredConfig(), defaultCredRateLimits
    src/index.ts                 public exports (credExpress, createAuthGuard, ...)
    src/__tests__/*.test.ts      46 tests across 5 files
  packages/shared/                @cred-kit/shared — private compatibility re-export shim (tsup, ESM)
  packages/config/                @cred-kit/config — shared tsconfig presets (used by shared)
  apps/cred-testing/              Next.js 16 manual API tester (private)
  apps/demo/                      Scratch Express host example (private)
```

Route mounting order in `router.ts`: `/health` first (before CSRF); `/auth` routes then
OAuth routes, both behind their respective limiters; `/profile` routes behind profile limiter.
There is no `/audit` prefix — audit logs live under `/profile/me/audit-logs`.

### Data models (quick reference)

Models live in `@cred-kit/mongo-storage`. The adapter contract is defined in `@cred-kit/core`.

- `User`: unique `username`/`email`; optional `password` (required by a pre-save hook only for
  `provider=local`); `bio`, `phoneNumber`, `gender`; `isVerified`; verification/reset token hash +
  expiry; `provider` (`local|google|github`); sparse-unique `googleId`/`githubId`; `avatar`;
  `loginAttempts`, `lockoutUntil`, `lastLogin`, `lastIp`; timestamps.
- `RefreshToken`: `token` (SHA-256 hash), `user`, `family`, `expiresAt` (TTL index), `consumed`;
  timestamps.
- `AuditLog`: nullable `user`, `action` from `AUDIT_ACTIONS`, `status` (`success|failure`), `ip`,
  `userAgent`, `provider`, `metadata`; timestamps; 90-day TTL.

## Adapter API endpoints

The router mounts under whatever `basePath` the host chooses (default `/api`).

### `/auth`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth` | No | Register; sends verification email; 201 |
| POST | `/auth/login` | No | Email **or** username + password; sets cookies |
| POST | `/auth/logout` | Yes | Deletes the presented refresh token and clears cookies |
| POST | `/auth/refresh` | Refresh cookie | Rotates refresh token; issues new access token |
| GET | `/auth/verify-email/:token` | No | Always redirects to `CLIENT_URL/login?verified=true` or `...?verified=false` |
| POST | `/auth/forgot-password` | No | Always returns the same response (no email enumeration) |
| GET | `/auth/reset-password/:token` | No | Redirects the reset email link to `${clientUrl}/reset-password?token=...` |
| POST | `/auth/reset-password/:token` | No | One-time reset token |
| GET | `/auth/google` / `/google/callback` | No | OAuth with `oauth_state` CSRF cookie |
| GET | `/auth/github` / `/github/callback` | No | OAuth with `oauth_state` CSRF cookie |

### `/profile` and health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | No | Returns `{ success, message, data: { status: 'ok' } }` |
| GET | `/profile/me` | Yes | Returns user without `password` |
| PUT | `/profile/me` | Yes | Partial update; unique conflicts return 400 |
| DELETE | `/profile/me` | Yes | Deletes user + refresh tokens + clears cookies |
| POST | `/profile/me/change-password` | Yes | Requires current password; revokes refresh tokens |
| GET | `/profile/me/audit-logs` | Yes | Paginated (`page`, `limit` 1–100), newest first |

Response envelope: `sendSuccess` → `{ success, message, data }`; `sendError` →
`{ success, message, error }`. Zod validation failures are the exception:
`400 { errors: ZodIssue[] }`. Rate-limit responses are plain text (default
`express-rate-limit` body), not JSON.

## Environment

The adapter validates config at import time through `resolveCredConfig()` and throws if required
fields are missing or invalid: `database`, `email`, `jwtSecret`, `clientUrl`, `backendUrl`.

- `core.accessTokenExpiry` defaults to 15 minutes; `cookies.accessTokenMaxAgeMs` is independent.
- `core.refreshTokenTtlMs` defaults to 7 days; `cookies.refreshTokenMaxAgeMs` is independent.
- `basePath` must match `app.use(...)` exactly; the refresh cookie and OAuth callback URL both
  depend on it.
- OAuth is optional: set `oauth.google.clientId` / `oauth.google.clientSecret` and
  `oauth.github.clientId` / `oauth.github.clientSecret`. Callback URLs are derived from
  `backendUrl`: `{backendUrl}{basePath}/auth/{provider}/callback`.
- SMTP is optional via `@cred-kit/smtp`. Without `SMTP_HOST`, Nodemailer creates an Ethereal test
  account. Tests mock Nodemailer entirely.
- Health is enabled by default (`health.enabled: true`). Set `health.enabled: false` to disable.
  A custom `health.check` function receives no args and should reject on failure.

## Rate limiting

All option values live in `defaultCredRateLimits` in `packages/express/src/config.ts`; the
`express-rate-limit` instances are created in `createRateLimiters()` and mounted per-route in
`router.ts`. A `rateLimitStoreFactory` option lets hosts supply a shared backend store.

| Limiter | Window | Max | Applied to |
|---|---|---|---|
| `auth` | 15 min | 20 | All `/auth/*` (including OAuth) |
| `login` | 15 min | 5 | `POST /auth/login` |
| `register` | 60 min | 3 | `POST /auth` |
| `forgotPassword` | 60 min | 3 | `POST /auth/forgot-password` |
| `refresh` | 15 min | 10 | `POST /auth/refresh` |
| `verifyEmail` | 15 min | 10 | `GET /auth/verify-email/:token` |
| `resetPassword` | 15 min | 5 | `GET`/`POST /auth/reset-password/:token` |
| `logout` | 15 min | 20 | `POST /auth/logout` |
| `oauth` | 15 min | 10 | All OAuth routes |
| `profile` | 15 min | 50 | All `/profile/*` |
| `profileUpdate` | 15 min | 50 | `PUT /profile/me`, `POST /profile/me/change-password` |
| `health` | 1 min | 30 | `GET /health` |

The host must set `trust proxy` so rate limits and audit `ip` see the forwarded client IP.

## Testing notes

- Suite sizes: core 138 in 7 files, mongo-storage 187 in 9 files, smtp 77 in 5 files,
  express 46 in 5 files — 448 total.
- Each package has its own `vitest.config.ts`; `pnpm test` runs all four in parallel via
  Turborepo.
- DB-backed tests (core, mongo-storage) use `mongodb-memory-server` with a 60s `beforeAll` hook.
  First run downloads the MongoDB binary (~781 MB).
- `rate-limiter.test.ts` covers all 12 configured limiters plus the store factory.
- Full-suite verification on any platform uses `pnpm turbo run build lint typecheck test`.

## Invariants and conventions

### Code and packages

- ESM everywhere (`"type": "module"`, NodeNext). Relative imports in package source must end in
  `.js` even from `.ts` files. Shared uses bundler resolution.
- Types and Zod schemas belong in `packages/core/src` and must be re-exported from
  `src/index.ts`; import them as `@cred-kit/core`. Do not duplicate validators in `packages/express`.
- `req.user` is globally augmented in `packages/express/src/types.ts`. Do not redeclare it.
- Follow the existing `<domain>.<kind>.ts` file naming (`auth.controllers.ts`,
  `user.models.ts`, `rate-limiters.ts`) and the route → controller → model/helper split.
- Use `sendSuccess` / `sendError`; do not hand-roll the envelope in controllers.
- Keep package builds in sync when changing public types: `pnpm --filter <pkg> build` is the
  boundary. Tests bypass dist via package resolution, so a passing test does not prove the
  published `dist` is current.

### Auth and security invariants

- Access token: cookie `token`, JWT lifetime **15 minutes**, payload includes
  `tokenType: 'access'`; `createRequireAuth` rejects refresh tokens and missing/invalid cookies
  with 401.
- Refresh token: cookie `refreshToken`, 7 days, `path=${basePath}/auth`, AES-256-GCM encrypted
  value stored in cookie, SHA-256 hash stored in `RefreshToken`. Rotation is atomic; replaying
  a consumed token revokes the whole `family`.
- Logout deletes only the presented refresh token and clears both cookies; password change and
  account deletion delete **all** refresh tokens for the user.
- Cookies are `httpOnly`, `secure` follows `cookies.secure` (defaults to `NODE_ENV === 'production'`),
  `sameSite=strict` for normal auth and `sameSite=lax` for OAuth. Do not loosen these without an
  explicit requirement.
- Local login requires `isVerified`; registration sends a verification link and rolls the user
  back if the email cannot be sent. Login failure returns generic `Invalid Credentials`
  (no user enumeration) and locks the account for 15 minutes after 5 failed attempts.
- `provider !== 'local'` accounts cannot use password login or change-password. Note that
  linking an existing local account through OAuth sets `provider` to that provider,
  which blocks later password login for that account.
- Email verification / password reset tokens are SHA-256 hashed at rest, raw only in the email;
  verification expires in 24 hours, reset in 1 hour, and reset tokens are single-use.
- OAuth uses a random `oauth_state` cookie (httpOnly, `sameSite=lax`, 10 minutes, follows
  `cookies.secure`) verified against the callback query. State failures redirect to
  `CLIENT_URL/login?error=oauth_state_mismatch`.
- Passwords are bcrypt-hashed with 10 rounds and stripped from every response via destructuring
  (`const { password: _, ...rest } = user.toObject()`).
- Audit logging is fire-and-forget: failures are swallowed/logged and must never break a request.
  Action strings come from `AUDIT_ACTIONS` in `@cred-kit/core`; logs expire after 90 days.

### Profile and validation behavior

- `PUT /profile/me` uses `!== undefined` checks, so omitted fields are untouched; Zod strips
  unknown fields. Gender is one of `male | female | other` (not nullable through the API).
- `profileUpdateLimiter` applies only to `PUT /me` and `/me/change-password`; `DELETE /me` is
  covered only by the global profile limiter.
- `POST /auth/forgot-password` must keep returning the same success response whether or not
  the email exists.
- Health responses always include the `data` object, including on 500/503.

## Docs and sources of truth

Executable sources win over prose: `package.json` scripts, `src/router.ts` / `src/config.ts`, and
the tests. `README.md` and `CONTRIBUTING.md` are kept in sync with the current behavior; if they
disagree with the code, fix the prose.

- `README.md` is the concise developer entry point; `CONTRIBUTING.md` is the contributor guide.
- `PROJECT_VISION.md` describes a future npm-package/adapter split (`@cred-kit/core`,
  `@cred-kit/express`, storage/email adapters). That split is **fully implemented**; the current
  codebase is the standalone adapter stack described above.

## Agent working rules

1. **Do not break existing behavior.** Read the surrounding code and call sites first; extend or
   refactor rather than rewrite. Preserve route paths, cookie names, JWT payload shape, audit
   action strings, Zod schema exports, response envelopes, and rate-limiter config keys unless the
   task explicitly changes them.
2. **Ask when anything is ambiguous.** If requirements conflict with existing behavior,
   validation, release rules, or evaluation criteria — stop and ask instead of guessing. Never
   invent commands, flags, or file paths; verify them in the repo.
3. **Prefer the smallest complete change.** Target the root cause, keep diffs focused, avoid
   drive-by reformatting (this tree is not Prettier-clean), dependency additions, or broad renames.
   If a larger refactor is genuinely needed, explain why before starting.
4. **Write maintainable, modern code.** Follow the existing module boundaries and naming; reuse
   helpers instead of duplicating token/cookie/response logic; keep functions typed and side
   effects explicit; no `any` where a real type exists; handle errors where they occur instead of
   swallowing them (except intentional fire-and-forget audit logging).
5. **Verify before and after.** Reproduce or locate the problem, make the change, then run
   `pnpm --filter <pkg> test` and the relevant downstream checks. Exercise the affected HTTP path
   with supertest or curl when behavior is externally visible.
6. **Handle failure paths.** Consider missing environment variables, Mongo unavailable,
   SMTP/Ethereal failure, malformed/expired/replayed tokens, Windows paths/CRLF, plain-text
   rate-limit responses, concurrent refresh rotation, and non-production `NODE_ENV`. Return
   actionable errors rather than crashing the process.
7. **Never do destructive or irreversible things** — no deleting user work, no `git push --force`,
   `reset --hard`, `--no-verify`, no publishing/version bumping without being asked, and no secrets
   in code, logs, commits, or tests.
8. **Always run the verification pipeline.** Run the unit tests (`pnpm turbo run test`) plus build
   and lint before committing anything. Do not claim success if a prerequisite is missing; report
   the blocker.
9. **Split large tasks into chunks.** Break large tasks into phases, review and verify each phase
   before moving to the next, and commit after each completed phase.
