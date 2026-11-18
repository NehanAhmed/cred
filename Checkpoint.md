# Checkpoint — @cred/express adapter

## Project state

- **Repository:** `D:\MERN\cred` (pnpm + Turborepo monorepo).
- **Task:** add the `@cred/express` package described in `specs/01-express-adapter.md`.
- **Scope:** create the Express adapter package only. No changes to `apps/api`, `packages/core`,
  `packages/smtp`, `packages/mongo-storage`, or `packages/shared`.
- **Date started:** 2026-11-18.
- **Status:** complete; build, lint, typecheck, root build, and a runtime smoke test pass.

The adapter is a thin Express layer: it owns routing, request parsing, validation, cookies,
redirects, rate limiting, response envelopes, error handling, and the OAuth 2.0 handshake. All
auth business logic is delegated to `@cred/core` through injected deps supplied by the host
(`@cred/mongo-storage` + `@cred/smtp` in the reference integration).

## Sources of truth

- `specs/01-express-adapter.md` — assignment.
- `packages/core/src` — services, deps contracts, errors, validators, helpers.
- `packages/smtp/src` — `EmailAdapter` implementation.
- `packages/mongo-storage/src` — storage adapter implementations.
- `apps/api/src` — reference HTTP behaviour, route table, cookie names, messages, rate limits.
- `PROJECT_VISION.md` — package layering rules (`express` may import `core`, never adapters).

## Task list

### Discovery

- [x] Read the assignment spec.
- [x] Read `@cred/core` completely (services, types, errors, helpers, validators, config).
- [x] Read `@cred/smtp` completely.
- [x] Read `@cred/mongo-storage` completely.
- [x] Read `apps/api` routes, controllers, middleware, helpers, rate limiters, passport setup.
- [x] Read `@cred/shared` re-exports and package conventions.
- [x] Confirm package tooling conventions (`tsdown`, ESLint flat config, tsconfig, scripts).

### Implementation

- [x] Scaffold `packages/express` (package.json, tsconfig, tsdown, eslint, README).
- [x] Add public types (`CredExpressConfig`, resolved config, core deps, locals).
- [x] Add config resolution + validation (paths, URLs, JWT secret, adapters, cookies, OAuth,
      rate limits).
- [x] Add response, cookie, path, request helpers.
- [x] Add middleware (`requireAuth`, `validate`, rate limiters, error handler).
- [x] Add auth controller (register, login, logout, refresh, verify email, forgot/reset password).
- [x] Add profile + audit controller.
- [x] Add OAuth controller and provider helpers (Google + GitHub authorization-code flow).
- [x] Add route table and `credExpress` entry point.
- [x] Add package README with mount/basePath contract.

### Verification

- [x] `pnpm install` links the new workspace package.
- [x] `pnpm --filter @cred/express build` succeeds.
- [x] `pnpm --filter @cred/express lint` succeeds.
- [x] `pnpm --filter @cred/express typecheck` succeeds.
- [x] Root `pnpm build` still succeeds (no regressions).
- [x] Existing `apps/api` behaviour untouched (no files modified).
- [x] Runtime smoke test (temporary script, removed afterwards) covered: unauthenticated
      profile `401`, Zod validation `400`, malformed JSON `400`, anti-enumeration forgot-password
      response, missing refresh token `401`, authenticated profile fetch without `password`,
      audit-log `503` without an adapter, Google OAuth redirect + state cookie path, unconfigured
      GitHub redirect, OAuth state mismatch redirect, and successful registration with a
      verification email.

## Layout

```text
packages/express/
  package.json
  tsconfig.json
  tsdown.config.ts
  eslint.config.js
  README.md
  src/
    index.ts                 credExpress + public exports
    router.ts                route table, scoped parsers, error boundary
    config.ts                validation, defaults, rate limits, deps builder
    types.ts                 core deps, request context, locals, provider union
    controllers/
      auth.controller.ts
      profile.controller.ts
      oauth.controller.ts
    helpers/
      api.helper.ts
      cookie.helper.ts
      oauth.helper.ts
      path.helper.ts
      request.helper.ts
    middleware/
      auth.middleware.ts
      error.middleware.ts
      rate-limit.middleware.ts
      validate.middleware.ts
```

## Decisions

- Package name `@cred/express`, folder `packages/express`.
- `express`, `cookie-parser`, `express-rate-limit`, and `@cred/core` are peer dependencies; the host
  supplies one copy of each.
- OAuth is implemented directly against the Google/GitHub authorization-code endpoints (fetch),
  not Passport, so the adapter has no global strategy registry and can be mounted more than once.
- `basePath` defaults to `/api`; the mount path must match it. It scopes the refresh/state
  cookies and builds OAuth callback URLs. Email link prefixes are built by the injected email
  adapter; `@cred/smtp` currently targets `/api`, documented in the README.
- The access token cookie is named `token`; the refresh cookie is `refreshToken` scoped to
  `${basePath}/auth` (both configurable). OAuth callbacks use `sameSite=lax`.
- Response envelopes, status codes, messages, cookie flags, and rate-limit values mirror
  `apps/api`.
- Audit storage is optional (as in core). The audit-log route returns `503` when no audit adapter
  was configured.
- Forgot-password swallows `EMAIL_SEND_FAILED` so the response stays identical for known and
  unknown accounts.
- Refresh clears cookies only for session-invalidating `AuthError` codes, matching the shipped
  API's behaviour.
- No tests are added (explicitly out of scope). Verification is build + lint + typecheck + repo
  build + a temporary runtime smoke script.

## Verification log

| Command | Result |
|---|---|
| `pnpm install` | Pass (workspace linked) |
| `pnpm --filter @cred/express build` | Pass |
| `pnpm --filter @cred/express lint` | Pass, no warnings |
| `pnpm --filter @cred/express typecheck` | Pass |
| `pnpm build` (root, Turborepo) | Pass, 6/6 packages |
| Runtime smoke script | Pass, removed after execution |

Note: `packages/core/dist` was stale (built before core's config/context signatures were added),
so `pnpm --filter @cred/core build` was run once to refresh the ignored `dist` artifact before
typechecking the adapter. No source files outside `packages/express` and `Checkpoint.md` were
modified.
