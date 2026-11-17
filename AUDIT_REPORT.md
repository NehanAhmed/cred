# AUDIT_REPORT.md — Full technical audit of the Cred monorepo

**Audit date:** 2026-11-16 · **Branch:** `refactor/express-adapter` (tip `ecc96c8`, no uncommitted source changes; untracked `specs/01-express-adapter.md`)
**Auditor:** independent, read-only. Only file created: this report. All claims are VERIFIED (code read / command run) or INFERRED (marked).

---

## A. Executive summary

- The adapter refactor is **genuinely underway and architecturally clean where it exists**: `@cred/core` (135 tests, green) has zero framework/DB/email imports and zero `process.env` reads (ESLint-enforced). `@cred/smtp` is high quality. `apps/api` is 0% migrated and still passes its original 122-test suite unchanged.
- **Top 5 risks:**
  1. **`@cred/mongo-storage` is runtime-broken** — `getRefreshModel`/`getAuditModel` default their model name to `'CredUser'`, so the refresh-token and audit adapters are bound to the **User** model; every login fails with `CredUser validation failed: email required` (F-001, runtime-confirmed).
  2. **Core regressed the no-enumeration spec** in `forgotPassword` (`USER_NOT_FOUND` 404) and `login` (400 vs 401), both contradicting `API.md` (F-002, F-003).
  3. **JWT algorithm is not pinned** on sign or verify (F-004).
  4. **Zero tests for `@cred/mongo-storage`** — which is exactly where the fatal bug lives; no integration test runs core against the real adapters (F-005).
  5. **Core's package `exports` is broken** (`./dist/index.t.mts` does not exist) and the tarball ships all sources including tests (F-006, F-007).
