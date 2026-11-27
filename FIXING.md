# TASK: Resolve the known limitations of the cred-kit monorepo, in planned phases, with a tracked checklist

## 1. Objective

Fix, or deliberately document, the known limitations listed in Section 4. You must work from a written plan and a checklist file, and you must update the checklist as you go. The plan and checklist exist to stop you from drifting: they define exactly what is in scope, in what order, and what "done" means for each task.

The repository is a pnpm + Turborepo TypeScript monorepo published under the `@cred-kit` npm scope. Treat it as a live, published, pre-1.0 project: other people may have installed these packages.

## 2. Hard rules

### Scope control (prevents drift)
- Work only on the tasks in Section 4. If you find another problem, do not fix it. Record it in the "Drift log" section of the checklist file and continue.
- Work on **one task at a time**. Before starting each task, re-read the checklist file and the task's entry in the plan. After finishing it, update the checklist before starting the next.
- Do not refactor, rename, reformat, or "clean up" code that is not required by the current task. Do not run the repo-wide formatter. Do not change dependency versions unless a task requires adding or removing a specific dependency.
- Do not edit `.github/workflows/*` unless a task explicitly requires it (none currently do). New `test` scripts are picked up by the existing turbo tasks automatically.
- Do not publish, push, tag, or create releases. Do not bump package versions by hand. Versioning happens through Changesets (see Phase 5).
- Do not rewrite git history.

### Backward compatibility
- Published packages are on npm. Every change to `@cred-kit/*` source must be **additive and backward compatible** by default: new options get defaults that preserve current behavior, existing exports keep their names and signatures. If a task cannot be done compatibly, stop at its decision gate (Section 3) instead of breaking the API.

### Truthfulness
- Every claim you write in code comments, docs, the plan, or the checklist must be verified by reading the code or running a command. Do not state a behavior, default, or version requirement you did not verify.
- A checklist item may be ticked only after its verification commands were run and passed. Record the evidence next to the tick (command and result, for example "express: 14 tests passed").
- Treat the limitation list in Section 4 as leads, not facts. Confirm each one in the code before acting. If one turns out to be wrong or already fixed, mark it so in the checklist with evidence instead of "fixing" it.

### Secrets
- A hardcoded SMTP credential exists in `apps/demo` source (task L-11). Never print its value in any output, plan, checklist, commit message, or log. Refer to it only by file and line.

## 3. Decision gates

Some items are design decisions, not bugs. For these, the default action is **document only**. Do not change behavior unless the owner has approved it in writing in the plan file's "Owner decisions" section before you start the task. If approval is absent, mark the checklist item `[!]` (blocked: needs owner decision), do the documentation part, and move on.

Decision-gated tasks: L-03, L-06, L-09.

## 4. Task list (the only work in scope)

Classification key: FIX = change code; FIX+DOC = change code then update docs; DOC = documentation only by default; GATE = decision gate applies.

| ID | Limitation | Class | Notes |
|---|---|---|---|
| L-01 | `@cred-kit/express` has no `test` script and no test files | FIX | Add a test suite for the router. Must be done before changing express behavior. |
| L-02 | No health endpoint in `@cred-kit/express`; `apps/cred-testing` health panel calls `/api/health` and gets 404 | FIX+DOC | Add an opt-in or default health route, and make the tester app consistent. |
| L-03 | No CORS, helmet, or proxy configuration | DOC, GATE | Host responsibility by design. Default: document, with a verified example. Do not add these as dependencies. |
| L-04 | Rate-limit counters are in-memory only; no custom store | FIX+DOC | Add a configurable store option, default unchanged. |
| L-05 | No exported auth guard; no `req.user` type augmentation | FIX+DOC | Export a guard for host routes and augment the Express `Request` type. |
| L-06 | ESM-only builds (`dist/index.mjs`, no `require` condition) | DOC, GATE | Default: document. Do not add a CJS build without approval. |
| L-07 | `basePath` must match the mount path; `@cred-kit/smtp` hardcodes `/api/auth/...` in email links | FIX+DOC | Make the smtp link prefix configurable with a default that preserves current links. |
| L-08 | `oauth_state` cookie is always `secure: true`, so OAuth fails over plain HTTP on non-localhost origins | FIX+DOC | Make `secure` follow the resolved config for the rest of the cookies. Production default must remain secure. |
| L-09 | Linking a local account through OAuth changes `provider`, which disables password login and password change | DOC, GATE | Security and behavior decision. Default: document. Do not change core behavior without approval. |
| L-10 | Root scripts: `pnpm dev` fails (`apps/demo` uses `tsx` without declaring it); `pnpm start` starts only the Next.js tester; `pnpm format` and `format:check` fail because the Prettier config references a missing `prettier-plugin-tailwindcss` | FIX+DOC | Choose the smallest correct fix for each and record the rationale in the plan. |
| L-11 | `apps/demo` is a scratch example: no build or start script, hardcoded example SMTP credential | FIX | Remove the credential from source (read it from environment variables with a documented `.env.example`), add working scripts. Tell the owner in the final report to rotate the credential if it was ever real, and that it remains in git history. |
| L-12 | Package READMEs advertise Node 20 while manifests and CI require Node >= 22 | FIX | Docs only. Treat `engines` in package.json and the CI matrix as authoritative. |
| L-13 | Pre-1.0: APIs may change between minor versions | NONE | Keep this statement accurate in docs. No action beyond that. |

