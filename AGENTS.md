# AGENTS.md — Cred

Cred is a drop-in authentication API: Express 5 + Mongoose 9 + TypeScript, packaged as a
pnpm/Turborepo monorepo. There is no frontend and no CI in this repository.

## Project state (verified 2026-11-11)

- `pnpm build` passes: Turborepo builds `@cred/shared` with tsup, then `@cred/api` with `tsc`.
- Jest defines **122 tests in 7 suites**. `README.md` documents the same counts; the tests remain
  the source of truth if they drift.
- This checkout is **not a git repo**. Do not assume `git`, commit, or worktree commands work.
- `pnpm dev` is currently broken on every platform. `ts-node-dev@2.0.0` does not accept the
  `--esm` flag used by `apps/api/package.json`; it exits with `ts-node-dev: no script to run
  provided`. Use `pnpm build && pnpm start` until the dev script is fixed.
- `pnpm test` fails on **Windows** because the package script uses POSIX env syntax
  (`NODE_OPTIONS='--experimental-vm-modules' jest`). Use the PowerShell form below.
- DB-backed tests need a MongoDB binary. The first run downloads MongoDB 8.2.6 (~781 MB) into
  `%USERPROFILE%\.cache\mongodb-binaries`; the 60s `beforeAll` hook in
  `apps/api/src/__tests__/helpers/db.ts` can time out before the download finishes. Let the
  download finish, then rerun.
- No ESLint and no CI. A Prettier config exists, but the tree is **not** Prettier-clean:
  `pnpm format:check` currently reports 31 files. Do not reformat the whole repo as a side effect.

## Commands

```bash
pnpm install          # pnpm 10.33.2; workspace packages apps/* and packages/*
pnpm build            # turbo build -> tsup @cred/shared, tsc @cred/api
pnpm start            # turbo start -> node dist/index.js (requires build + env)
pnpm test             # POSIX shells only (Linux/macOS/WSL)
pnpm test:coverage    # Jest with coverage
pnpm format           # Prettier --write over apps/**/*.ts and packages/**/*.ts
pnpm format:check     # currently fails on 31 pre-existing files
```

Windows test workaround (run from `apps/api`):

```powershell
cd apps/api
$env:NODE_OPTIONS='--experimental-vm-modules'
pnpm exec jest
```

Single suite / single test:

```powershell
pnpm exec jest src/__tests__/routes/auth.test.ts
pnpm exec jest -t "logs in with email"
```

`pnpm build` is the typecheck gate (there is no separate `typecheck` script). Do not run
`pnpm format` across the repo unless the task is explicitly a formatting task; format only the
files you changed or match the surrounding style manually.

## Stack

- **Express 5**, **Mongoose 9**, **TypeScript 6** (strict, ES2022, ESM + NodeNext)
- **Zod 4** validators/types shared between packages
- **JWT** access tokens + rotating refresh tokens in httpOnly cookies; **bcryptjs** (10 rounds)
- **Passport** Google + GitHub OAuth (optional; disabled with a warning if credentials are absent)
- **Nodemailer** with Ethereal in development and SMTP in production (optional)
- **helmet**, **cors**, `express-rate-limit`, 10 KB JSON body limit, `trust proxy = 1`
- **Jest 30** + ts-jest (ESM preset) + supertest + mongodb-memory-server
- **pnpm 10** + **Turborepo 2**; Prettier only (no ESLint)

## Architecture

```text
cred/
  apps/api/                       @cred/api — Express server
    src/index.ts                  entrypoint: connectDB(), http server, graceful shutdown
    src/app.ts                    env validation, middleware, route mounting
    src/db/db.ts                  mongoose connect/disconnect
    src/models/                   User, RefreshToken, AuditLog
    src/services/passport.ts      Google + GitHub strategies, find-or-create/link user
    src/routes/                   auth, oauth, profile, audit, health
    src/controllers/              request handling for each route group
    src/middlewares/              auth (JWT cookie), validate (Zod)
    src/helpers/                  api envelope, token/cookie, email, audit
    src/config/rate-limiters.ts   all limiter options (window/max/message)
    src/templates/                HTML email bodies
    src/types/types.d.ts          Express.Request.user augmentation
    src/__tests__/                route, middleware, and helper tests
  packages/shared/                @cred/shared — types + Zod validators (tsup, ESM)
  packages/config/                @cred/config — shared tsconfig base/node
```

