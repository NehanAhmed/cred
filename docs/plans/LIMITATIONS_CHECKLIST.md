# Known Limitations Checklist

Progress: **7 / 13 tasks complete** (7 done, 0 in progress, 0 blocked, 0 skipped).
Phases 0-2 complete. Phase 3: L-05 done; L-04 next.

States: `[ ]` not started, `[~]` in progress (only one at a time), `[x]` done
and verified, `[!]` blocked (needs owner decision), `[-]` skipped with reason.

## Phase 0: Discovery and planning

- [x] Phase 0 Create branch, baseline, and tracking files
  - [x] untracked community/task files preserved
  - [x] branch `fix/known-limitations` created
  - [x] `pnpm install --frozen-lockfile` recorded
  - [x] `pnpm turbo run build lint typecheck test` recorded
  - [x] `pnpm format:check` failure recorded
  - [x] `docs/plans/LIMITATIONS_PLAN.md` created
  - [x] `docs/plans/LIMITATIONS_CHECKLIST.md` created
  - [x] confirmed plan paths are outside package `files` whitelists

**Evidence:** Commit `6f19249` preserved the untracked files. Branch
`fix/known-limitations` created and clean. `pnpm install --frozen-lockfile`
passed. `pnpm turbo run build lint typecheck test` passed: 19/19 tasks; core
138 tests, mongo-storage 187 tests, smtp 65 tests; express has no tests.
`pnpm format:check` failed with `Cannot find package
'prettier-plugin-tailwindcss'`.

## Phase 1: Hygiene and safety

- [x] L-10 Repair root scripts and Prettier plugin
  - [x] tests written (not applicable; script verification)
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** `pnpm --filter demo add -D tsx` installed `tsx@4.23.15`;
`pnpm add -D -w prettier-plugin-tailwindcss` installed `^0.8.1`.
`pnpm --filter demo exec tsx --version` → `tsx v4.23.15`. Added
`build: tsdown` and `start: node dist/index.mjs` to `apps/demo/package.json`;
`pnpm --filter demo build` passed. `pnpm format:check` now runs and reports
136 pre-existing unformatted files (exit 1). Root `pnpm start` started the
tester on port 5173 and the demo start script; the demo exited with the
expected missing-env error because its dotenv path is still wrong (L-11).
README and CONTRIBUTING updated for the new script behavior and the
formatting caveat.

- [x] L-11 Remove demo credential and add environment/scripts
  - [x] tests written (not applicable; build/start verification)
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** Replaced the hardcoded SMTP block in `apps/demo/src/index.ts`
with required environment reads, fixed the dotenv path to `.env.local`, and
added fail-fast errors that name the missing variable. Added
`apps/demo/.env.example` (placeholders only) and `apps/demo/README.md`.
`git check-ignore` confirms `.env.local` is ignored and `.env.example` is not.
A literal search for the old credential/host/user patterns found no matches.
`pnpm --filter demo build` passed. `pnpm --filter demo start` and
`pnpm --filter demo exec tsx src/index.ts` both failed fast with
`Missing required environment variable: SMTP_HOST`, which is the expected
result without a complete local `.env.local`. Root README and CONTRIBUTING
updated.

- [x] L-12 Correct Node 20 claims in package READMEs
  - [x] tests written (not applicable; docs-only)
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** Replaced Node 20 claims with `>=22` in
`packages/express/README.md` (badge and requirements), `packages/smtp/README.md`
(header, build table, target statement), `packages/core/README.md`, and
`packages/mongo-storage/README.md`. Verified every public package manifest
declares `engines.node: ">=22"`. Removed the obsolete root README limitation.
A repository-wide Markdown search finds no stale Node 20 claims outside the
historical plan evidence.

## Phase 2: Test foundation

