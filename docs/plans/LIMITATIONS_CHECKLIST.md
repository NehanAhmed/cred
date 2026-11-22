# Known Limitations Checklist

Progress: **0 / 13 tasks complete** (0 done, 0 in progress, 0 blocked, 0 skipped).
Phase 0 complete. Phase 1 starts with L-10.

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

- [ ] L-10 Repair root scripts and Prettier plugin
  - [ ] tests written (not applicable; script verification)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-11 Remove demo credential and add environment/scripts
  - [ ] tests written (not applicable; build/start verification)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-12 Correct Node 20 claims in package READMEs
  - [ ] tests written (not applicable; docs-only)
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

## Phase 2: Test foundation

- [ ] L-01 Add `@cred-kit/express` test suite
  - [ ] tests written
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

## Phase 3: Express and adapter features

- [ ] L-07 Make smtp link prefix configurable
  - [ ] tests written
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-08 Make `oauth_state` follow resolved cookie security
  - [ ] tests written
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

- [ ] L-05 Export auth guard and `req.user` typing
  - [ ] tests written
  - [ ] implementation
  - [ ] verification passed
  - [ ] docs updated

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
