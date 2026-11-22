# Known Limitations Plan

Tracking plan for resolving the limitations listed in `FIXING.md`.

- Branch: `fix/known-limitations`
- Started: 2026-11-22
- Scope: L-01 to L-13 only. Out-of-scope findings go to the Drift log in
  `docs/plans/LIMITATIONS_CHECKLIST.md`.

## Baseline

Recorded on `fix/known-limitations` at commit `6f19249` (after preserving the
untracked community/task files).

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Passed. Lockfile up to date. Warning: ignored build scripts for `esbuild@0.27.7`, `esbuild@0.28.2`, `mongodb-memory-server@11.2.0`. |
| `pnpm turbo run build lint typecheck test` | Passed. 19 tasks successful, 19 total (all cache hits on the baseline run). |
| `@cred-kit/core` tests | 7 files, 138 tests passed. |
| `@cred-kit/mongo-storage` tests | 9 files, 187 tests passed. |
| `@cred-kit/smtp` tests | 5 files, 65 tests passed. |
| `@cred-kit/express` tests | None: no `test` script and no test files. |
| `pnpm format:check` | Failed: `Cannot find package 'prettier-plugin-tailwindcss' imported from D:\MERN\cred\noop.js`. |

Build targets observed in the baseline: `node22.0.0` for core, express,
mongo-storage, and smtp (tsdown output).

Pre-existing failures to distinguish from regressions:

- `pnpm format:check` fails until L-10 installs the Prettier plugin.
- `pnpm dev` fails until L-10 declares `tsx` for `apps/demo`.
- `pnpm start` starts only the tester until L-10/L-11 give the demo a start
  script.

## Conventions for every task

1. Re-read this file and the checklist entry before starting.
2. Mark the checklist entry `[~]`; only one task is in progress at a time.
3. Write the failing test first where the task changes behavior.
4. Implement the smallest complete change.
5. Run the task's verification commands, then the full verification set.
6. Tick the checklist and record the exact commands and results as Evidence.
7. Commit one task at a time. Do not push, tag, publish, or rewrite history.

## Phase 0: Discovery and planning

- Branch `fix/known-limitations` created from `fix/changeset-changelog` after
  committing the untracked community/task files as `6f19249`.
- Baseline recorded above.
- Both tracking files created.
- Confirmed neither `docs/plans/*` path is in a package `files` whitelist:
  `packages/core` (`dist`, `README.md`), `packages/express` (`dist`,
  `README.md`, `LICENSE`), `packages/mongo-storage` (`dist`, `README.md`),
  `packages/smtp` (`dist`, `README.md`).

## Task plans

### L-01: `@cred-kit/express` has no test script or tests

**Verified current behavior**

- `packages/express/package.json:57-63` defines `build`, `dev`, `lint`, and
  `typecheck` only; there is no `test` or `test:watch` script.
- No `*.test.ts` file exists under `packages/express/src`.

**Approach**

- Add `vitest` (`^5.1.0`, matching core), `supertest`, `@types/supertest`, and
  `bcryptjs` as devDependencies.
- Add `packages/express/vitest.config.ts` with
  `include: ['src/**/*.test.ts']` and `environment: 'node'`, mirroring
  `packages/core/vitest.config.ts`.
- Add `test: vitest run` and `test:watch: vitest`.
- Put characterization tests next to source under
  `packages/express/src/__tests__/`, with reusable in-memory fakes in a
  non-test helper file so Vitest does not collect it.
- Fakes implement the core adapter contracts:
  `UserDatabaseAdapter`, `RefreshTokenDatabaseAdapter`,
  `AuditDatabaseAdapter`, and `EmailAdapter`.
- Build the app with `resolveCredConfig` and `createRouter` (both exported) so
  no MongoDB or SMTP connection is needed.
- Use core's `generateAccessToken` for authenticated requests and `bcryptjs`
  only to seed a password hash for the login characterization test.

**Tests to write**

- Router mounts and `/auth/csrf-token` returns the standard envelope plus a
  CSRF cookie.