- [x] L-01 Add `@cred-kit/express` test suite
  - [x] tests written
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** Added `vitest@5.1.0`, `supertest@7.3.2`, and
`@types/supertest@7.2.1` as devDependencies, `test: vitest run` and
`test:watch: vitest` scripts, and `vitest.config.ts`. Added
`src/__tests__/fakes.ts` (in-memory core adapter fakes),
`src/__tests__/helpers.ts` (`createTestApp`, `registerVerifiedUser`),
`src/__tests__/auth.test.ts` (12 tests), and `src/__tests__/router.test.ts`
(10 tests). `pnpm --filter @cred-kit/express test` passes: **22 tests across
2 files**. `build`, `lint`, and `typecheck` pass. `pnpm turbo run build lint
typecheck test` passes 21/21 tasks. The package `files` whitelist remains
`dist`, `README.md`, `LICENSE`, and the build emits only the two dist files,
so tests are not published. Express README, root README, and CONTRIBUTING
updated with the new suite and script.

## Phase 3: Express and adapter features

- [x] L-07 Make smtp link prefix configurable
  - [x] tests written
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** Added `authPathPrefix` to `emailAdapterOptions` and
`emailServiceOptions`, defaulting to `/api/auth` via
`DEFAULT_AUTH_PATH_PREFIX`. Links are now
`${BACKEND_URL}${authPathPrefix}/verify-email/...` and
`${BACKEND_URL}${authPathPrefix}/reset-password/...`. Invalid prefixes (empty,
whitespace, missing leading slash, trailing slash, root slash, query, fragment,
inner whitespace) throw a clear `@cred-kit/smtp:` error. `pnpm --filter
@cred-kit/smtp test` passes: **75 tests across 5 files** (10 new). Build, lint,
and typecheck pass; full Turborepo run passes 21/21. The smtp README, express
README, root README, and CONTRIBUTING were updated with the option, the
`basePath`/`authPathPrefix` independence rule, and the new counts.

- [x] L-08 Make `oauth_state` follow resolved cookie security
  - [x] tests written
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** Removed the two hardcoded `secure: true` overrides in
`setOAuthStateCookie` and `clearOAuthStateCookie`; both now inherit
`config.cookies.secure` from `commonOptions`. Added four characterization
tests: the start cookie omits `Secure` outside production, includes it when
`cookies.secure: true`, and the clear cookie follows the same rule. `pnpm
--filter @cred-kit/express test` passes: **25 tests across 2 files**. Full
Turborepo run passes 21/21. Root and express READMEs now state that the state
cookie follows the resolved cookie security and remove the "OAuth requires
HTTPS or localhost" limitation.

- [x] L-05 Export auth guard and `req.user` typing
  - [x] tests written
  - [x] implementation
  - [x] verification passed
  - [x] docs updated

**Evidence:** Added and exported `createAuthGuard({ jwtSecret, cookieName? })`
plus `CredAuthGuardOptions`. It validates the secret with core's
`assertJwtSecret` and a non-empty cookie name, then reuses the router's auth
middleware, which now sets both `req.user` and `res.locals.credUser`. Added a
global `Express.Request.user?: JWTPayload` augmentation in `types.ts` and made
`readCookie` parse the raw `Cookie` header when `cookie-parser` is not
mounted. Added `guard.test.ts` with 9 tests: valid token with and without
`cookie-parser`, missing cookie, malformed token, refresh-type token, expired
token, custom cookie name, and creation-time validation. `pnpm --filter
@cred-kit/express test` passes: **34 tests across 3 files**; lint, typecheck,
build, and full Turborepo run (21/21) pass. `dist/index.d.mts` contains the
`createAuthGuard` export and `Express.Request` augmentation. A temporary
consumer compiled against `dist` with `req.user?.id` and `req.user?.tokenType`
and was deleted. Express and root READMEs document the guard and remove the
old limitations.

- [ ] L-04 Add configurable rate-limit store factory
  - [ ] tests written
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-02 Add health route and align tester
  - [ ] tests written
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

## Phase 4: Decision-gated and documentation-only items

- [ ] L-03 Document CORS, helmet, and proxy responsibilities
  - [ ] tests written (not applicable; docs-only)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-06 Document ESM-only packaging
  - [ ] tests written (not applicable; docs-only)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-09 Document OAuth account-linking behavior
  - [ ] tests written (not applicable; docs-only)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-13 Keep pre-1.0 statements accurate
  - [ ] tests written (not applicable; docs-only)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