Route mounting order in `app.ts`: `/api/health` first; `/api/auth` gets `authRoutes` then
`oauthRoutes`, both behind `authLimiter`; `/api/profile` gets `profileRoutes` then
`auditRoutes`, behind `profileLimiter`. There is no `/api/audit` prefix.

### Data models (quick reference)

- `User`: unique `username`/`email`; optional `password` (required by a pre-save hook only for
  `provider=local`); `bio`, `phoneNumber`, `gender`; `isVerified`; verification/reset token hash +
  expiry; `provider` (`local|google|github`); sparse-unique `googleId`/`githubId`; `avatar`;
  `loginAttempts`, `lockoutUntil`, `lastLogin`, `lastIp`; timestamps.
- `RefreshToken`: `token` (SHA-256 hash), `user`, `family`, `expiresAt` (TTL index), `consumed`;
  timestamps.
- `AuditLog`: nullable `user`, `action` from `AUDIT_ACTIONS`, `status` (`success|failure`), `ip`,
  `userAgent`, `provider`, `metadata`; timestamps; 90-day TTL.

## API endpoints

### `/api/auth`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth` | No | Register; sends verification email; 201 |
| POST | `/api/auth/login` | No | Email **or** username + password; sets cookies |
| POST | `/api/auth/logout` | Yes | Deletes the presented refresh token and clears cookies |
| POST | `/api/auth/refresh` | Refresh cookie | Rotates refresh token; issues new access token |
| GET | `/api/auth/verify-email/:token` | No | Always redirects to `CLIENT_URL/login?verified=true` or `...?verified=false` |
| POST | `/api/auth/forgot-password` | No | Always returns the same response (no email enumeration) |
| POST | `/api/auth/reset-password/:token` | No | One-time reset token |
| GET | `/api/auth/google` / `/google/callback` | No | OAuth with `oauth_state` CSRF cookie |
| GET | `/api/auth/github` / `/github/callback` | No | OAuth with `oauth_state` CSRF cookie |

### `/api/profile` and health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/profile/me` | Yes | Returns user without `password` |
| PUT | `/api/profile/me` | Yes | Partial update; unique conflicts return 400 |
| DELETE | `/api/profile/me` | Yes | Deletes user + refresh tokens + clears cookies |
| POST | `/api/profile/me/change-password` | Yes | Requires current password; revokes refresh tokens |
| GET | `/api/profile/me/audit-logs` | Yes | Paginated (`page`, `limit` 1–100), newest first |
| GET | `/api/health` | No | App + DB status; 503 when DB is disconnected |

Response envelope: `sendSuccess` → `{ success, message, data }`; `sendError` →
`{ success, message, error }`. Zod validation failures are the exception:
`400 { errors: ZodIssue[] }`. Rate-limit responses are plain text (default
`express-rate-limit` body), not JSON.

## Environment

`app.ts` validates these at import time and throws if any is missing:
`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `BACKEND_URL`, `CORS_ORIGIN`, `NODE_ENV`.

- `PORT` is optional (default `3000`).
- `dotenv` loads from `process.cwd()`. Turborepo runs package scripts with cwd `apps/api`, so
  **`apps/api/.env` is the effective env file** for `pnpm dev` / `pnpm start`. A root `.env` is
  ignored by those commands (it only applies when you run Node directly from the repo root).
- OAuth is optional: set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` and
  `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET`. Callback URLs are derived from
  `BACKEND_URL`: `{BACKEND_URL}/api/auth/{provider}/callback`.
- SMTP is optional. Without `SMTP_HOST`, Nodemailer creates an Ethereal test account and logs a
  preview URL. Tests mock Nodemailer entirely.