- Validation failure returns `400 { errors: ZodIssue[] }`.
- Successful login sets `token` and `refreshToken` cookies with the expected
  attributes and omits `password` from the response.
- Protected route without a cookie returns the 401 envelope.
- Protected route with a valid access token returns 200.
- Unsafe request without `X-CSRF-Token` returns 403.
- Login limiter override returns 429 (plain text, not JSON).
- OAuth start redirects and sets `oauth_state`.
- `AuthError` and unknown errors map through the existing error handler
  without leaking internals.

**Files expected to change**

- `packages/express/package.json`
- `packages/express/vitest.config.ts` (new)
- `packages/express/src/__tests__/**` (new)
- `pnpm-lock.yaml`

**Public API impact:** none. Test-only dependencies are devDependencies.

**Acceptance criteria**

- `pnpm --filter @cred-kit/express test` passes.
- Tests do not appear in `dist` or in the published `files` whitelist.
- Existing behavior is characterized before Phase 3 changes it.

**Verification**

```bash
pnpm --filter @cred-kit/express test
pnpm --filter @cred-kit/express build
pnpm turbo run build lint typecheck test
```

**Alternatives rejected:** Jest/ts-jest (core and smtp already use Vitest);
starting a real HTTP server manually (supertest is the smallest HTTP-level
option and keeps tests in-process).

---

### L-02: no health endpoint

**Verified current behavior**

- `packages/express/src/router.ts` mounts `/auth` and `/profile` only; there is
  no `/health` route.
- `apps/cred-testing/lib/api/health.ts:3-20` expects `name`, `version`,
  `environment`, `uptime`, `memory`, `nodeVersion`, `platform`,
  `database.status`, `database.latency`, and `timestamp`.
- `apps/cred-testing/components/health-check.tsx:40-73` renders uptime, Node
  version, platform, and memory.

**Approach**

- Add an optional `health` block to `CredExpressConfig`:
  `{ enabled?: boolean; check?: () => Promise<void>; rateLimit?: Partial<CredRateLimitRule> }`.
- Resolve it with `enabled: true`, no `check`, and a dedicated 60-second /
  30-request limiter. Keep `CredRateLimits` unchanged so the existing exported
  interface stays source-compatible.
- Mount `GET /health` on the router before the CSRF middleware so a health
  probe does not set a CSRF cookie. The route is therefore `<basePath>/health`
  (`/api/health` by default).
- Success: `sendSuccess(res, { status: 'ok' }, 'Service is healthy')`.
- A rejected host `check`: log via `config.logger.error` and return `503` via
  `sendError`; never include the error, stack, environment, memory, Node
  version, or platform in the response.
- `health.enabled = false` makes the route fall through (404).
- Update the tester:
  - `lib/api/health.ts` type becomes `{ status: string }`.
  - `components/health-check.tsx` shows a healthy/unavailable badge and drops
    the metrics.
  - `lib/api/rate-limit.ts` health entry remains `/api/health`, 1 minute,
    30 requests; adjust only wording that describes the old payload.

**Tests to write**

- Default route returns 200 with the standard envelope and `data.status`.
- `health.enabled = false` returns 404.
- A rejecting `check` returns 503 with the standard error envelope and logs.
- The health limiter returns 429 after its budget.
- A health request does not set the CSRF cookie.
- Invalid `health` configuration throws a clear `@cred-kit/express:` error.

**Files expected to change**

- `packages/express/src/config.ts`
- `packages/express/src/router.ts`
- `packages/express/src/index.ts`
- `packages/express/src/middleware/rate-limit.middleware.ts` (health limiter)
- `packages/express/src/__tests__/**`
- `apps/cred-testing/lib/api/health.ts`
- `apps/cred-testing/components/health-check.tsx`
- `apps/cred-testing/lib/api/rate-limit.ts` (only if wording is stale)

**Public API impact:** additive config option and new route. Default behavior
adds a route; hosts can disable it.

**Acceptance criteria**

- `/api/health` returns the documented envelope in the tester and in tests.
- No sensitive process or database details are exposed.
- The tester health panel compiles and matches the response.