## 5. Phases

Execute in this order. Do not start a phase until every task in the previous phase is `[x]`, `[!]`, or `[-]` (skipped with a reason).

**Phase 0: Discovery and planning (no code changes)**
1. Create a branch: `fix/known-limitations`. Confirm `git status --short` is empty before starting.
2. Read: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.github/workflows/*`, `.changeset/config.json`, `AGENTS.md` and `CONTRIBUTING.md` if present, every file in `packages/express`, `packages/smtp`, `apps/demo`, `apps/cred-testing`, and the public surface of `packages/core` (`src/index.ts`, error types, adapter interfaces).
3. Run the baseline and record exact results in the plan: `pnpm install --frozen-lockfile`, then `pnpm turbo run build lint typecheck test`. Note pre-existing failures so you can tell them apart from regressions you cause.
4. Verify each limitation in Section 4 against the code with `file:line` evidence.
5. Write the two tracking files (Section 6) and stop for nothing else. Phase 0 is complete when both files exist and are accurate.

**Phase 1: Hygiene and safety (L-11, L-10, L-12)**
Small, low-risk fixes first. Remove the hardcoded credential, repair root scripts, correct the Node version in READMEs.

**Phase 2: Test foundation (L-01)**
Add a test runner and a test suite to `@cred-kit/express` that characterizes **current** behavior before you change it: router mounts, route table, validation failures (400 shape), error-to-envelope mapping, cookie attributes on login, CSRF behavior if present, rate-limit 429 responses, protected route returns 401 without a cookie, redirect flows. Use fake adapters (in-memory implementations of the core interfaces) so no database or SMTP is needed. Follow the conventions in Section 7.

**Phase 3: Express and adapter features (L-07, L-08, L-05, L-04, L-02)**
For each task: write failing tests first, implement, make tests pass, then run the whole verification set. Order matters: L-07 and L-08 fix configuration correctness, L-05 and L-04 add public API, L-02 adds a route.

**Phase 4: Decision-gated items and documentation-only items (L-03, L-06, L-09, L-13)**
Apply the Section 3 rule. Write the documentation, including a compile-checked example for L-03 showing how a host app adds CORS, helmet, and `trust proxy` in front of the router.

**Phase 5: Documentation, changesets, and final verification**
See Section 9.

## 6. Tracking files (create in Phase 0, keep updated throughout)

Create `docs/plans/LIMITATIONS_PLAN.md` and `docs/plans/LIMITATIONS_CHECKLIST.md`. These are the only new documentation files you may create besides changesets and the tests and code required by the tasks. Confirm neither path is included in any package's `files` whitelist.

**`LIMITATIONS_PLAN.md` must contain:**
1. Baseline results (commands, pass/fail, test counts, pre-existing failures).
2. For each task L-01 to L-13: verified current behavior with `file:line` evidence, the chosen approach, alternatives you rejected and why, files expected to change, public API impact (additive or not), tests to write, docs to update, acceptance criteria, and verification commands.
3. A section **Owner decisions** listing L-03, L-06, and L-09 with the default (document only) and a blank line for the owner to write "approved: <what>" or "declined".
4. A section **Out of scope** for anything you decide not to do and why.

**`LIMITATIONS_CHECKLIST.md` must contain:**
- A progress summary at the top (tasks done / total).
- One section per phase. One line per task using this exact syntax:
  - `- [ ] L-05 Export auth guard and req.user typing`
  - States: `[ ]` not started, `[~]` in progress (only one at a time), `[x]` done and verified, `[!]` blocked (needs owner decision), `[-]` skipped with reason.
- Under each task line, sub-items: `- [ ] tests written`, `- [ ] implementation`, `- [ ] verification passed`, `- [ ] docs updated`. Tick them as they complete.
- An **Evidence** line under each completed task: the commands run and their results.
- A **Drift log** section for out-of-scope findings (one line each, with `file:line`).
- A **Progress log** section: one dated line each time a task changes state.

Update the checklist **immediately** after each task changes state, not in batches. Before starting any task, re-open the checklist and confirm which task is `[~]`.

## 7. How to write the code (follow the existing structure)

Read the surrounding code before writing any. Match what is already there instead of introducing new patterns.

**Architecture and layering (enforced, do not violate)**
- `@cred-kit/core` imports nothing from adapters, `express`, `mongoose`, or `nodemailer`, and never reads `process.env`. Core changes are not expected in this plan. If a task seems to need one, stop and record it in the Drift log.
- Adapters (`@cred-kit/smtp`, `@cred-kit/mongo-storage`) import only types from `@cred-kit/core`, never import each other, and do not read `process.env`.
- `@cred-kit/express` owns HTTP concerns only: routes, validation wiring, cookies, redirects, rate limiting, and mapping `AuthError` to responses. It calls core functions and never contains auth business logic.
- Packages receive configuration as arguments. Only `apps/*` read environment variables.

**`@cred-kit/express` conventions**
- Controllers are factories that close over resolved config and deps. The router is built from a route table. Configuration passes through the existing config resolution (merge defaults, validate, throw a clear error on invalid input). Add new options there, with a default, validation, and a clear error message, and a test for the error.
- Use the existing response helpers and envelope shapes. Do not invent new response shapes.
- Use the existing error handler path: core throws `AuthError`, the express layer maps it. Unknown errors never leak internals.
- Cookie and rate-limiter creation stays in their existing modules.

**TypeScript and style**
- Strict TypeScript, no `any`, no `@ts-ignore`, no non-null assertions that hide a real possibility of undefined. Use `import type` for type-only imports.
- ESM with `.js` extensions on relative imports, matching existing files.
- Follow the existing naming, file layout, and export style. New public exports go through the package's `src/index.ts`. Do not export internals.
- No `console.log` in library code. No new runtime dependencies unless a task requires one (L-04 should need none beyond what `express-rate-limit` already provides). Any new dependency must be justified in the plan and placed in the right category (`dependencies`, `peerDependencies`, or `devDependencies`).
- Prettier and ESLint config apply. Run lint on what you change. Do not reformat untouched code.

**Tests**
- Vitest for packages (match `@cred-kit/core`'s setup: config file location, `include` pattern, `test` script). Test files live next to source as `*.test.ts` and must not appear in published output.
- Assert on error `code` and status, not on message text, except for HTTP envelope fields that are part of the public contract.
- Use fakes that behave like the real adapters (including rejecting empty filters where the real one does). No real database or SMTP in express tests.
- Every new option and every new route needs tests for its default, its valid use, and its invalid use. Every bug fix gets a test that fails before the fix and passes after.

**Commits**
- One commit per task (or per tightly coupled pair), using the style that `git log` shows most often. Do not push. The commit message names the task ID, for example `fix(express): export auth guard and req.user typing (L-05)`.

## 8. Task-specific guidance

**L-01 tests.** Add `vitest` and a `test` script to `packages/express/package.json`, mirroring core. Add `supertest` or an equivalent only if the repo does not already use something for HTTP-level tests (apps/api uses supertest; reuse it as a devDependency if that matches). Characterization tests first. Run them in the CI-equivalent way: `pnpm --filter @cred-kit/express test`.

**L-02 health.** Add `GET <basePath>/health`-style route consistent with how other routes are mounted. Return the standard success envelope. Do not expose Node version, platform, memory, or environment (information disclosure). Default to a liveness response that needs no database. Offer an optional host-supplied async `check` function in config for readiness, because the storage interface has no ping method and express must not depend on a specific database. A failing check returns 503 with the standard error envelope. Apply a dedicated rate limiter consistent with existing limiter definitions. Update `apps/cred-testing` so its health panel and its health rate-limit entry match the real route and response, changing only what is needed.

**L-04 store.** Add an option to provide a store for the rate limiters. First verify, in the installed `express-rate-limit` version, whether one store instance may be shared by several limiters and what the store interface is; design the option accordingly (a factory called once per limiter is the safe shape if sharing is disallowed). Default must remain the in-memory store. Test that the option is passed through and that the default is unchanged.

**L-05 guard.** Export a guard factory for host routes, built on `verifyAccessToken` from core and the existing access-token cookie, reusing the express package's existing auth middleware logic instead of duplicating it. It must set `req.user` with the verified payload type from core. Add the Express `Request` type augmentation so it ships inside the package's `.d.mts`; confirm by building and inspecting the declaration output and by compiling a consumer example in a temp directory. Decide, with evidence, whether the guard needs cookie parsing itself or can rely on the host's, and document the answer. Unauthenticated requests return the same 401 envelope as the router's protected routes.

**L-07 link prefix.** Inspect how `@cred-kit/smtp` builds verification and reset links. Add an option for the path prefix (or a link-builder) with a default equal to the current hardcoded value, so existing installs produce identical links. Validate the option. Add tests for the default and a custom value. Document in the express and smtp READMEs that `basePath` (express) and the link prefix (smtp) are configured independently and must agree, with a correct and an incorrect example. Do not make smtp import from express.

**L-08 OAuth cookie.** Find how the resolved config decides `secure` for the access and refresh cookies, and make `oauth_state` follow the same decision. Production behavior must stay secure by default. Add tests for secure and non-secure resolution. Document the verified rule precisely.

**L-10 scripts.**
- `pnpm dev`: declare `tsx` as a devDependency of `apps/demo` (the minimal fix), or change the script if a better evidenced option exists. Verify the command runs.
- `pnpm start`: determine what the turbo `start` task runs today. Make the smallest change that makes the root script's behavior honest and useful (for example, give `apps/demo` a working `start` script, or document exactly what `start` runs). Record the rationale.
- Prettier: check whether any app actually uses Tailwind. If yes, add `prettier-plugin-tailwindcss` as a root devDependency. If no, remove the plugin reference from the Prettier config. Verify `pnpm format:check` runs. Do not apply formatting to the repo; report how many files it flags so the owner can decide on a separate formatting-only commit.

**L-11 demo.** Replace the hardcoded credential with environment variables, add a committed `.env.example` with placeholders, make sure `.env` stays ignored, and add working `dev` and `start` scripts. The demo remains a scratch example: state this in a short README or header comment, and add nothing beyond that.

**L-12 Node version.** Replace the Node 20 claims in package READMEs with the version in each package's `engines`. Verify against package.json and `.github/workflows/ci.yml`.

## 9. Final phase: documentation, changesets, verification

1. **Docs.** For every fixed task, update the affected documentation in the same terms the code now supports: package READMEs (`@cred-kit/express`, `@cred-kit/smtp`, others if touched), the root `README.md`, `CONTRIBUTING.md` (if it exists and mentions scripts or limits), and `API.md` only where it describes the express adapter's behavior (it is partly historical, so touch only lines you can verify). Remove limitations that are now fixed. Keep limitations that remain, with accurate wording. Add the new options to each configuration table, new routes to route tables, and new exports to the API sections. Every example you add or change must be compile-checked against the built package in a temp directory, which you delete afterwards.
2. **Changesets.** Add `.changeset/*.md` files, one per affected published package, in the repo's existing changeset format. On 0.x use `minor` for new public API and `patch` for fixes and docs-only changes to a published README. Describe each change factually. Private packages (apps) need no changeset. Verify they pass `pnpm exec changeset status`.
3. **Full verification.** Run on a clean install: `pnpm install --frozen-lockfile`, then `pnpm turbo run build lint typecheck test --force`. Run `pnpm --filter "./packages/*" exec pnpm pack --dry-run` and confirm tarballs contain only the build output, README, and LICENSE, and no tests or plan files. Run the root scripts you changed (`pnpm dev` briefly, then stop it; `pnpm format:check`).
4. **Consumer check.** In a temp directory outside the repo, install the packed tarballs and confirm: the router mounts, the guard protects a host route and types `req.user`, the health route responds, and the smtp links use the configured prefix.
5. Confirm every checklist item is `[x]`, `[!]`, or `[-]` with evidence, and update the progress summary.

## 10. Stop-and-ask conditions

Stop work and report instead of guessing if: a task requires changing `@cred-kit/core` or breaking a public API; the baseline has failures that block verifying a task; a verification command cannot be run; two tasks conflict; or you discover a security issue beyond the listed scope (record it, do not fix it).

## 11. Final report

1. Checklist summary: counts by state, and the list of `[!]` and `[-]` items with reasons.
2. Per task: what changed (files), public API impact, tests added, docs updated.
3. Verification log: every command run and its result, including pre-existing failures that remain.
4. Owner actions required: decisions for L-03, L-06, L-09; rotate the SMTP credential that was hardcoded in `apps/demo` and note that it persists in git history; whether to do a formatting-only commit and how many files `format:check` flags; review and merge the changesets through the normal release flow.
5. The Drift log contents.
6. Anything you could not verify.

Begin with Phase 0. Create the branch, read the repository, run the baseline, and write both tracking files before touching any source.

After fixing all the fixes. Update all the docs like readme and other docs.