- The health controller imports `package.json` with `with { type: 'json' }`; despite
  `engines.node >= 18`, it effectively needs a Node version that supports import attributes
  (Node 20.10+/22+). Node 24 is what this checkout was verified with.

## Rate limiting

All option values live in `apps/api/src/config/rate-limiters.ts`; the `express-rate-limit`
instances are created in `app.ts` and the route files.

| Limiter | Window | Max | Applied to |
|---|---|---|---|
| `authLimiter` | 15 min | 20 | All `/api/auth/*` (including OAuth) |
| `loginLimiter` | 15 min | 5 | `POST /api/auth/login` |
| `registerLimiter` | 60 min | 3 | `POST /api/auth` |
| `forgotLimiter` | 60 min | 3 | `POST /api/auth/forgot-password` |
| `refreshLimiter` | 15 min | 10 | `POST /api/auth/refresh` |
| `verifyEmailLimiter` | 15 min | 10 | `GET /api/auth/verify-email/:token` |
| `resetPasswordLimiter` | 15 min | 5 | `POST /api/auth/reset-password/:token` |
| `logoutLimiter` | 15 min | 20 | `POST /api/auth/logout` |
| `oauthLimiter` | 15 min | 10 | All OAuth routes |
| `profileLimiter` | 15 min | 50 | All `/api/profile/*` |
| `profileUpdateLimiter` | 15 min | 50 | `PUT /api/profile/me`, `POST /api/profile/me/change-password` |
| `healthLimiter` | 1 min | 30 | `GET /api/health` (defined inline in `health.routes.ts`) |

`app.ts` trusts the first proxy hop, so rate limits and audit `ip` use the forwarded client IP.

## Testing notes

- Suite sizes: auth 35, auth-email 11, profile 26, oauth 27, audit 5, rate limiters 17,
  health 1 — 122 total.
- `src/__tests__/setup.cjs` sets `NODE_ENV=test` and all required env vars before imports.
- `jest.config.ts` maps `@cred/shared` to `packages/shared/src/index.ts` (no shared build needed
  for tests) and maps `nodemailer` to `apps/api/__mocks__/nodemailer.ts`.
- `src/__tests__/helpers/test-app.ts` builds its **own** Express app. It omits helmet and uses
  100 requests/15 min instead of the production limiters. A new route must be added there or
  route tests will get 404.
- `helpers/db.ts` starts one `MongoMemoryServer` per suite (60s `beforeAll`), connects Mongoose,
  and clears every collection in `afterEach`.
- `rate-limiter.test.ts` only covers 8 of the 12 configured limiters (it omits verify-email,
  reset-password, logout, and health).
- First run needs network for the MongoDB binary. `rate-limiter.test.ts` is the only DB-free suite.
- Full-suite verification on Windows must use the PowerShell `NODE_OPTIONS` form shown above.

## Invariants and conventions

### Code and packages

- ESM everywhere (`"type": "module"`, NodeNext). Relative imports in API source must end in
  `.js` even from `.ts` files (`import app from './app.js'`). Shared uses bundler resolution.
- Types and Zod schemas belong in `packages/shared/src` and must be re-exported from
  `src/index.ts`; import them as `@cred/shared`. Do not duplicate validators in `apps/api`.
- `req.user` is globally augmented in `apps/api/src/types/types.d.ts`; do not redeclare it.
- Follow the existing `<domain>.<kind>.ts` file naming (`auth.controllers.ts`,
  `user.models.ts`, `rate-limiters.ts`) and the route → controller → model/helper split.
- Use `sendSuccess` / `sendError`; do not hand-roll the envelope in controllers.
- Keep `@cred/shared` builds in sync when changing its public types: `pnpm build` (tsup) is the
  package boundary. Tests bypass dist via Jest's module mapper, so a passing test does not prove
  the published `dist` is current.

### Auth and security invariants

- Access token: cookie `token`, JWT lifetime **15 minutes**, payload includes
  `tokenType: 'access'`; `authMiddleware` rejects refresh tokens and missing/invalid cookies
  with 401.