**Verification**

```bash
pnpm --filter @cred-kit/express test
pnpm --filter cred-testing typecheck
pnpm --filter cred-testing build
```

**Alternatives rejected:** returning `name`, `version`, `uptime`, memory, Node
version, platform, and database latency (information disclosure and requires a
storage-specific ping); adding a required `health` key to `CredRateLimits`
(source-breaking for consumers who annotate the full type).

---

### L-03: no CORS, helmet, or proxy configuration

**Verified current behavior**

- `packages/express/README.md:20` states the adapter does not provide CORS,
  helmet, HTTPS, or `trust proxy` configuration.
- No CORS, helmet, or `trust proxy` code exists in `packages/express/src`.

**Approach (documentation only; approved)**

- Add a "Host responsibilities" section to the express README with a verified
  example that sets `app.set('trust proxy', 1)`, `helmet()`, and
  `cors({ origin: CLIENT_URL, credentials: true })` before mounting the
  router.
- Explain that the host must configure HTTPS and that forwarded client IPs
  affect audit context and rate limiting.
- Do not add `helmet` or `cors` as dependencies.
- Compile-check the example in a temporary project against the packed package
  plus `helmet`/`cors` types.

**Files expected to change:** `packages/express/README.md`; root README if it
repeats the host-responsibility text.

**Public API impact:** none.

**Acceptance criteria:** the documented example compiles and matches the
adapter's actual mounting contract.

---

### L-04: in-memory-only rate-limit counters

**Verified current behavior**

- `packages/express/src/middleware/rate-limit.middleware.ts:8-17` creates each
  limiter with no `store` option, so `express-rate-limit` uses its in-memory
  store.
- Installed `express-rate-limit@8.5.2` validates `unsharedStore` and rejects
  sharing one store instance across limiter instances.

**Approach**

- Add `rateLimitStoreFactory?: () => Store` to `CredExpressConfig` and
  `ResolvedCredExpressConfig`, importing `type Store` from
  `express-rate-limit`.
- Pass the factory to `createRateLimiters(rules, storeFactory?)`; call it once
  per limiter so each limiter gets its own store. Include the health limiter.
- Validate at config resolution: if defined, it must be a function; otherwise
  throw a clear `@cred-kit/express:` error.
- Default `undefined` keeps the in-memory store and current behavior.
- Export the option type through `src/index.ts`.

**Tests to write**

- Default config has no store factory and still returns 429 at the configured
  limit.
- A supplied factory is called once per limiter and yields distinct instances.
- A custom store's `increment` is exercised by a request.
- A non-function value throws a clear configuration error.

**Files expected to change**

- `packages/express/src/config.ts`
- `packages/express/src/middleware/rate-limit.middleware.ts`
- `packages/express/src/router.ts`
- `packages/express/src/index.ts`
- `packages/express/src/__tests__/**`

**Public API impact:** additive config option and exported type.

**Acceptance criteria:** default behavior is unchanged; multi-process hosts can
supply a shared backend store safely.

**Verification**

```bash
pnpm --filter @cred-kit/express test
pnpm --filter @cred-kit/express build
```

**Alternatives rejected:** a single `Store` instance option (rejected by
`express-rate-limit`'s `unsharedStore` validation); a per-rule store map (more
configuration surface than needed).

---

### L-05: no exported auth guard or `req.user` augmentation

**Verified current behavior**

- `packages/express/src/middleware/auth.middleware.ts:13-28` verifies the
  access-token cookie and stores the payload only in `res.locals`.
- `packages/express/src/types.ts:29-34` documents that `CredLocals` is used
  instead of augmenting `Request`, and contains `credUser`.
- `packages/express/src/helpers/request.helper.ts` reads cookies from
  `req.cookies`, which requires `cookie-parser`.

**Approach**

- Add and export `createAuthGuard({ jwtSecret, cookieName? })`, with
  `cookieName` defaulting to `token`.
- Validate the secret with `assertJwtSecret` at guard creation.
- Reuse the existing auth middleware rather than duplicating verification:
  change `createRequireAuth` to accept the two values it needs
  (`jwtSecret` and `accessTokenCookieName`) and make it set both `req.user`
  and `res.locals.credUser`.
