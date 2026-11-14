<h1 style="bold">Currently Transforming Cred into a npm package and upgrading it to a adapter architexture. Readme is not Currently Updated according to it. After the code completion then i will update the docs and repo desc. </h1>


<p align="center">
  <img src="https://ik.imagekit.io/td7wr0ax7o/Gemini_Generated_Image_cwp7cbcwp7cbcwp7.clean.png" alt="Cred Banner" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Express-5.2.1-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Mongoose-9.7.0-880000?logo=mongodb&logoColor=white" alt="Mongoose">
  <img src="https://img.shields.io/badge/Zod-4.4.3-3068B7?logo=zod&logoColor=white" alt="Zod">
  <img src="https://img.shields.io/badge/Node.js-20.10%2B-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/pnpm-10.33.2-F69220?logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="MIT License">
</p>

<h1 align="center">Cred</h1>

<p align="center">
  A self-hosted authentication API for Node.js projects. Registration, login, Google and GitHub
  OAuth, email verification, password reset, profile management, rotating refresh tokens, and
  audit logs. TypeScript, Express 5, Mongoose 9, and pnpm workspaces.
</p>

## Highlights

- **Secure sessions by default** — httpOnly cookies, 15-minute access tokens, 7-day rotating
  refresh tokens, and SHA-256 hash storage for refresh and email tokens.
- **Complete auth flows** — email/password registration, email verification, password reset,
  Google/GitHub OAuth, account lockout, and audit logging.
- **Typed end to end** — Zod schemas and shared request/response types live in `@cred/shared`.
- **Hardened API** — helmet, CORS with credentials, 10 KB JSON body limit, and per-route rate
  limiting.
- **Tested** — 122 Jest tests across 7 suites using supertest and in-memory MongoDB.

## Requirements

- **Node.js 20.10+** (Node 24 is what this checkout is verified with; the health controller uses
  JSON import attributes).
- **pnpm 10.33.2** (`corepack enable` is the simplest way to match the version).
- **MongoDB** — local instance or MongoDB Atlas.

## Quick start

```bash
git clone https://github.com/NehanAhmed/cred.git
cd cred
pnpm install
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env and set at least MONGO_URI and JWT_SECRET
pnpm build
pnpm start
```

The API listens on `http://localhost:3000` by default. `pnpm start` requires a completed build
and a reachable MongoDB instance.

> **Development server:** the current `pnpm dev` script is not usable with the pinned
> `ts-node-dev@2.0.0` — it rejects the `--esm` flag and exits with
> `ts-node-dev: no script to run provided`. Use `pnpm build && pnpm start` until the script is
> fixed.

### Environment

`dotenv` loads from the process working directory. Turborepo runs package scripts from
`apps/api`, so **`apps/api/.env` is the effective file** for `pnpm start` and `pnpm dev`. A root
`.env` is not read by those commands.

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production`; the app refuses to start if unset |
| `PORT` | No | HTTP port (default `3000`) |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign access tokens |
| `CLIENT_URL` | Yes | Frontend origin used for redirects (`http://localhost:5173`) |
| `BACKEND_URL` | Yes | Public API origin used in email links and OAuth callbacks |
| `CORS_ORIGIN` | Yes | Allowed CORS origin; normally the same as `CLIENT_URL` |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | No | Enables Google OAuth when both are set |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | No | Enables GitHub OAuth when both are set |
| `SMTP_HOST` / `_PORT` / `_SECURE` / `_USER` / `_PASS` / `_FROM` | No | Production email; without `SMTP_HOST` Nodemailer uses Ethereal |

OAuth callback URLs are derived from `BACKEND_URL`:
`{BACKEND_URL}/api/auth/google/callback` and `{BACKEND_URL}/api/auth/github/callback`.

## Scripts

| Command | Description |
|---|---|
| `pnpm build` | Build `@cred/shared` with tsup, then `@cred/api` with `tsc` (typecheck gate) |
| `pnpm start` | Run the built API from `apps/api/dist` |
| `pnpm test` | Run all Jest suites — **POSIX shells only** |
| `pnpm test:coverage` | Run Jest with coverage |
| `pnpm format` | Format `apps/**/*.ts` and `packages/**/*.ts` with Prettier |
| `pnpm format:check` | Check formatting (currently reports 31 pre-existing files) |

### Testing on Windows

The `test` script uses POSIX environment syntax. In PowerShell:

```powershell
cd apps/api
$env:NODE_OPTIONS='--experimental-vm-modules'
pnpm exec jest
pnpm exec jest src/__tests__/routes/auth.test.ts   # one suite
pnpm exec jest -t "logs in with email"             # one test
```