## Phase 5: Documentation, changesets, and final verification

- [ ] Phase 5 Update all affected documentation
  - [ ] root README
  - [ ] express README
  - [ ] smtp README
  - [ ] core and mongo-storage READMEs audited
  - [ ] CONTRIBUTING and API.md audited
  - [ ] cred-testing docs updated
  - [ ] AGENTS.md factual sections updated
  - [ ] examples compile-checked in a temporary directory

- [ ] Phase 5 Add and verify changesets
  - [ ] `@cred-kit/express` minor changeset
  - [ ] `@cred-kit/smtp` minor changeset
  - [ ] `pnpm exec changeset status` passes

- [ ] Phase 5 Full verification and consumer check
  - [ ] `pnpm install --frozen-lockfile`
  - [ ] `pnpm turbo run build lint typecheck test --force`
  - [ ] pack dry-run contents checked
  - [ ] root scripts checked
  - [ ] temporary consumer check passed
  - [ ] final report written

## Drift log

- `AGENTS.md` describes a different codebase: `apps/api`, 122 Jest tests, and
  “not a git repo”. The current checkout is a pnpm/Turborepo monorepo with
  Vitest and git. Recorded for the Phase 5 documentation pass; not a
  limitation task.
- `API.md` is partly historical (standalone API reference). Only verified
  express-adapter statements will be touched.
- `apps/demo/src/index.ts:13` uses `&&` instead of `||` for required env
  validation, and `:4` loads `../.env.local` instead of the app-local file.
  Included in L-11 because they prevent the demo from failing fast/running.
- `apps/cred-testing/lib/api/health.ts:3-20` and
  `components/health-check.tsx:40-73` expect process/database internals that
  the new health route will deliberately not expose. Included in L-02.
- Root README `:459` documents `oauth_state` as always `secure: true`; this
  becomes inaccurate after L-08 and is updated in Phase 5.

## Progress log

- 2026-11-22: Phase 0 complete. Untracked files committed as `6f19249`;
  branch `fix/known-limitations` created; baseline recorded; both tracking
  files created.
- 2026-11-22: L-10 complete. Declared `tsx` for the demo, added demo
  `build`/`start` scripts, installed the root Tailwind Prettier plugin,
  verified `format:check` runs (136 pre-existing files flagged), and verified
  root `start` launches the tester and the demo start script.
- 2026-11-22: L-11 complete. Removed the demo SMTP credential from source,
  added `.env.example` and a demo README, corrected the dotenv path, and
  verified fail-fast missing-variable errors. Build passed; a full start
  requires a complete local `.env.local` with MongoDB and SMTP values.
- 2026-11-22: L-12 complete. Corrected Node 20 claims to `>=22` across the
  express, smtp, core, and mongo-storage READMEs and removed the root README
  limitation. All package manifests declare `engines.node: ">=22"`.
- 2026-11-24: L-01 complete. Added the express Vitest/Supertest suite:
  22 tests across 2 files with in-memory adapter fakes. Build, lint,
  typecheck, and the full Turborepo run (21/21 tasks) pass.
- 2026-11-24: L-07 complete. Added the backward-compatible smtp
  `authPathPrefix` option (default `/api/auth`) with validation, used it for
  both email links, and documented the independent `basePath` pairing. Smtp
  suite: 75 tests across 5 files; full Turborepo run 21/21.
- 2026-11-24: L-08 complete. The `oauth_state` cookie now follows the
  resolved `cookies.secure` setting for both set and clear. Express suite:
  25 tests across 2 files; full Turborepo run 21/21.
- 2026-11-24: L-05 complete. Exported `createAuthGuard`, augmented
  `Express.Request.user`, and made cookie reading work without
  `cookie-parser`. Express suite: 34 tests across 3 files; full Turborepo run
  21/21; a temporary dist consumer compiled.