- Add a global Express `Request` augmentation with `user?: JWTPayload` in
  `types.ts`; export the guard and its options type from `src/index.ts`.
- Make `readCookie` fall back to parsing the `Cookie` header when
  `req.cookies` is absent, so the guard works whether or not the host mounted
  `cookie-parser`. Keep existing behavior when `req.cookies` is present.
- Document the cookie-parsing answer in the express README.

**Tests to write**

- Valid access token populates `req.user` and allows the host route.
- Missing, malformed, expired, and refresh-type tokens return the same 401
  envelope as the router's protected routes.
- The guard works with and without `cookie-parser`.
- The emitted `dist/index.d.mts` contains the `Express.Request` augmentation;
  a temporary consumer compiles `req.user`.

**Files expected to change**

- `packages/express/src/middleware/auth.middleware.ts`
- `packages/express/src/helpers/request.helper.ts`
- `packages/express/src/types.ts`
- `packages/express/src/index.ts`
- `packages/express/src/router.ts`
- `packages/express/src/__tests__/**`

**Public API impact:** additive export and an optional `req.user` property.

**Acceptance criteria:** host routes can be protected with one middleware and
TypeScript sees `req.user` without a cast.

**Verification**

```bash
pnpm --filter @cred-kit/express test
pnpm --filter @cred-kit/express build
# inspect dist/index.d.mts
# compile a temporary consumer
```

**Alternatives rejected:** requiring the host to mount `cookie-parser` before
the guard (works, but is an avoidable footgun); exporting the internal
`createRequireAuth` unchanged (does not set `req.user` or document the host
contract).

---

### L-06: ESM-only builds

**Verified current behavior**

- `packages/express/package.json:38-43` (and the sibling packages) expose
  `types`, `import`, and `default` only; there is no `require` condition.
- Builds emit `dist/index.mjs` and `dist/index.d.mts`.

**Approach (documentation only; approved)**

- Document the ESM-only constraint and recommend `await import()` from
  CommonJS.
- Verify the actual behavior of `require('@cred-kit/express')` against the
  packed tarball on the supported Node versions before making any claim about
  `require(esm)`.
- Do not add a CJS build or a `require` condition.

**Files expected to change:** `packages/express/README.md`, root README, and
any sibling package README that makes an inaccurate ESM claim.

**Public API impact:** none.

**Acceptance criteria:** the documentation matches the observed Node behavior
and the published `exports` map.

---

### L-07: smtp hardcodes `/api/auth/...` in email links

**Verified current behavior**

- `packages/smtp/src/helpers/email.helper.ts:131` builds
  `${backendUrl}/api/auth/verify-email/${token}`.
- `packages/smtp/src/helpers/email.helper.ts:136` builds
  `${backendUrl}/api/auth/reset-password/${token}`.
- `packages/smtp/src/index.ts` re-exports `emailServiceOptions` derived from
  `smtpOptions` and `resendOptions`.

**Approach**

- Add `authPathPrefix?: string` to `emailAdapterOptions` and
  `emailServiceOptions`, defaulting to `/api/auth`.
- Validate: non-empty, starts with `/`, no trailing slash, no query string or
  fragment; throw a clear `@cred-kit/smtp:` error.
- Build links from `${backendUrl}${authPathPrefix}/...`.
- Keep the default identical so existing installs produce identical links.
- Document in the express and smtp READMEs that `basePath` (express) and
  `authPathPrefix` (smtp) are configured independently and must agree, with a
  correct and an incorrect example. Do not make smtp import express and do not
  auto-derive the prefix.

**Tests to write**

- Default prefix produces the exact current links.
- A custom prefix is used for both verification and reset links.
- Invalid prefixes (missing leading slash, trailing slash, query/fragment,
  empty) throw the documented error.

**Files expected to change**