- Core's logic is **not "done"**: it is well-tested against fakes but deviates from the original controllers in message/status semantics in at least 8 places, and its adapter contract (`update` returning non-null `User`) is not honored by the real adapter.
- **Readiness verdict for starting `@cred/express`:** **READY WITH FIXES** — the seams are right, but fix F-001..F-006 first (the storage adapter must work end-to-end and the error semantics must be settled, because the Express adapter's error-to-JSON mapping depends on them).

## B. Baseline results

| Package / scope | Command | Result | Notes |
|---|---|---|---|
| root | `pnpm install --frozen-lockfile` | PASS (5s) | "Already up to date" |
| root | `pnpm build` (turbo) | PASS — 5/5 tasks | First two runs appeared to "exit 1"; that was a PowerShell `2>&1` stderr artifact. Clean rerun: exit 0, cached |
| `@cred/core` | `pnpm exec tsc --noEmit` | PASS (exit 0) | No `typecheck` script in package.json; run manually |
| `@cred/mongo-storage` | `pnpm typecheck` (`tsc --noEmit`) | PASS | |
| `@cred/smtp` | `pnpm typecheck` | PASS | |
| `@cred/core` | `pnpm lint` (eslint) | PASS | `no-restricted-imports` enforces layering |
| `@cred/mongo-storage` | `pnpm lint` | PASS | |
| `@cred/smtp` | `pnpm lint` | PASS | |
| `@cred/core` | `vitest run` | PASS — **7 files / 135 tests** | ~21s |
| `@cred/smtp` | `vitest run` | PASS — **5 files / 65 tests** | ~2s |
| `@cred/api` (apps/api) | `pnpm exec jest` (PowerShell `NODE_OPTIONS='--experimental-vm-modules'`) | PASS — **7 suites / 122 tests** (28s) | First two runs failed only because the ~781 MB MongoDB 8.2.6 binary was still downloading and the 60s `beforeAll` expired; binary now cached in `%USERPROFILE%\.cache\mongodb-binaries` |
| `@cred/api` | `pnpm exec jest --coverage` | PASS — statements 77.82%, branches 56.61%, functions 81.63%, lines 78.54% | Weakest spots: `services/passport.ts` 4.34% stmts, `routes/oauth.routes.ts` 70% |
| `@cred/mongo-storage` | tests | **N/A — no test script, no vitest config, no test files** | |
| root | `pnpm format:check` | FAIL — **79 unformatted files** | AGENTS.md says 31; drifted |
| root | `pnpm audit` | **50 vulnerabilities: 4 critical, 23 high, 20 moderate, 3 low** | see F-008 |
| root | lint at root | N/A | no root lint script |
| root | CI (`.github/`) | **absent** | no workflows, no dependabot config |

No `.skip`/`.only`/`.todo` markers in any package (grep-verified). Coverage tooling for Vitest (`@vitest/coverage-v8`) is not installed; core/smtp coverage numbers are therefore UNVERIFIED (deliberately not installed to keep the tree read-only).

## C. Architecture map

```text
apps/api          @cred/api 1.0.0 (private)  — original standalone Express API, NOT yet using any @cred package (grep-verified: zero imports of @cred/core|mongo-storage|smtp)
packages/core     @cred/core 0.1.0           — business logic + adapters INTERFACES + Zod validators + email templates + JWT/token helpers
packages/mongo-storage @cred/mongo-storage 0.1.0 — Mongoose implementation of the three storage interfaces
packages/smtp     @cred/smtp 1.0.0           — Email adapter: pooled SMTP (Nodemailer) + Resend HTTP, shared template/link helper
packages/shared   @cred/shared 0.0.0 (private) — original shared types + Zod validators (used by apps/api only)
packages/config   @cred/config 0.0.0 (private) — tsconfig base/node
```

**Actual dependency graph (imports + package.json):**

```text
apps/api      → @cred/shared (dep)
core          → zod, bcryptjs, jsonwebtoken (runtime); eslint-restricted from all adapter libs
mongo-storage → @cred/core (dep, types-only imports), mongoose (dep)
smtp          → @cred/core (dep, RUNTIME imports of templates), nodemailer (dep)
shared        → zod (peer + devDep)
No cycles. No adapter imports another adapter. apps/api is fully disconnected.
```

**Public API of `@cred/core` (runtime-verified via dist import):**
`AUDIT_ACTIONS, AuthError, DuplicateKeyError, deleteAccount, emailVerification, findOrCreateOAuthUser, forgotPassword, generateAccessToken, generateRefreshTokenData, generateToken, getAuditLogs, getProfile, hashToken, login, loginSchema, logout, oauthCallback, parseToken, parseTokenLookupId, passwordChangeSchema, passwordForgotSchema, passwordReset, passwordResetSchema, profileSchema, refresh, register, registerSchema, resetPassword, updatePassword, updateProfile, verifyAccessToken, verifyEmail, verifyRawToken, verifyToken`

Note: `AuthErrorCode`, all adapter interfaces (`UserDatabaseAdapter`, `RefreshTokenDatabaseAdapter`, `AuditDatabaseAdapter`, `EmailAdapter`, `AuditErrorLogger`), `mongooseStorage`'s option types — all exported as types via `dist/index.d.mts`. Also exported at runtime: internal helpers (`generateToken`, `verifyToken`, `hashToken`, `parseToken`) — used by tests; acceptable but worth flagging as API surface.

**`@cred/express` status:** does not exist. An untracked design doc `specs/01-express-adapter.md` specifies it (single router factory `credExpress(config)`, controller factories closing over deps, route table, basePath-derived cookie paths/email links/OAuth callbacks).

## D. Feature parity matrix

Legend: DONE / PARTIAL / MISSING / BROKEN / N/A / UNVERIFIED

| Feature | Core | DB adapter | Email adapter | apps/api (old) | Express adapter | Tests |
|---|---|---|---|---|---|---|
| Register (w/ verification email + rollback) | DONE | DONE | DONE | DONE | MISSING | core DONE (auth.service.test), api DONE |
| Verify email | DONE (atomic consume) | PARTIAL (lookup field unindexed, not in schema) | DONE (link build) | DONE (redirects) | MISSING | core DONE, api DONE |
| Resend verification | MISSING (never existed) | N/A | N/A | MISSING | MISSING | none |
| Login (email) | PARTIAL — wrong status/message vs spec (F-003) | DONE | N/A | DONE | MISSING | core DONE, api DONE |
| Login (username) | DONE | DONE | N/A | DONE | MISSING | core DONE, api DONE |
| Logout | PARTIAL — 404 on missing token (old: silent 200) | DONE | N/A | DONE | MISSING | core DONE, api DONE |
| Refresh + rotation | DONE (+ extra replay recheck) | PARTIAL (F-001) | N/A | DONE | MISSING | core DONE, api DONE |
| Reuse detection (family revoke) | DONE | PARTIAL (F-001) | N/A | DONE | MISSING | core DONE, api DONE |
| Forgot password | BROKEN — enumerates accounts (F-002) | DONE | DONE | DONE (no enumeration) | MISSING | core DONE but asserts wrong behavior |
| Reset password | PARTIAL — message differs; duplicate deleteMany (F-020) | DONE | DONE (expiry text) | DONE | MISSING | core DONE, api DONE |
| Change password | DONE (revocation-first ordering, documented) | DONE | N/A | DONE | MISSING | core DONE, api DONE |
| Get profile | DONE | DONE | N/A | DONE | MISSING | core DONE, api DONE |
| Update profile (allow-list) | DONE | PARTIAL — no E11000 translation on update (F-009) | N/A | DONE | MISSING | core DONE (fake-enforced), api DONE |
| Delete account | DONE | DONE | N/A | DONE | MISSING | core DONE, api DONE |
| Audit write (fire-and-forget) | DONE | BROKEN (F-001) | N/A | DONE | MISSING | core DONE, api DONE |
| Audit read + paginate + TTL | DONE (adds `_id` tie-breaker) | DONE (`_id` leaks, F-014) | N/A | DONE | MISSING | core DONE, api DONE |
| Google OAuth | DONE (adds isEmailVerified guard) | DONE | N/A | DONE | MISSING | core DONE, api PARTIAL (strategy tests only) |
| GitHub OAuth | DONE | DONE | N/A | DONE | MISSING | core DONE, api PARTIAL |
| OAuth state/CSRF cookie | N/A (HTTP concern) | N/A | N/A | DONE | MISSING | api DONE (routes 70% cov) |
| Account lockout (5 / 15 min) | PARTIAL — re-arms lock on every failure ≥5 (F-010) | DONE (atomic `$inc`) | N/A | DONE | MISSING | core DONE, api DONE |
| Rate limiting (12 limiters) | N/A | N/A | N/A | DONE | MISSING | api DONE (8/12 covered) |
| Health check | N/A | N/A | N/A | DONE | MISSING | api DONE |
| Response envelope `{success,message,data}` | N/A (HTTP concern) | N/A | N/A | DONE | MISSING | api DONE |
| Cookie config (access + scoped refresh) | N/A | N/A | N/A | DONE | MISSING | api DONE |
| Input validation (Zod) | DONE (validators exported, duplicated — F-016) | N/A | N/A | DONE | MISSING | core DONE, api DONE |
| Email provider selection (SMTP vs Ethereal) | N/A | N/A | PARTIAL — SMTP+Resend; Ethereal dev fallback GONE | DONE (Ethereal dev) | MISSING | smtp DONE |

## E. Core behavior catalog

All functions in `packages/core/src/services/*`. `context` is `{ ip?, userAgent? }` unless noted. All audit writes go through `logAuditEvent` (awaited, failures swallowed; optional `logger` never supplied by any caller).

### register — `auth.service.ts:14`
- `(input: RegisterRequest, deps: { userDatabase, email, auditDatabase? }, context?) => Promise<void>`
- Normalizes email (trim+lowercase). Parallel `findOne({username})` / `findOne({email})` (redundant `await` inside `Promise.all`, still concurrent — `auth.service.ts:22-25`). Throws `USER_EXISTS` 400 if either exists (audits failure with email+username in metadata). bcrypt(10) hash, `generateToken(32)` → create with hashed verification token + lookupId + 24h expiry. On create falsy → `USER_CREATION_FAILED` 500. On email send failure → delete user, then `EMAIL_SEND_FAILED` 500 (audit). On success audits `register/success`. Returns **void** (old API returned 201 + "User registered successfully. Verify your email first." — Express layer must reinstate the 201/message).
- Deviations: does not catch `DuplicateKeyError` from a create race (uncaught, unlike `updateProfile`); verification token is bcrypt-hashed (old: SHA-256) — old stored hashes are incompatible.

### verifyEmail — `auth.service.ts:81`
- `(token, deps: { userDatabase, auditDatabase? }, context?) => Promise<{ isVerified: true }>`
- Parses `lookupId`, bcrypt-verifies secret; atomic `findOneAndUpdate` consume (`$gt` expiry condition) so double-use can't both succeed. Errors: `INVALID_TOKEN` 400 (invalid/expired/consumed). Old behavior redirected to `CLIENT_URL/login?verified=false|true` — Express adapter must map error→redirect.

### login — `auth.service.ts:147`
- `(input: LoginRequest, deps: { userDatabase, refreshTokenDatabase, auditDatabase? }, config: { jwtSecret }, context?) => Promise<{ accessToken, refreshToken, user }>`
- `findOneByTwoConditions({username}, {email})` (OR); email normalized, **username is not normalized** (case-sensitive, same as old).
- Order: not-found → **`INVALID_CREDENTIALS` 400 "Invalid username or email"** (old: 401 "Invalid credentials") → lockout check (401) → provider check (`INVALID_LOGIN_METHOD` 400, message differs from old) → isVerified check (401) → bcrypt compare → on failure: atomic `incrementLoginAttempts` (contract honored ✓), if `>= 5` (hardcoded) plain `update(lockoutUntil)` — **re-arms the lock on every later failure** (old guarded with `$or:[{lockoutUntil:null},{lockoutUntil:{$lte:now}}]`, `auth.controllers.ts:138`) → `INVALID_CREDENTIALS` 401 "Invalid Credentials" (capitalization differs from old "Invalid credentials").
- Success: reset counters via plain `update` (result assigned to dead `_updated`), 15m access token (jwt.sign, **no pinned algorithm**), 7d refresh (bcrypt-hashed secret + lookupId), audit success. Returns explicit user subset (no password, no token hashes) ✓.
- No timing equalization for unknown user (no dummy compare) — same as old.

### logout — `auth.service.ts:268`
- `(context: { rawToken, userId?, ip?, userAgent? }, deps) => Promise<void>`
- Missing rawToken → `MISSING_TOKEN` 404 "No token found." (old: silent 200). Looks up by lookupId, bcrypt-verifies, deletes by stored hash. Silently succeeds if token unknown. No ownership check vs userId (same as old).

### refresh — `auth.service.ts:292`
- `(context: { rawToken, ip?, userAgent? }, deps, config: { jwtSecret }) => Promise<{ accessToken, refreshToken }>`
- Missing token → `MISSING_TOKEN` 404 (old: 401 "Refresh token not found"). Unknown/invalid → `REFRESH_TOKEN_NOT_FOUND` 401 "Invalid token." Atomic claim `findOneAndUpdate({lookupId, consumed:false}, {consumed:true})`. Claim fails + token exists → delete family + `REFRESH_TOKEN_REUSE_DETECTED` 401. Claimed but expired → `REFRESH_TOKEN_EXPIRED` 401 (token already consumed — acceptable). User gone → **`UNEXPECTED_ERROR_OCCURED` 500** (old: 401 "User not found"). Creates successor in same family, then re-checks predecessor to close the replay window (improvement over old). Errors `REFRESH_TOKEN_CREATION_FAILED` 500. `delete(...).catch(()=>{})` swallow on successor cleanup is deliberate.

### forgotPassword — `auth.service.ts:409`
- `(input: { email }, deps: { userDatabase, email, auditDatabase? }, context?) => Promise<{ message }>`
- Empty/whitespace email → `INVALID_EMAIL` 400 (old: generic success). Unknown email → **`USER_NOT_FOUND` 404 "User not found"** — **breaks API.md:565/1339 ("returns the same response regardless")**. Social account → **`UNEXPECTED_ERROR_OCCURED` 500** with the generic message text (old: 200 generic). Stores bcrypt-hashed token + lookupId + 1h expiry (hardcoded 3600000). Email failure → clears token fields, `EMAIL_SEND_FAILED` 500. Success returns generic message ✓.

### resetPassword — `auth.service.ts:485`
- `(input: { token, newPassword }, deps: { userDatabase, refreshTokenDatabase, auditDatabase? }, context?) => Promise<{ message: "Password Updated." }>` (old: "Password reset successfully")
- lookupId + bcrypt verify; invalid/expired → `INVALID_TOKEN` 400. Revokes ALL refresh tokens for user, then atomic conditional consume + password replace (bcrypt 10, resets loginAttempts/lockout). Then a **second, redundant** `deleteMany({user})` (`auth.service.ts:548`). Revocation before consume is deliberate and documented (retryable on revocation failure).

### changePassword (`updatePassword`) — `profile.service.ts:21`
- `(input: PasswordChangeRequest, context: { userId, ip?, userAgent? }, deps) => Promise<UserWithoutPassword>`
- `USER_NOT_FOUND` 404; social → `SOCIAL_LOGIN_ACCOUNT` 400 (parity); wrong current → `INVALID_CURRENT_PASSWORD` 400 (parity). bcrypt(10), revoke-all-first (documented ordering deviation from old, which updated then revoked), resets attempts/lockout, audits, returns fresh `getProfile`.

### getProfile — `profile.service.ts:8`
- `(context: { userId }, deps) => Promise<UserWithoutPassword>` — `USER_NOT_FOUND` 404. Strips only `password` (parity with old, i.e. still exposes hashed verification/reset tokens, loginAttempts, etc. — pre-existing exposure, see F-015).

### updateProfile — `profile.service.ts:89`
- `(input: ProfileUpdateRequest, context, deps) => Promise<UserWithoutPassword>`
- Allow-list exactly `username, bio, phoneNumber, gender` ✓; duplicates → `DUPLICATE_KEY` 400 with field name (relies on adapter translating E11000 on **update** — the real adapter does not, F-009). Empty updates call `update(id, {})` — real adapter `$set` with empty object is a harmless no-op that still returns the doc; fake tolerates it.

### deleteAccount — `profile.service.ts:144`
- `(context, deps) => Promise<void>` — `USER_NOT_FOUND` 404; deletes tokens then user, audits success. No rollback if delete fails after tokens revoked (acceptable, documented nowhere).

### OAuth — `oauth.service.ts`
- `findOrCreateOAuthUser(input: FindOrCreateOAuthUserInput, deps) => Promise<User>` — by provider id → by email **only if `input.isEmailVerified`** (security improvement over `apps/api/src/services/passport.ts:33` which linked unverified emails); link flips `provider` to the OAuth provider for local accounts (quirky but matches old behavior — later password login is then impossible; `AGENTS.md` documents this). New users: sanitized username (single random-suffix retry; collision race → uncaught DuplicateKeyError, F-011), placeholder email `{profileId}@{provider}.oauth`, **plaintext random-hex password** (F-012), `isVerified: true`. No audit on the "new OAuth user" path (old also didn't).
- `oauthCallback(input: OAuthCallbackInput, deps, config: { jwtSecret }, context?) => Promise<OAuthCallbackResult>` — `OAUTH_FAILED` 401 (no user), `OAUTH_INVALID_USER` 401 (missing id/email/username), updates lastLogin/lastIp via `update` **without checking the result or wrapping in try** (F-013), creates refresh token, `REFRESH_TOKEN_CREATION_FAILED` 500, audits with provider, returns tokens + `{id,email,username,provider}`. Redirects are the Express adapter's job.

### getAuditLogs — `audit.service.ts:7`
- `(input: { userId, page?, limit? }, deps: { auditDatabase })` — clamps page ≥1, limit 1..100 (old identical), parallel find+count (correctly **not** awaited inside the array), returns `{ logs, pagination: { page, limit, total, totalPages } }` (parity + `_id` tie-breaker addition).

### Cross-cutting core checks
- **Email normalization:** register ✓, login ✓ (email only), forgot ✓, OAuth ✓. Username never normalized anywhere (parity).
- **Error model:** every thrown code is in the `AuthErrorCode` union (typecheck-verified). No stray `new Error` in services. Status codes: no 402; `MISSING_TOKEN`→404 and `USER_NOT_FOUND`→404 are questionable but consistent. Enumeration leaks: F-002/F-003; plus `USER_EXISTS` reveals duplicate field only generically (OK, parity).
- **Unawaited promises:** none found; `Promise.all` arrays are properly un-awaited calls except register's redundant inner awaits (INFO).
- **Dead variables:** `_updated` (`auth.service.ts:217`), `_updatedUser` (`profile.service.ts:72`) — lint passes because of the `^_` pattern.
- **Races:** login attempts atomic ✓; refresh claim atomic ✓; lockout set is a separate non-atomic write (minor); username generation has a TOCTOU (F-011); register has a check-then-create race → uncaught DuplicateKeyError (F-018).
- **Config:** hardcoded — lockout threshold 5 + `LOCK_DURATION_MS` (`auth.service.ts:13,202`), bcrypt rounds 10 (×3 sites), verification 24h (`auth.service.ts:48`), reset 1h (`:449`), `ACCESS_TOKEN_EXPIRY '15m'`/`REFRESH_TOKEN_EXPIRY_MS 7d`/`TOKEN_HASH_ROUNDS 10` (`auth.helper.ts:7-9`). `jwtSecret` is the only injected secret config. Single source of truth: **none** (F-017).
- **Mass assignment:** updateProfile allow-list ✓; `update()` itself is wide-open `Partial<User>` but all internal callers pass literal field sets; the schema+`buildUserUpdate` block id/createdAt/updatedAt, `strict:false` lets anything else through — safe today, guard rails worth documenting.
- **Return values:** login/oauthCallback return curated user subsets ✓; getProfile/updatePassword/updateProfile return everything except password (incl. hashed tokens) — parity with old, flag as pre-existing (F-015).
- **JWT:** sign/verify do **not** pin `algorithm`/`algorithms` (`auth.helper.ts:80-99`); `tokenType` enforced ✓; secret non-empty not validated; payload shape `JWTPayload` matches old.
- **OAuth linking:** core requires provider-verified email for linking (fixes an old takeover vector); Express adapter must keep passing `isEmailVerified` from the provider profile.

## F. Findings

Order: severity, then category.

- **F-001 · CRITICAL · Correctness** — `packages/mongo-storage/src/models/refresh-token.model.ts:35`, `audit-log.model.ts:45`
  VERIFIED (code + runtime). Both factories default `name = 'CredUser'` (copy-paste from user.model.ts), so `mongooseStorage()`'s `refreshToken` and `auditLogs` adapters resolve `connection.models['CredUser']` — the **User** model — instead of their own.
  Runtime proof against a scratch mongod: `storage.refreshToken.create(...)` → `ValidationError: CredUser validation failed: email: Path 'email' is required., username: Path 'username' is required.`; same for `auditLogs.create`. Every login/refresh/audit write through this adapter fails.
  Fix: default names `'CredRefreshToken'` / `'CredAuditLog'`; add tests.

- **F-002 · CRITICAL · Security** — `packages/core/src/services/auth.service.ts:432,444`
  VERIFIED. `forgotPassword` throws `USER_NOT_FOUND` 404 for unknown emails and `UNEXPECTED_ERROR_OCCURED` 500 (with the generic message) for social accounts, while success returns `{message: 'If an account exists…'}` 200. `API.md:565` and `API.md:1339` require one identical response in all cases (no email enumeration). Core tests even assert the new behavior (`auth.service.test.ts:725,740`), i.e. the regression is intentional-looking but spec-breaking.
  Fix: throw a non-enumerating marker (e.g. `INVALID_EMAIL`-style generic) or return a sentinel the Express adapter maps to the generic 200; update tests.

- **F-003 · HIGH · Security** — `packages/core/src/services/auth.service.ts:160,215`
  VERIFIED. Unknown user → `INVALID_CREDENTIALS` **400** "Invalid username or email"; wrong password → `INVALID_CREDENTIALS` **401** "Invalid Credentials". `API.md:405/1295` specify 401 + "Invalid credentials" for both. Both message variants and the status split enable account enumeration and break parity. Unknown-user path also skips bcrypt (timing side channel, same as old).
  Fix: single code+status+message for both paths; optionally dummy-compare.

- **F-004 · HIGH · Security** — `packages/core/src/helpers/auth.helper.ts:80-99`
  VERIFIED. `jwt.sign(payload, secret, { expiresIn })` and `jwt.verify(token, secret)` do not pin `algorithm`/`algorithms`. `tokenType` check exists but algorithm confusion/dropping protection is absent. Secret emptiness is not validated anywhere in core.
  Fix: `HS256` on both sign and verify; validate non-empty secret in service entry points or provide a `resolveConfig` helper.

- **F-005 · HIGH · Testing** — `packages/mongo-storage/package.json:44-50`
  VERIFIED. No `test` script, no test runner config, no test files. The package containing the fatal F-001 bug and the trickiest mapping logic (ObjectId↔string, `$gt` conditions, strict:false) has zero tests and no adapter-contract suite that core fakes could mirror.
  Fix: vitest + mongodb-memory-server; test each interface method, id mapping, empty-filter rejection, E11000 translation, and concurrency of `incrementLoginAttempts`/`findOneAndUpdate` claim.

- **F-006 · HIGH · Packaging** — `packages/core/package.json:5-12`
  VERIFIED. `main: "dist/index.js"` and `exports["."].types: "./dist/index.t.mts"` do not exist after build (actual outputs: `dist/index.mjs`, `dist/index.d.mts`). Consumers get broken types resolution and a broken CJS main. Also no `files`, `engines`, `description`, `keywords`, `repository`, `publishConfig` on a scoped package.
  Fix: point exports to `./dist/index.d.mts` / `./dist/index.mjs`, drop `main` or set it to the `.mjs`, add the publish metadata fields.

- **F-007 · HIGH · Packaging** — `packages/core/package.json` (no `files` field); verified via `pnpm pack --dry-run`
  VERIFIED. Core tarball includes **all of `src/` (including every `*.test.ts` and `fakes.ts`), `.turbo/turbo-build.log`, eslint/tsdown/tsconfig**. mongo-storage/smtp ship clean (`dist` + package.json [+ README]) because they have `files:["dist"]`.
  Fix: add `files: ["dist"]` (and a README) to core.

- **F-008 · HIGH · Security** — dependency audit (VERIFIED, network available)
  `pnpm audit`: **50 vulnerabilities — 4 critical, 23 high, 20 moderate, 3 low.** Criticals: `proxy-addr` (via `apps/api>express`; IP spoofing through trust proxy), `handlebars` ×2 (via `ts-jest`, dev-only), `mongoose` "sanitizeFilter not applied on countDocuments" (also relevant to `mongo-storage`, whose `count()` uses raw filters). Note `apps/api` sets `trust proxy = 1` (`app.ts:27`), which is precisely the affected surface.
  Fix: bump express/mongoose/express-rate-lock chains; dev-only handlebars acceptable short-term.

- **F-009 · HIGH · Correctness** — `packages/mongo-storage/src/adapters/user.adapter.ts:130-143` vs `packages/core/src/__tests__/fakes.ts:101-107`
  VERIFIED. Real `update` does **not** translate E11000 into `DuplicateKeyError` (no try/catch), while the fake enforces uniqueness and throws it. `updateProfile` (`profile.service.ts:114-130`) catches `DuplicateKeyError` — so the tested path (dup username update) passes with fakes but produces an escaped raw `MongoServerError` (500-ish) with the real adapter on a race. Also `update` returns `null` cast to `User` when the doc vanished (`as User`, `:142`) — the interface's non-null promise is false, and `oauthCallback` (`oauth.service.ts:118`) ignores the result entirely.
  Fix: wrap update in the same duplicate-key translation; change the interface to `User | null` (or throw) and make core check it.

- **F-010 · MEDIUM · Security/Correctness** — `packages/core/src/services/auth.service.ts:201-206` vs `apps/api/src/controllers/auth.controllers.ts:136-141`
  VERIFIED. Old code only sets `lockoutUntil` when currently unlocked (`$or:[{lockoutUntil:null},{lockoutUntil:{$lte:now}}]`); core re-sets it unconditionally on every failed attempt once attempts ≥5, letting an attacker keep the account locked forever by continuing to fail (lock window never lapses while they hammer it).
  Fix: use `findOneAndUpdate` with the same "not currently locked" condition.

- **F-011 · MEDIUM · Correctness** — `packages/core/src/services/oauth.service.ts:9-20,63-76`
  VERIFIED. Username generation is check-then-create; concurrent OAuth users with the same display name can collide and the adapter's E11000 (translated only in `create` ✓) escapes `findOrCreateOAuthUser` uncaught (not mapped to an AuthError). Single random-suffix retry can also still collide.
  Fix: catch `DuplicateKeyError` around `create` and retry with a new suffix (bounded).

- **F-012 · MEDIUM · Quality** — `packages/core/src/services/oauth.service.ts:71`
  VERIFIED. OAuth-created users get `password: crypto.randomBytes(32).toString('hex')` — plaintext random stored as the password (core hashes passwords only in register/reset/change). Harmless (unusable, unguessable) but inconsistent and confusing; the "password required for local" hook passes because provider != local.
  Fix: store a bcrypt hash of random bytes, or empty string + explicit sentinel.

- **F-013 · MEDIUM · Correctness** — `packages/core/src/services/oauth.service.ts:118-121`
  VERIFIED. `oauthCallback` calls `deps.userDatabase.update(userId, {...})` without checking the result or catching errors. With the real adapter, a stale/foreign id returns `null` (silently ignored — OK) but a DB error propagates as a raw Mongoose error, not an AuthError (old code caught everything and redirected).
  Fix: wrap in try/catch → `OAUTH_FAILED`; decide on `null` handling.

- **F-014 · MEDIUM · Data** — `packages/mongo-storage/src/adapters/refreshToken.adapter.ts:32-41`, `auditLog.adapter.ts:29-38`
  VERIFIED. Both mappers destructure only `__v` and `user`; **`_id` remains in the returned object** (an ObjectId leaking as a non-string into core data, cast to the `RefreshToken`/`AuditLogInterface` types that don't declare it). Audit logs therefore expose `_id` in JSON (old behavior also did, so API-compatible — but the contract is a lie and `user`-nested ObjectIds are handled inconsistently: refresh `user` is converted, audit `user` converted, `_id` not).
  Fix: map `_id` → `id` (string) or explicitly strip it; align with the documented "plain objects with string id" goal.

- **F-015 · MEDIUM · Security (pre-existing parity)** — `packages/core/src/services/profile.service.ts:17,140`
  VERIFIED. `getProfile`/`updateProfile`/`updatePassword` return the full record minus `password`, including `verificationToken`/`resetPasswordToken` bcrypt hashes, `loginAttempts`, `lockoutUntil`. Identical to the old controllers, so parity holds — but this is needless data exposure for a public package; `apps/api` responses would change shape if fixed (compat decision needed).
  Fix: curated projection for public returns; document compatibility impact.

- **F-016 · MEDIUM · Architecture** — `packages/core/src/validators/auth.validators.ts` vs `packages/shared/src/validators/auth.validator.ts`
  VERIFIED byte-identical (48 lines each). Validators are now duplicated in two packages with different import paths; drift is a matter of time. `AUDIT_ACTIONS` + audit types are tripled (`shared`, `core`, `mongo-storage/src/types/audit.types.ts`); `JWTPayload` duplicated (shared + core).
  Fix: make core the single home for adapters-facing validators/types (or have shared re-export core's), delete the copies, update apps/api.

- **F-017 · MEDIUM · Architecture/DX** — constants scattered
  VERIFIED. Lockout 5/15min (`auth.service.ts:13,202`), token TTLs and bcrypt rounds (`auth.helper.ts:7-9`), 24h/1h token expiry inline (`auth.service.ts:48,449`), audit TTL 90d (`audit-log.model.ts:43`), audit page max 100 (`audit.service.ts:12`) vs adapter MAX_LIMIT 1000 (`auditLog.adapter.ts:16`). No `config` type exists; `jwtSecret` is the only injected secret.
  Fix: single `CredConfig` (lifetimes, rounds, thresholds, TTLs) threaded through the services; defaults exported.

- **F-018 · MEDIUM · Correctness** — `packages/core/src/services/auth.service.ts:40-70`
  VERIFIED. Register's check-then-create race lets a concurrent duplicate slip past `USER_EXISTS` and surface as an uncaught `DuplicateKeyError` (raw to the caller, no AuthError mapping). Old code had the same race but its blanket try/catch turned it into a 500.
  Fix: catch `DuplicateKeyError` → `USER_EXISTS` (or `DUPLICATE_KEY`).

- **F-019 · MEDIUM · Security** — `apps/api/src/services/passport.ts:33-52`
  VERIFIED (old app only). Links OAuth identities to existing accounts by email **without checking provider email verification** — classic account-takeover vector. Core already fixed this via `isEmailVerified` (`oauth.types.ts:25`); the old app remains vulnerable until migrated. Documented here so the Express adapter doesn't regress it.

- **F-020 · LOW · Correctness** — `packages/core/src/services/auth.service.ts:519,548`
  VERIFIED. `resetPassword` calls `deleteMany({user})` twice (before consume and again after) — the second call is redundant dead work.
  Fix: keep the pre-consume revocation (commented rationale), drop the second.

- **F-021 · LOW · Correctness** — `packages/core/src/services/auth.service.ts:273,305`; `:444`
  VERIFIED. `MISSING_TOKEN` for missing cookie is 404 in logout/refresh (old: silent 200 / 401). Social-account forgot-password uses `UNEXPECTED_ERROR_OCCURED` 500 with a benign message — semantically wrong code for the situation.
  Fix: pick correct codes/statuses and let the Express adapter map them.

- **F-022 · LOW · Quality** — `packages/core/src/errors/auth-error.ts:14` (`'UNEXPECTED_ERROR_OCCURED'` — typo, public API), `packages/core/src/helpers/auth.helper.ts:80` (`id: string | string`), `auth.service.ts:184` ("cannot be logined by this method"), and `user?.`/`claimed?.` redundant optional chaining after null checks.
  VERIFIED. Cosmetic but exported identifiers/messages are API surface.

- **F-023 · LOW · Architecture** — `packages/smtp/src/helpers/email.helper.ts:1`
  VERIFIED. The SMTP adapter imports **runtime values** (templates `emailVerification`, `passwordReset`) from `@cred/core`, and both adapters declare `@cred/core` as a **regular dependency** (`smtp/package.json:54`, `mongo-storage/package.json:52`) — the stated rule is "types only, as peer dependency". Templates-as-core-exports is a design choice that forces this; either accept runtime import (then keep dependency, not peer) or move templates into the email adapter / accept them as injected options.
  Fix: decide the contract; if types-only, move templates out of core's runtime exports and make `@cred/core` a peerDependency in both adapters.

- **F-024 · LOW · Packaging** — `packages/mongo-storage/package.json:51-53`, `packages/smtp/package.json:53-56`
  VERIFIED. `mongoose` (and arguably `nodemailer`) are regular dependencies of adapters — for host-app coexistence they should be peerDependencies (double-install of mongoose breaks `instanceof`/plugin behavior across copies). No `publishConfig.access` on the scoped packages; smtp version is `1.0.0` while core/mongo-storage are `0.1.0` (pre-release consistency); root LICENSE is MIT while packages declare `license: "ISC"`; mongo-storage and core have **no README** (smtp does).

- **F-025 · LOW · Quality** — `packages/core/package-lock.json`
  VERIFIED (`lockfileVersion: 3`, npm format). Stray npm lockfile inside a pnpm workspace (also explains why core has version 1.0.0 inside it). Delete or gitignore.

- **F-026 · LOW · Security** — git history contains `.env`-family files (7 commits touch them, e.g. `f4162ab` "Created a Basic version…", `0bfede5` "Remove .env from tracking"); branch `main-with-secret-backup` exists. Present tree is clean (`.env`/`.env.local` gitignored, untracked — VERIFIED via `git check-ignore`). Treat all historical secrets as compromised; rotate.
  VERIFIED (history listing; contents not read).

- **F-027 · LOW · Data** — `packages/mongo-storage/src/models/user.model.ts:87-90`
  VERIFIED. Indexes exist on `verificationToken`/`resetPasswordToken` (legacy hashed-token lookups), but the new lookup flow queries `verificationTokenLookup`/`resetPasswordTokenLookup` (`auth.service.ts:84,492`) — **no schema field and no index** for either (persisted only via `strict:false`, read via `strictQuery:false`). Unindexed lookups on a users collection; also no unique index on token `lookupId`.
  Fix: add schema fields + indexes for the lookup ids; drop the legacy indexes.

- **F-028 · LOW · Data** — `packages/mongo-storage/src/models/user.model.ts:92-96`
  VERIFIED. The "password required for local accounts" rule is a pre-save hook, which does **not** run on `findByIdAndUpdate`/`updateOne` paths the adapter uses for updates (create does run it). `runValidators:true` covers schema validators only, so an update could blank a local user's password. Core never does this today, but the invariant is only half-enforced.
  Fix: enforce in core (reject `password: null` updates for local users) or move to schema validation.

- **F-029 · INFO · Architecture** — `@cred/shared` is still the only package apps/api consumes; core neither depends on shared nor re-exports it. Fine for the target state; but note the API-facing types `RegisterRequest`/`LoginRequest` exist in both packages with identical shapes (shared: `apps/api` uses them; core: its own). Consolidate before Express adapter work to avoid a third copy.

- **F-030 · INFO · DX** — `apps/api/package.json:10` root `pnpm test` uses POSIX env syntax (fails on Windows); `pnpm dev` still broken (`ts-node-dev --esm`). No CI at all (`.github` absent). AGENTS.md claims "not a git repo" — outdated, it is one (`AGENTS.md` vs reality).

## G. Risk checklist results

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Core: zero express/mongoose/nodemailer/passport imports, zero `process.env` | **PASS** | grep across `packages/core` (0 matches); package.json deps: zod/bcryptjs/jsonwebtoken only; eslint `no-restricted-imports` (`core/eslint.config.js:34-42`) |
| 2 | Every AuthError code in the union; typechecks | **PASS** | All thrown codes ∈ `AuthErrorCode` (`auth-error.ts:1-25`); `tsc --noEmit` exit 0 on core |
| 3 | login(): unknown user == wrong password (no 400/402 split); null-user checked before `user.provider` | **FAIL** (F-003) | 400 vs 401 + different messages (`auth.service.ts:160` vs `:215`); null-check order itself is correct (`:152` before `:163,175`) |
| 4 | Lockout counter atomic via dedicated method | **PASS** | `incrementLoginAttempts` (`auth.service.ts:201`, adapter `$inc` `user.adapter.ts:163-178`); lockout *set* is separate (F-010) |
| 5 | No unawaited adapter promises; no `await` inside `Promise.all` elements | **PASS (with note)** | All adapter calls awaited; register's `Promise.all` has redundant awaits but remains concurrent (`auth.service.ts:22-25`) |
| 6 | Email lowercased/trimmed in register, login, forgot, OAuth | **PASS** | `auth.service.ts:20,150,418`; `oauth.service.ts:37` |
| 7 | No `findOne` can receive undefined values / empty filter without adapter rejection | **PASS** | `toMongoFilter` throws on empty + strips undefined (`database.helper.ts:3-13`); token filter same (`refreshToken.adapter.ts:49-57`); `findOneByTwoConditions` silently returns null for empty (acceptable); undefined values stripped |
| 8 | Profile update allow-list; privileged fields unreachable | **PASS** | `profile.service.ts:107-111`; adapter strips id/createdAt/updatedAt (`user.adapter.ts:77-80`) |
| 9 | Password/token hashes never returned from core | **PASS** | login/oauthCallback return curated subsets; getProfile strips password (hashed *email/reset* tokens still returned — parity, F-015; bcrypt token hashes only internally) |
| 10 | Refresh consumption single atomic op; reuse revokes family | **PASS** | `auth.service.ts:326-339` + adapter `findOneAndUpdate` (`refreshToken.adapter.ts:142-155`); plus post-successor replay recheck (`:385-393`) |
| 11 | Reset/change revoke all tokens; deletion removes them | **PASS** | `auth.service.ts:519`, `profile.service.ts:70,153` (extra duplicate deleteMany F-020) |
| 12 | Audit cannot throw into request path; no secrets recorded | **PASS (with note)** | `audit.helper.ts:9-22` try/catch; metadata records emails + reasons but never tokens/passwords (`auth.service.ts:32,67` — emails recorded, acceptable parity) |
| 13 | Adapter returns plain objects, string `id`, no `_id`/`__v`, nested user → string | **FAIL** (F-014) | refresh/audit mappers keep `_id` as ObjectId (`refreshToken.adapter.ts:33`, `auditLog.adapter.ts:30`); user mapper is correct (`user.adapter.ts:35-42`) |
| 14 | `password` select handled so login/change receive hash | **PASS (by omission)** | schema has no `select:false` (`user.model.ts:15-18`), so hash always returned; matches original model exactly |
| 15 | Hook-dependent validation enforced post-move | **FAIL (half-enforced)** (F-028) | pre-save hook runs only on `create`/`save` (`user.model.ts:92-96`); update path can clear password |
| 16 | Models per connection, no host collision; no `process.env` in adapter | **FAIL** (F-001) | models are per-`createConnection` ✓ (`mongo-storage/src/index.ts:33`) but all three default to name `'CredUser'` — refresh/audit hijack the User model (runtime-proven); no `process.env` reads in adapter ✓ |
| 17 | Unique/sparse/TTL indexes match original models | **PASS** | Field-by-field diff of the three models: identical to `apps/api/src/models/*` (fields, defaults, enums, timestamps, all 7 indexes incl. sparse googleId/githubId, 90d audit TTL, refresh expiresAt TTL); only the new lookup fields lack indexes (F-027) |
| 18 | Email adapter throws on send failure; user values escaped | **PASS** | `email.helper.ts:121-127` rethrows with `cause`; token URL-encoded (`:131,136`); BACKEND_URL validated (`:45-63`); no user-controlled values inside HTML body (only verified link + generated expiry) |
| 19 | JWT pins algorithm; tokenType checked; secret non-empty | **FAIL** (F-004) | no `algorithms` option sign/verify (`auth.helper.ts:80-99`); tokenType ✓ (`:101`); secret validation absent |
| 20 | E11000 register race → clean USER_EXISTS-style error | **FAIL** (F-018) | `register` does not catch `DuplicateKeyError` (create translation exists in adapter, `user.adapter.ts:117-123`, but core lets it escape) |
| 21 | Constants single source of truth | **FAIL** (F-017) | lockout/TTL/rounds hardcoded across service + helper |
| 22 | Core tests assert `code`, not message; cover every branch | **PASS (with note)** | `rejects.toMatchObject({ code, statusCode })` throughout; a few `result.message` assertions on success payloads only; oauthCallback DB-error path untested (F-013) |
| 23 | `pnpm build` passes everywhere; exports/types exist | **FAIL** (F-006) | build ✓ 5/5; but core's declared `main`/`types` paths don't exist in dist |
| 24 | Tests excluded from published artifacts | **FAIL (core only)** (F-007) | core tarball ships `src/**` incl. all tests; mongo-storage/smtp clean |
| 25 | Original apps/api Jest suite passes unchanged | **PASS** | 122/122, 7/7 suites (run 3, after binary cached) |

**Score: 17 PASS / 7 FAIL / 1 PASS-with-note among the 25.**

## H. Missing and broken features

**Broken (regressions or defects):**
- Login/refresh/audit via the real Mongoose adapter — fatal model-binding bug (F-001).
- forgot-password enumeration semantics (F-002); login response contract (F-003).
- Profile-update duplicate handling against the real adapter (F-009).
- Lockout re-arming behavior (F-010).
- JWT algorithm pinning (F-004).

**Missing:**
- `@cred/express` adapter (entire HTTP layer: routes, cookies, redirects, rate limiting, validation wiring, error→envelope/redirect mapping) — spec exists in `specs/01-express-adapter.md`.
- Tests for `@cred/mongo-storage` (F-005); any integration test wiring core + mongo-storage + smtp together.
- Resend-verification endpoint (never existed — parity-OK).
- Ethereal development email fallback in `@cred/smtp` (old app had it; new package only offers SMTP/Resend — demo/dev story gap).
- Publish metadata for core (files/engines/README/repository/publishConfig) and peer-dependency declarations for adapters (F-006, F-023, F-024).
- Coverage tooling for the Vitest packages; CI of any kind.

## I. Recommended remediation plan

**Fix before writing the Express adapter:**
1. F-001 model-name defaults (S) + F-005 adapter test suite incl. contract/concurrency tests (M).
2. F-002/F-003 error-semantics decisions — these define the error→JSON mapping the Express adapter implements (S each + test updates).
3. F-004 pin JWT algorithms; validate secret (S).
4. F-009 duplicate-key translation on `update` + fix the `update` return contract (`User | null`) and check it in `oauthCallback` (S).
5. F-017 introduce a single config object (lifetimes, rounds, thresholds) with defaults (M).
6. F-016 deduplicate validators/types between core and shared (M, decides the package boundary before `@cred/express` imports them).

**Fix before publishing:**
7. F-006 core `exports`/`main` paths + publish metadata; F-007 `files` whitelist; F-024 peer deps (`mongoose`, `nodemailer`, `@cred/core`), `publishConfig.access`, version/README/license alignment (S–M).
8. F-023 decide templates-in-core vs injected; align smtp dependency categories (S).
9. F-008 dependency bumps (express chain critical first) (S).
10. F-026 rotate any secrets historically committed; purge if repo policy requires (S–M).
11. F-027 lookup-field schema + indexes; F-028 password invariant enforcement (S).

**Nice to have:**
12. F-010 lockout condition parity; F-011/F-018 duplicate-key retry/mapping in register and OAuth username flow (S).
13. F-012 hash OAuth placeholder password; F-020 drop duplicate deleteMany; F-014 `_id` mapping; F-021/F-022 code/status/message cleanups and typo fixes (S).
14. F-015 curated public projections (needs a compat decision with API.md) (M).
15. CI workflow + Windows-safe `test` script; Vitest coverage provider (M).
16. Root `format:check` cleanup (79 files) — deliberate formatting pass only (S–M).

## J. Open questions / could not verify

- **Core/smtp Vitest coverage %:** UNVERIFIED — `@vitest/coverage-v8` not installed; deliberately not added (read-only audit).
- **npm scope ownership:** `@cred/core` returns E404 on the public registry (VERIFIED — name appears free). `@cred` bare-scope query errored in PowerShell; treated as unclaimed.
- **`pnpm dev` / runtime behavior of apps/api with real SMTP/Atlas:** not exercised (no live services); `pnpm start` not run to avoid touching user's real `.env` databases.
- **Express-adapter spec compliance:** `specs/01-express-adapter.md` is untracked; its `basePath`/cookie-path plan is noted as the owner's intent, not a verified decision.
- **Assumption:** `apps/api` models are byte-identical in schema to `mongo-storage` models except where noted (verified by read; formatting differences only).
- **Assumption:** the PowerShell `2>&1` exit-code artifacts (build/pack/audit "exit 1") were harness-side; each was re-verified with a clean invocation.
- **AGENTS.md discrepancies:** claims "not a git repo" (it is), "31 unformatted files" (now 79), "122 tests in 7 suites" (still true). MongoDB binary cache note (60s timeout on first run) matched observed behavior exactly.

## K. Appendix (verbatim contracts)

### K.1 `packages/core/src/types/deps.types.ts` (adapter interfaces)

```ts
import { AuditLogInterface } from "./audit.types.js";
import { RefreshToken, RegisterRequest, User } from "./auth.types.js";

/**
 * A filter value that also supports the comparison operators needed for
 * time-based conditional updates (for example, an unexpired deadline).
 */
export type QueryValue<T> =
    | T
    | { $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T };

export type UserQuery = {
    [K in keyof User]?: QueryValue<User[K]>;
};

export type CreateUserInput = RegisterRequest & {
    verificationToken?: string,
    verificationTokenExpires?: Date,
    verificationTokenLookup?: string | null,
} & Partial<Pick<User, 'provider' | 'googleId' | 'githubId' | 'avatar' | 'isVerified' | 'resetPasswordToken' | 'resetPasswordExpires' | 'resetPasswordTokenLookup' | 'loginAttempts' | 'lockoutUntil'>>;

/**
 * Storage adapters must translate native uniqueness violations (for example,
 * MongoDB error code 11000) into `DuplicateKeyError` from
 * `../errors/duplicate-key-error.js`. Core services never inspect driver
 * specific error codes.
 */
export interface UserDatabaseAdapter {
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


export interface RefreshTokenDatabaseAdapter {
    findOne(filter: Partial<RefreshToken>): Promise<RefreshToken | null>;
    create(token: RefreshToken): Promise<RefreshToken>;
    delete(token: string): Promise<void>;
    update(id: string, updates: Partial<RefreshToken>): Promise<RefreshToken>;
    /**
     * Atomically updates the first token matching `condition`.
     * Returns `null` when no token matches; a no-match must not throw.
     */
    findOneAndUpdate(condition: Partial<RefreshToken>, updation: Partial<RefreshToken>): Promise<RefreshToken | null>;
    deleteMany(filter: Partial<RefreshToken>): Promise<void>;
}



export interface EmailAdapter {
    sendEmailVerification(email: string, rawToken: string): Promise<void>;
    sendPasswordReset(email: string, rawToken: string): Promise<void>;
}

export interface AuditLogFilter {
    user?: string | null;
}

export interface AuditDatabaseAdapter {
    create(audit: Partial<AuditLogInterface>): Promise<AuditLogInterface>
    /**
     * Returns the logs matching `filter`, newest first.
     */
    find(filter: AuditLogFilter, options: { skip: number, limit: number }): Promise<AuditLogInterface[]>
    /**
     * Returns the number of logs matching `filter`.
     */
    count(filter: AuditLogFilter): Promise<number>
}

/**
 * Optional sink for audit-write failures. Audit logging is fire-and-forget and
 * must never change the result of the authentication operation that triggered
 * it, so a missing logger simply drops the error.
 */
export interface AuditErrorLogger {
    error(...args: unknown[]): void;
}
```

### K.2 `packages/core/src/types/auth.types.ts`

```ts
export interface User extends RegisterRequest {
  id: string;
  isVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpires: Date | null;
  /** Public lookup id used to find a user by an opaque verification token. */
  verificationTokenLookup?: string | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  /** Public lookup id used to find a user by an opaque reset token. */
  resetPasswordTokenLookup?: string | null;
  googleId?: string;
  githubId?: string;
  provider: 'local' | 'github' | 'google';
  avatar: string | null;
  loginAttempts: number;
  lockoutUntil: Date | null;
  lastLogin: Date | null;
  lastIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RegisterRequest = {
  username: string;
  email: string;
  password: string;
  bio?: string;
  phoneNumber?: string;
  gender?: 'male' | 'female' | 'other';
}

export type LoginRequest = { password: string } & (
  | { email: string; username?: string }
  | { email?: string; username: string }
);
export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ProfileUpdateRequest {
  username?: string;
  bio?: string;
  phoneNumber?: string;
  gender?: 'male' | 'female' | 'other';
}
export interface JWTPayload {
  id: string;
  email: string;
  username: string;
  tokenType: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenData {
  rawToken: string;
  family: string;
  hashedToken: string;
  expiresAt: Date;
  lookupId: string;
}

export interface RefreshToken {
  /** Public lookup id used to find the token before bcrypt verification. */
  lookupId?: string;
  token:string;
  user:string
  family:string
  expiresAt:Date
  consumed:boolean
}

export type UserWithoutPassword = Omit<User, 'password'>;
```

### K.3 `packages/core/src/errors/auth-error.ts` and `duplicate-key-error.ts`

```ts
export type AuthErrorCode =
  | 'USER_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_TOKEN'
  | 'EMAIL_SEND_FAILED'
  | 'USER_CREATION_FAILED'
  | 'USER_DELETION_FAILED'
  | 'MISSING_CREDENTIALS'
  | 'INVALID_LOGIN_METHOD'
  | 'REFRESH_TOKEN_CREATION_FAILED'
  | 'MISSING_TOKEN'
  | 'UNEXPECTED_ERROR_OCCURED'
  | 'REFRESH_TOKEN_REUSE_DETECTED'
  | 'REFRESH_TOKEN_NOT_FOUND'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'INVALID_EMAIL'
  | 'USER_NOT_FOUND'
  | 'OAUTH_FAILED'
  | 'OAUTH_INVALID_USER'
  | 'SOCIAL_LOGIN_ACCOUNT'
  | 'INVALID_CURRENT_PASSWORD'
  | 'DUPLICATE_KEY'
  ;

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
```

```ts
export class DuplicateKeyError extends Error {
  constructor(public readonly field?: string) {
    super(field ? `${field} is already taken` : 'A unique field is already taken');
    this.name = 'DuplicateKeyError';
  }
}
```

### K.4 `packages/core/src/types/audit.types.ts` and `oauth.types.ts`

```ts
export const AUDIT_ACTIONS = [
    'register', 'login', 'logout', 'token_refresh', 'email_verification',
    'password_reset_request', 'password_reset', 'oauth_login', 'profile_update',
    'password_change', 'account_deletion',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogParams {
    user?: string | null;
    action: AuditAction;
    status: 'success' | 'failure';
    ip?: string | null;
    userAgent?: string | null;
    provider?: 'local' | 'google' | 'github' | null;
    metadata?: Record<string, unknown> | null;
}

export interface AuditLogInterface {
    user: string | null;
    action: AuditAction;
    status: 'success' | 'failure';
    ip: string | null;
    userAgent: string | null;
    provider: 'local' | 'google' | 'github' | null;
    metadata: Record<string, unknown> | null;
}
```

```ts
export type OAuthProvider = 'local' | 'google' | 'github';

export interface OAuthUser {
    id?: string;
    email?: string;
    username?: string;
    provider?: OAuthProvider;
}

export interface FindOrCreateOAuthUserInput {
    provider: 'google' | 'github';
    profileId: string;
    email?: string;
    displayName?: string;
    avatar?: string;
    /**
     * Whether the provider has verified ownership of `email`. Email-based
     * linking is only allowed when this is true; unverified addresses must go
     * through a separate authenticated link flow or a new account.
     */
    isEmailVerified: boolean;
}

export interface OAuthCallbackInput {
    user?: OAuthUser | null;
    /** The provider used for the current login, which may differ from the linked account's stored provider. */
    provider: 'google' | 'github';
}

export interface OAuthCallbackResult {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; username: string; provider?: OAuthProvider };
}
```

### K.5 `packages/core/src/index.ts` (exports)

```ts
export * from './services/auth.service.js';
export * from './services/oauth.service.js';
export * from './services/profile.service.js';
export * from './services/audit.service.js';
export * from './errors/auth-error.js';
export * from './errors/duplicate-key-error.js';
export * from './types/auth.types.js';
export * from './types/oauth.types.js';
export * from './types/audit.types.js';
export * from './types/deps.types.js';
export * from './helpers/auth.helper.js';
export * from './helpers/audit.helper.js';
export * from './templates/email.templates.js';
export * from './validators/auth.validators.js';
```

### K.6 Adapter factories and options

**`@cred/mongo-storage` (`src/index.ts`):**

```ts
export type MongooseStorageOptions =
    | { uri: string; connection?: never }
    | { connection: Connection; uri?: never };

export interface MongooseStorage {
    user: UserDatabaseAdapter;
    refreshToken: RefreshTokenDatabaseAdapter;
    auditLogs: AuditDatabaseAdapter;
    ready: () => Promise<void>;
    close: () => Promise<void>;
}

export function mongooseStorage(options: MongooseStorageOptions): MongooseStorage {
    let connection: Connection;
    let owned = false;
    if (options.connection) {
        connection = options.connection;
    } else {
        if (!options.uri || typeof options.uri !== 'string') {
            throw new Error('mongooseStorage: "uri" or "connection" is required');
        }
        connection = mongoose.createConnection(options.uri);
        owned = true;
    }
    return {
        user: createUserAdapter(getUserModel(connection)),
        refreshToken: createRefreshTokenAdapter(getRefreshModel(connection)),
        auditLogs: createAuditAdapter(getAuditModel(connection)),
        ready: async () => { await connection.asPromise(); },
        close: async () => { if (owned) await connection.close(); },
    };
}
```

**`@cred/smtp` (`src/index.ts`):**

```ts
export type emailServiceOptions = smtpOptions & resendOptions & {
    provider?: 'smtp' | 'resend';
    EMAIL_FROM: string;
    BACKEND_URL: string;
    timeZone?: string;
    resetTokenTtlMs?: number;
    verifyOnStart?: boolean;
};

export interface EmailService {
    EMAIL: EmailAdapter;
    verify(): Promise<void>;
    close(): void;
}

export async function emailService(options: emailServiceOptions): Promise<EmailService>
// provider resolution: explicit provider wins; else Resend when RESEND_API_KEY set; else SMTP.
```

(`smtpOptions`/`resendOptions` see `src/lib/transporter.ts:32-47` and `src/lib/resend.ts:15-26`: SMTP_HOST/PORT/SECURE/USER/PASS/requireTLS/maxConnections/maxMessages/timeouts; RESEND_API_KEY/RESEND_BASE_URL/requestTimeoutMs/retry/fetchImpl/sleep.)

### K.7 package.json essentials

- **`@cred/core` 0.1.0** — `type: module`; `main: dist/index.js` (stale), `types: dist/index.d.ts` (stale), `exports: {".": {types: "./dist/index.t.mts", default: "./dist/index.mjs"}}` (types path stale); deps: `@types/node ^26.6.6` (misplaced), `bcryptjs ^3.0.3`, `jsonwebtoken ^9.0.3`, `tsx ^4.23.15` (misplaced), `zod ^4.6.7`; devDeps include `@typescript/native: npm:typescript@^7.0.2`, `typescript: npm:@typescript/typescript6@^6.0.2`, tsdown, eslint, typescript-eslint, vitest; scripts: test/build/lint/lint:fix; no files/engines/repository/description; license ISC. tsconfig: strict, ES2022, NodeNext; tsdown: entry src/index.ts, esm, dts, clean.
- **`@cred/mongo-storage` 0.1.0** — exports `./dist/index.d.mts` / `./dist/index.mjs` (exist ✓), `files:["dist"]`, `sideEffects:false`, engines node ≥20; deps `@cred/core workspace:*`, `mongoose ^9.7.0` (should be peer); devDeps tsdown/eslint/typescript; scripts build/dev/lint/lint:fix/typecheck (no test). tsconfig strict NodeNext.
- **`@cred/smtp` 1.0.0** — same export/files/engines shape ✓, has README; deps `@cred/core workspace:*`, `nodemailer ^10.5.0` (peer candidate); devDeps + vitest; scripts build/dev/lint/typecheck/test.
- **`@cred/shared` 0.0.0 (private)** — tsup build, zod peer+dev, exports dist/index.js + d.ts.
- **`@cred/api` 1.0.0 (private)** — Express 5, mongoose, zod, passport, nodemailer, jsonwebtoken, bcryptjs; Jest 30 + ts-jest ESM preset + mongodb-memory-server + supertest; `test` POSIX-only syntax; tsconfig extends `@cred/config/tsconfig/node.json` (strict, NodeNext), excludes `src/__tests__`.
- **Root** — pnpm@10.33.2, turbo 2.5.2, prettier, TS 6; tasks build/dev/start/test/test:coverage with `^build` deps; no CI.

### K.8 Mongoose schemas (mongo-storage; identical to apps/api originals except as noted)

**User** (`CredUser`, collection `User`): `username` String req unique · `email` String req unique · `password` String optional (no select:false) · `bio` String opt · `phoneNumber` String opt · `gender` enum [male,female,other,null] default null · `isVerified` Bool default false · `verificationToken` String default null · `verificationTokenExpires` Date default null · `resetPasswordToken` String default null · `resetPasswordExpires` Date default null · `googleId`/`githubId` String (sparse unique indexes) · `provider` enum [local,github,google] default 'local' · `avatar` String default null · `loginAttempts` Number default 0 · `lockoutUntil` Date default null · `lastLogin` Date default null · `lastIp` String default null; `{timestamps:true}`; indexes: `(verificationToken, verificationTokenExpires)`, `(resetPasswordToken, resetPasswordExpires)`, `googleId` sparse-unique, `githubId` sparse-unique. **Missing (new flow):** `verificationTokenLookup`, `resetPasswordTokenLookup` fields/indexes. Hook: pre-save async — throws `'Password is required for local accounts'` when `provider==='local' && !password`.

**RefreshToken** (name default **`'CredUser'` — F-001**, collection `RefreshToken`): `token` String req · `user` ObjectId ref 'User' req · `family` String req · `expiresAt` Date req · `consumed` Bool default false; `{timestamps:true}`; indexes: `token`, `(user, family)`, TTL `expiresAt` (0s).

**AuditLog** (name default **`'CredUser'` — F-001**, collection `AuditLog`): `user` ObjectId ref 'User' default null · `action` String req enum AUDIT_ACTIONS · `status` String req enum [success,failure] · `ip`/`userAgent` String default null · `provider` enum [local,google,github,null] default null · `metadata` Mixed default null; `{timestamps:true}`; indexes: `(user, createdAt desc)`, TTL `createdAt` 90 days.

---

## Commands used to produce the baseline (reproduction list)

```powershell
# from D:\MERN\cred
pnpm install --frozen-lockfile
pnpm build                                 # clean run: exit 0 (5/5 tasks)
pnpm --filter @cred/mongo-storage --filter @cred/smtp typecheck
cd packages/core;   pnpm exec tsc --noEmit
pnpm --filter @cred/core --filter @cred/mongo-storage --filter @cred/smtp lint
cd packages/core;   pnpm exec vitest run                    # 135 passed
cd packages/smtp;   pnpm exec vitest run                    # 65 passed
cd apps/api
  $env:NODE_OPTIONS='--experimental-vm-modules'
  pnpm exec jest                                            # 122 passed (after binary cached)
  pnpm exec jest --coverage                                 # stmts 77.82 / branches 56.61 / funcs 81.63 / lines 78.54
pnpm audit                                                  # 50 vulns (4 critical)
pnpm --filter @cred/core pack --dry-run                     # ships src/** incl. tests
pnpm --filter @cred/mongo-storage pack --dry-run
pnpm --filter @cred/smtp pack --dry-run
pnpm format:check                                           # 79 files
npm view @cred/core                                         # E404 → scope name free
node --input-type=module -e "<mongooseStorage runtime check>"   # ran in packages/mongo-storage against a scratch mongod 8.2.6 on port 39019
git log --oneline -30; git status; git check-ignore -v .env apps/api/.env.local; git log --all -- .env apps/api/.env apps/api/.env.local
```