The first DB-backed run downloads MongoDB 8.2.6 (~781 MB) to
`%USERPROFILE%\.cache\mongodb-binaries`. The 60-second `beforeAll` hook can expire while that
download is still running; let it finish, then rerun.

## API

All routes are prefixed with `/api`.

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth` | No | Register and send a verification email |
| `POST` | `/api/auth/login` | No | Log in with email or username; sets auth cookies |
| `POST` | `/api/auth/logout` | Yes | Revoke the presented refresh token and clear cookies |
| `POST` | `/api/auth/refresh` | Refresh cookie | Rotate the refresh token and issue a new access token |
| `GET` | `/api/auth/verify-email/:token` | No | Verify email; redirects to the frontend |
| `POST` | `/api/auth/forgot-password` | No | Send a password reset email |
| `POST` | `/api/auth/reset-password/:token` | No | Reset the password with a one-time token |
| `GET` | `/api/auth/google` · `/google/callback` | No | Google OAuth with `oauth_state` validation |
| `GET` | `/api/auth/github` · `/github/callback` | No | GitHub OAuth with `oauth_state` validation |

### Profile and health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/profile/me` | Yes | Get the current user |
| `PUT` | `/api/profile/me` | Yes | Partially update username, bio, phone, or gender |
| `DELETE` | `/api/profile/me` | Yes | Delete the account and revoke all refresh tokens |
| `POST` | `/api/profile/me/change-password` | Yes | Change password and revoke all refresh tokens |
| `GET` | `/api/profile/me/audit-logs` | Yes | Paginated audit history (`page`, `limit` 1–100) |
| `GET` | `/api/health` | No | App and database health (`503` when the DB is down) |

See [API.md](./API.md) for request bodies, responses, error codes, and examples.

## Auth model

- **Access token** — `token` cookie, 15-minute JWT, `httpOnly`, `sameSite=strict`
  (`lax` during OAuth), `secure` in production.
- **Refresh token** — `refreshToken` cookie scoped to `/api/auth`, 7-day lifetime. Only a SHA-256
  hash is stored. Tokens rotate on use; replaying a consumed token revokes the entire token family.
- **Verification and reset** — email verification tokens expire after 24 hours; password reset
  tokens expire after 1 hour. Both are hashed at rest.
- **Login protection** — generic `Invalid credentials` errors, five failed attempts trigger a
  15-minute account lockout, and login is blocked until the email is verified.
- **OAuth accounts** — Google/GitHub accounts are linked by email when possible; a unique username
  is generated on collision.
- **Audit logs** — login, logout, refresh, registration, verification, password, profile, OAuth,
  and deletion events are recorded with a 90-day TTL.
- **Passwords** — bcrypt with 10 rounds and never included in API responses.

## Rate limiting

| Scope | Window | Max |
|---|---|---|
| All `/api/auth/*` | 15 min | 20 |
| Login | 15 min | 5 |
| Register / forgot password | 60 min | 3 |
| Refresh / email verification / OAuth | 15 min | 10 |
| Password reset | 15 min | 5 |
| Logout | 15 min | 20 |
| All `/api/profile/*` | 15 min | 50 |
| Profile update / change password | 15 min | 50 |
| Health check | 1 min | 30 |

Rate-limited responses are plain text from `express-rate-limit`, not the standard JSON envelope.

## Project layout

```text
cred/
  apps/api/               Express API (routes, controllers, models, helpers, tests)
  packages/shared/        Shared types and Zod validators (@cred/shared)
  packages/config/        Shared TypeScript configs (@cred/config)
  API.md                  Detailed HTTP reference
  AGENTS.md               Repository conventions for contributors and AI agents
```

## Testing

122 tests across 7 suites:

| Suite | Tests |
|---|---|
| Auth (register, login, logout, refresh, verify email, lockout) | 35 |
| Auth email (forgot/reset password) | 11 |
| Profile (get, update, delete, change password) | 26 |
| OAuth (Google + GitHub initiation, callbacks, state validation) | 27 |
| Audit logs (ownership, pagination) | 5 |
| Rate limiters | 17 |
| Health | 1 |

Tests use supertest, in-memory MongoDB, and a mocked Nodemailer transport. The test app in
`apps/api/src/__tests__/helpers/test-app.ts` is assembled separately from `src/app.ts`; new
routes must be added there for route tests.

## License

MIT. See [LICENSE](./LICENSE).

Copyright © 2026 [Nehan Ahmed](https://github.com/NehanAhmed)

## Contributing

Contributions are welcome. Open an issue or pull request at
[github.com/NehanAhmed/cred](https://github.com/NehanAhmed/cred).