- `packages/smtp/src/helpers/email.helper.ts`
- `packages/smtp/src/index.ts`
- `packages/smtp/src/helpers/email.helper.test.ts`
- `packages/smtp/src/index.test.ts` (if the option surface is asserted)
- `packages/smtp/README.md`
- `packages/express/README.md`

**Public API impact:** additive option with a backward-compatible default.

**Acceptance criteria:** existing links are byte-for-byte unchanged by
default; a custom prefix produces matching links.

**Verification**

```bash
pnpm --filter @cred-kit/smtp test
pnpm --filter @cred-kit/smtp build
```

**Alternatives rejected:** a full link-builder callback (larger API surface
and harder to validate); deriving the prefix from express `basePath` (couples
independent adapters and hides misconfiguration).

---

### L-08: `oauth_state` cookie is always `secure: true`

**Verified current behavior**

- `packages/express/src/helpers/cookie.helper.ts:118` and `:131` hardcode
  `secure: true` when setting and clearing `oauth_state`.
- `packages/express/src/helpers/cookie.helper.ts:55` already applies
  `config.cookies.secure` through `commonOptions`.

**Approach**

- Remove the two hardcoded `secure: true` overrides so the OAuth state cookie
  follows the resolved cookie configuration.
- Keep `sameSite: 'lax'`, `httpOnly: true`, the auth cookie path, and the
  10-minute lifetime unchanged.
- Production default remains secure because `resolveCookies` defaults to
  `NODE_ENV === 'production'`.

**Tests to write**

- Non-production config resolves `secure: false`; the OAuth start response's
  `Set-Cookie` has no `Secure` attribute.
- Production config (or explicit `cookies.secure: true`) resolves
  `secure: true`; `Set-Cookie` includes `Secure`.
- The clear-cookie call uses the same secure decision.

**Files expected to change**

- `packages/express/src/helpers/cookie.helper.ts`
- `packages/express/src/__tests__/**`
- `packages/express/README.md`

**Public API impact:** bug fix; no signature change.

**Acceptance criteria:** OAuth works over plain HTTP on non-localhost origins
when the host explicitly disables secure cookies, and remains secure by
default in production.

**Verification**

```bash
pnpm --filter @cred-kit/express test
```

**Alternatives rejected:** special-casing localhost (does not address
non-localhost HTTP development origins and adds a second rule).

---

### L-09: OAuth linking changes `provider` and disables password auth

**Verified current behavior**

- `packages/core/src/services/oauth.service.ts:50-53` records `wasLocal` and
  sets `updates.provider = provider` when linking an existing local account by
  verified email.
- `packages/core/src/services/auth.service.ts:202` rejects password login when
  `user.provider !== 'local'`.
- `packages/core/src/services/profile.service.ts:58-67` rejects password
  changes for non-local providers.
- `packages/core/src/services/auth.service.ts:497-506` also refuses to issue a
  password-reset token for a social account.

**Approach (documentation only; approved)**

- Document the linking behavior in the express README (and core README if it
  describes account linking): after linking, the account must sign in with
  that OAuth provider; password login, password change, and password reset are
  rejected.
- Document the workaround: keep accounts separate, or continue using the
  OAuth provider.
- Do not change core behavior.

**Files expected to change:** `packages/express/README.md`,
`packages/core/README.md` (only if it describes linking), root README
limitations.

**Public API impact:** none.

**Acceptance criteria:** the documented behavior matches the cited core code.

---

### L-10: root scripts and Prettier

**Verified current behavior**

- Root `package.json` runs `dev`, `build`, `start`, `test`, and
  `test:coverage` through Turborepo. `start` is `turbo start`.
- `apps/demo/package.json:6-8` has only `dev: tsx watch src/index.ts`, and
  `tsx` is not declared in its devDependencies.
- `apps/cred-testing/.prettierrc` references `prettier-plugin-tailwindcss`;
  the plugin is not installed at the root, so `pnpm format:check` fails before
  checking any file.
- `apps/cred-testing` genuinely uses Tailwind (`tailwindcss`,
  `@tailwindcss/postcss`, and the Prettier plugin are declared in its
  package.json).

**Approach**