- Refresh token: cookie `refreshToken`, 7 days, `path=/api/auth`, SHA-256 hash stored in
  `RefreshToken`. Rotation is atomic; replaying a consumed token revokes the whole `family`.
- Logout deletes only the presented refresh token and clears both cookies; password change and
  account deletion delete **all** refresh tokens for the user.
- Cookies are `httpOnly`, `secure` only when `NODE_ENV=production`, `sameSite=strict` for normal
  auth and `sameSite=lax` for OAuth. Do not loosen these without an explicit requirement.
- Local login requires `isVerified`; registration sends a verification link and rolls the user
  back if the email cannot be sent. Login failure returns generic `Invalid credentials`
  (no user enumeration) and locks the account for 15 minutes after 5 failed attempts.
- `provider !== 'local'` accounts cannot use password login or change-password. Note that
  linking an existing local account through OAuth currently sets `provider` to that provider,
  which blocks later password login for that account.
- Email verification / password reset tokens are SHA-256 hashed at rest, raw only in the email;
  verification expires in 24 hours, reset in 1 hour, and reset tokens are single-use.
- OAuth uses a random `oauth_state` cookie (httpOnly, `sameSite=lax`, 10 minutes) verified against
  the callback query. State failures redirect to `CLIENT_URL/login?error=oauth_state_mismatch`.
- Passwords are bcrypt-hashed with 10 rounds and stripped from every response via destructuring
  (`const { password: _, ...rest } = user.toObject()`).
- Audit logging is fire-and-forget: failures are swallowed/logged and must never break a request.
  Action strings come from `AUDIT_ACTIONS` in `@cred/shared`; logs expire after 90 days.

### Profile and validation behavior

- `PUT /api/profile/me` uses `!== undefined` checks, so omitted fields are untouched; Zod strips
  unknown fields. Gender is one of `male | female | other` (not nullable through the API).
- `profileUpdateLimiter` applies only to `PUT /me` and `/me/change-password`; `DELETE /me` is
  covered only by the global profile limiter.
- `POST /api/auth/forgot-password` must keep returning the same success response whether or not
  the email exists.
- Health responses always include the `data` object, including on 500/503.

## Docs and sources of truth

Executable sources win over prose: `package.json` scripts, `src/app.ts` / `src/routes`, and the
tests. `README.md` and `API.md` are kept in sync with the current behavior; if they disagree with
the code, fix the prose.

- `API.md` is the detailed HTTP reference; `README.md` is the concise developer entry point.
- `PROJECT_VISION.md` describes a future npm-package/adapter split (`@cred/core`,
  `@cred/express`, storage/email adapters). That split is **not implemented**; the current
  codebase is the standalone Express API described above.

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
   `src/helpers` instead of duplicating token/cookie/response logic; keep functions typed and side
   effects explicit; no `any` where a real type exists; handle errors where they occur instead of
   swallowing them (except intentional fire-and-forget audit logging).
5. **Verify before and after.** Reproduce or locate the problem, make the change, then run
   `pnpm build` and the relevant tests (single file first, full suite before finishing). Exercise
   the affected HTTP path with supertest or curl when behavior is externally visible. On Windows,
   use the PowerShell test command above.
6. **Handle failure paths.** Consider missing `.env` variables, Mongo unavailable, SMTP/Ethereal
   failure, malformed/expired/replayed tokens, Windows paths/CRLF, plain-text rate-limit responses,
   concurrent refresh rotation, and non-production `NODE_ENV`. Return actionable errors rather than
   crashing the process.
7. **Never do destructive or irreversible things** — no deleting user work, no `git push --force`,
   `reset --hard`, `--no-verify`, no publishing/version bumping without being asked, and no secrets
   in code, logs, commits, or tests.
8. **Always run the verification pipeline.** Run the unit and integration tests (`pnpm build` plus
   the relevant Jest suites) before committing anything. Do not claim success if the Mongo binary
   or test prerequisite is missing; report the blocker.
9. **Split large tasks into chunks.** Break large tasks into phases, review and verify each phase
   before moving to the next, and commit after each completed phase **if** git has been initialized
   (this checkout currently has no `.git`).