- Declare `tsx` as a devDependency of `apps/demo`.
- Give `apps/demo` `build: tsdown` and `start: node dist/index.mjs` scripts.
  Root `pnpm start` then starts both the demo API and the tester; document that
  `pnpm build` must run first.
- Add `prettier-plugin-tailwindcss` as a root devDependency so
  `pnpm format:check` can load the app-level config.
- Run `pnpm format:check` and report the number of flagged files. Do not
  format the repository.

**Tests / verification**

```bash
pnpm install
pnpm --filter demo exec tsx --version
pnpm --filter demo build
pnpm format:check
pnpm dev   # briefly, then stop
pnpm start # briefly, then stop
```

**Files expected to change:** `apps/demo/package.json`, root `package.json`,
`pnpm-lock.yaml`.

**Public API impact:** none (private apps and root tooling).

**Acceptance criteria:** `pnpm dev` gets past the missing-`tsx` failure;
`pnpm start` starts both apps after a build; `pnpm format:check` runs and
reports formatting findings instead of a missing-plugin error.

**Alternatives rejected:** removing the Tailwind plugin reference (the app
uses Tailwind); making root `start` demo-only (hides the tester);
`turbo start --filter=demo` (leaves the tester without a documented start).

---

### L-11: `apps/demo` hardcodes an SMTP credential and has no build/start

**Verified current behavior**

- `apps/demo/src/index.ts:19-24` contains hardcoded SMTP host, user, and
  credential values (the credential value is intentionally not reproduced
  here).
- `apps/demo/src/index.ts:13` uses `&&` between required-env checks, so a
  single missing variable does not fail fast.
- `apps/demo/src/index.ts:4` loads `../.env.local`, while the file is
  `apps/demo/.env.local`.
- `apps/demo/package.json:6-8` has no build or start script.
- Root `.gitignore` ignores `.env` and `.env.local`; `.env.example` is not
  ignored.

**Approach**

- Read `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`,
  `BACKEND_URL`, `CLIENT_URL`, `JWT_SECRET`, and `MONGO_URI` from
  `process.env`; keep `PORT` optional (default 5000).
- Change required-env validation to `||` and load `apps/demo/.env.local`
  explicitly.
- Add `apps/demo/.env.example` with placeholders only.
- Add `apps/demo/README.md` stating the app is a scratch example, how to copy
  `.env.example` to `.env.local`, and how to run build/start.
- Never print the credential value. The final report asks the owner to rotate
  it and notes that it remains in git history.

**Tests / verification**

```bash
pnpm --filter demo build
pnpm --filter demo start  # with a local .env.local if available
```

If no real Mongo/SMTP is available, record exactly where startup stops rather
than claiming a full end-to-end run.

**Files expected to change**

- `apps/demo/src/index.ts`
- `apps/demo/.env.example` (new)
- `apps/demo/README.md` (new)
- `apps/demo/package.json` (shared with L-10)

**Public API impact:** none (private app).

**Acceptance criteria:** no credential literal remains in source; missing env
vars fail fast with a clear message; build and start scripts work.

---

### L-12: package READMEs advertise Node 20

**Verified current behavior**

- `packages/express/README.md:4` badge says `>=20`.
- `packages/express/README.md:66` says `>=20.0.0` and claims a `node20.0.0`
  build target; the baseline build reports `node22.0.0`.
- `packages/smtp/README.md:7` says Node 20+.
- `packages/smtp/README.md:466` says it targets Node.js 20 and newer.
- All public package manifests declare `engines.node >= 22`; CI runs Node
  22/24.

**Approach**

- Replace the Node 20 claims with `>=22` and cite `engines.node` and the CI
  matrix.
- Remove the unverified `node20.0.0` build-target claim; the observed tsdown
  target is `node22.0.0`.
- Audit core and mongo-storage READMEs for the same claim.
- Root README limitation text is removed in Phase 5.

**Files expected to change:** `packages/express/README.md`,
`packages/smtp/README.md`, any other README with a Node 20 claim.

**Public API impact:** none.

**Acceptance criteria:** every Node version claim in package READMEs matches
`engines.node` and CI.

---

### L-13: pre-1.0 API stability

**Verified current behavior**

- Root README `:24` and `:502`, express README `:8` and `:862` state the
  pre-1.0 policy.

**Approach:** no code change. Keep the statements accurate during the Phase 5
documentation pass.

**Public API impact:** none.

**Acceptance criteria:** the pre-1.0 statements remain present and accurate.

## Phase 5: documentation, changesets, and final verification

### Documentation

Update every existing document whose statements are changed by this work:

| File | Update |
|---|---|
| `README.md` | Remove fixed limitations (L-01, L-02, L-04, L-05, L-07, L-08, L-10, L-11, L-12); keep L-03, L-06, L-09, L-13. Update routes, config, cookies, scripts, testing, and repository layout. |
| `packages/express/README.md` | Health route and config, auth guard and `req.user`, store factory, OAuth cookie rule, host responsibilities, Node 22, limitations, testing. |
| `packages/smtp/README.md` | `authPathPrefix`, independence from express `basePath`, Node 22. |
| `packages/core/README.md`, `packages/mongo-storage/README.md` | Audit Node claims and any limitation statements; update only verified text. |
| `CONTRIBUTING.md` | Root script behavior (`dev`, `start`, `format:check`), express tests, Node 22. |
| `API.md` | Only lines describing the express adapter that can be verified; the file is partly historical. |
| `apps/cred-testing/README.md`, `apps/cred-testing/API.md` | Health route and payload. |
| `specs/01-express-adapter.md` | Only if it asserts behavior that changed; otherwise leave historical. |
| `AGENTS.md` | Replace factual sections that describe a different codebase (`apps/api`, Jest counts, “not a git repo”) with verified current state; keep agent rules. |
| `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md` | Audit for Node/script claims; likely no changes. |

Every added or changed code example must be compile-checked against the built
package in a temporary directory, then deleted.

### Changesets

- `@cred-kit/express` — `minor`: health route, auth guard and `req.user`,
  rate-limit store factory, OAuth state cookie fix.
- `@cred-kit/smtp` — `minor`: `authPathPrefix`.
- Private apps and `@cred-kit/shared`/`@cred-kit/config` need no changeset.
- Verify with `pnpm exec changeset status`.

### Final verification

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm turbo run build lint typecheck test --force
pnpm --filter "./packages/*" exec pnpm pack --dry-run
pnpm exec changeset status
pnpm format:check
pnpm dev   # briefly, then stop
pnpm start # briefly, then stop
```

Then, in a temporary directory outside the repo:

1. Install the packed tarballs and peers.
2. Mount the router and call the health route.
3. Protect a host route with `createAuthGuard` and compile `req.user`.
4. Configure a custom smtp `authPathPrefix` and confirm the links.
5. Delete the temporary directory.

Confirm every checklist item is `[x]`, `[!]`, or `[-]`, update the progress
summary, and write the final report.

## Owner decisions

Recorded 2026-11-22:

- **L-03:** approved: documentation only. No CORS/helmet/proxy dependencies or
  code.
- **L-06:** approved: documentation only. No CommonJS build or `require`
  condition.
- **L-09:** approved: documentation only. No core behavior change.
- **Health default:** approved: enabled by default; `health.enabled = false`
  disables it.
- **Root `pnpm start`:** approved: start both demo and tester after
  `pnpm build`.
- **Untracked community/task files:** approved: commit on
  `fix/changeset-changelog` before creating `fix/known-limitations`.

## Out of scope

- Rewriting historical specs or `API.md` beyond verified express-adapter
  statements.
- Adding CORS, helmet, or proxy middleware as dependencies.
- Adding a CommonJS build.
- Changing core account-linking behavior.
- Repo-wide Prettier formatting. The count of flagged files will be reported
  for a separate formatting-only change.
- Publishing, tagging, pushing, or manually bumping versions.
- Editing `.github/workflows/*`.

## Stop-and-ask conditions

Stop and report if a task requires a core change, a public API break, a
baseline failure that blocks verification, a command that cannot run, or a new
security issue outside this list.
