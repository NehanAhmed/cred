# Contributing to cred-kit

## Contents

- [Welcome and scope](#welcome-and-scope)
- [Code of conduct and security](#code-of-conduct-and-security)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Getting set up](#getting-set-up)
- [Everyday commands](#everyday-commands)
- [Making a change](#making-a-change)
- [Changesets and releases](#changesets-and-releases)
- [Testing expectations](#testing-expectations)
- [Writing a new adapter](#writing-a-new-adapter)
- [Code style](#code-style)
- [Documentation changes](#documentation-changes)
- [Reporting bugs and proposing features](#reporting-bugs-and-proposing-features)
- [Pull request checklist](#pull-request-checklist)
- [License](#license)

## Welcome and scope

cred-kit is an adapter-based authentication library for Node.js. The repository contains the
framework-agnostic core, an Express 5 transport adapter, MongoDB storage adapters, and SMTP/Resend
email adapters. See [README.md](./README.md) for the current package overview.

The published packages are pre-1.0 at version `0.1.0`. Public APIs may change between minor
versions. Contributions are welcome in these areas:

- Bug fixes and regression tests.
- Test coverage, including the missing `@cred-kit/express` suite.
- Documentation and examples.
- New database, email, or framework adapters.

## Code of conduct and security

Participation is covered by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

Do not report security vulnerabilities in public issues. Follow [SECURITY.md](./SECURITY.md),
which uses GitHub private vulnerability reporting.

## Repository layout

Workspace members are declared in `pnpm-workspace.yaml` as `apps/*` and `packages/*`.

| Path                     | Package                   | Published | Purpose                                                                              |
| ------------------------ | ------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `packages/core`          | `@cred-kit/core`          | npm       | Authentication services, adapter interfaces, errors, validators, and email templates |
| `packages/express`       | `@cred-kit/express`       | npm       | Express 5 router that mounts the auth, profile, and audit endpoints                  |
| `packages/mongo-storage` | `@cred-kit/mongo-storage` | npm       | Mongoose models and user, refresh-token, and audit-log adapters                      |
| `packages/smtp`          | `@cred-kit/smtp`          | npm       | SMTP (Nodemailer) and Resend email adapters                                          |
| `packages/shared`        | `@cred-kit/shared`        | private   | Compatibility re-export shim; no package imports it                                  |
| `packages/config`        | `@cred-kit/config`        | private   | Shared TypeScript configuration files only                                           |
| `apps/cred-testing`      | `cred-testing`            | private   | Next.js manual API tester                                                            |
| `apps/demo`              | `demo`                    | private   | Scratch Express host example; it has no build or start script                        |

Layering rules as implemented today:

- `@cred-kit/core` imports no adapter library. Its `eslint.config.js` rejects `express`, `mongoose`,
  `nodemailer`, `passport`, `express-rate-limit`, `helmet`, `cors`, and `cookie-parser`.
- `@cred-kit/mongo-storage` and `@cred-kit/smtp` import core's public API (types, errors, and the
  email templates). They do not import each other.
- `@cred-kit/express` is the composition layer. It imports core and constructs
  `@cred-kit/mongo-storage` and `@cred-kit/smtp` when the host passes `database` and `email`
  options. Its `eslint.config.js` rejects direct imports of `mongoose`, `nodemailer`,
  `jsonwebtoken`, `bcryptjs`, `passport`, `helmet`, `cors`, and similar libraries.
- Core never reads `process.env`. The only environment variable read anywhere in the packages is
  `NODE_ENV`, used by `@cred-kit/express` to default `cookies.secure`.

## Prerequisites

| Requirement | Version                | Source                                                                                   |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Node.js     | 22 or newer            | Root `engines.node` and every published package's `engines.node`; CI runs Node 22 and 24 |
| pnpm        | 10.33.2                | Root `packageManager` field                                                              |
| MongoDB     | Not required for tests | `@cred-kit/mongo-storage` uses `mongodb-memory-server`                                   |

`mongodb-memory-server` downloads a MongoDB binary on the first database-backed test run. On
Windows this checkout cached MongoDB `8.2.6` at
`%USERPROFILE%\.cache\mongodb-binaries` (about 74 MB). CI pins `MONGOMS_VERSION=8.2.6` and caches
the download under `.mongodb-binaries`. The mongo-storage Vitest config allows 120 seconds for
hooks, so a slow first download can delay the first run.

The repository has no `.nvmrc`; use the `engines.node` value above.

## Getting set up

Fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/NehanAhmed/cred-kit.git
cd cred-kit
pnpm install --frozen-lockfile
pnpm build
```

These commands were verified on Windows with Node `24.21.0` and pnpm `10.33.2`.

`pnpm install` may print a warning that pnpm ignored build scripts for `esbuild` and
`mongodb-memory-server`. The install and the test suite still complete.

## Everyday commands

Run these from the repository root:

| Task                                            | Command                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| Build all packages                              | `pnpm build`                                                                     |
| Lint all packages with a lint script            | `pnpm lint`                                                                      |
| Type-check all packages with a typecheck script | `pnpm typecheck`                                                                 |
| Run all tests                                   | `pnpm test`                                                                      |
| Run all checks through Turborepo                | `pnpm turbo run build lint typecheck test`                                       |
| Run one package's tests                         | `pnpm --filter @cred-kit/core test`                                              |
| Run one test file                               | `pnpm --filter @cred-kit/core exec vitest run src/services/auth.service.test.ts` |
| Check formatting of one file                    | `pnpm exec prettier --check <file>`                                              |
| Format one file                                 | `pnpm exec prettier --write <file>`                                              |

Package filters also work for the other scripts, for example:

```bash
pnpm --filter @cred-kit/mongo-storage test
pnpm --filter @cred-kit/smtp test
pnpm --filter @cred-kit/express build
pnpm --filter @cred-kit/express lint
pnpm --filter @cred-kit/express typecheck
```

Test runners:

| Workspace member          | Runner                                            | Files | Tests |
| ------------------------- | ------------------------------------------------- | ----: | ----: |
| `@cred-kit/core`          | Vitest with in-memory fakes                       |     7 |   138 |
| `@cred-kit/mongo-storage` | Vitest with `mongodb-memory-server`               |     9 |   187 |
| `@cred-kit/smtp`          | Vitest                                            |     5 |    77 |
| `@cred-kit/express`       | Vitest with Supertest and in-memory adapter fakes |     5 |    46 |

The counts above are from the verified run described in the pull request checklist.

Formatting caveat: `pnpm format:check` now loads `prettier-plugin-tailwindcss` correctly, but it
still reports 136 pre-existing unformatted files. It is not a clean gate. Format only the files
you change, with the per-file command above. Do not reformat unrelated files.

`pnpm dev` starts the demo API and the tester in watch mode. `pnpm start` runs their built start
scripts, so run `pnpm build` first. The demo is a scratch example; copy `apps/demo/.env.example` to
`apps/demo/.env.local` before starting it (see `apps/demo/README.md`).

## Making a change

Branch names in the history use prefixes such as `feature/`, `fix/`, `chore/`, `refactor/`,
`tests/`, and `docs/`. A name like `fix/refresh-token-replay` fits that pattern. This is a
convention, not an enforced rule.

Commit messages are mixed. Recent commits use Conventional Commit prefixes (`fix:`, `feat:`,
`chore:`, `docs:`, `refactor:`, `test:`), while older commits are free-form. There is no commitlint
or Husky configuration in the repository. Using a Conventional Commit prefix is a recommendation,
not a requirement.

Open pull requests against `main`. The CI workflow runs on every pull request and can also be
called by the release workflow. It runs `build`, `lint`, `typecheck`, and `test` on this matrix:

- Ubuntu `ubuntu-latest` and `ubuntu-22.04`.
- Windows `windows-latest` and `windows-2022`.
- Node 22 and 24.

On a pull request, CI runs the four tasks with `--affected` against the pull request base. On a
called workflow it runs them for the whole workspace. A separate `package-check` job builds the
packages and runs `pnpm pack --dry-run` for `./packages/*`. The `CI gate` job fails if `verify` or
`package-check` failed or was cancelled. See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Changesets and releases

The repository uses Changesets. Configuration lives in
[`.changeset/config.json`](./.changeset/config.json): `baseBranch` is `main`, access is `public`,
and the private packages `cred-testing`, `demo`, `@cred-kit/shared`, and `@cred-kit/config` are
ignored.

Add a changeset when a change affects a published package's behavior, public API, or runtime
dependencies. Do not add one for documentation, tests, CI, or changes limited to the private
apps and packages.

```bash
pnpm changeset
```

Choose the packages and bump type, then commit the generated file under `.changeset/`. On `0.x`,
Changesets uses normal semver: patch moves `0.1.0` to `0.1.1`, minor moves it to `0.2.0`, and
major moves it to `1.0.0`. The repository has no documented bump policy beyond the single existing
changeset, which is a patch. Recommendation: patch for fixes, minor for new behavior or API
changes, and major only for a deliberate 1.0 release.

Contributors do not publish. Releases run from `.github/workflows/release.yml` on a push to
`main`:

1. The workflow calls the CI workflow.
2. `changesets/action` opens or updates a `chore: version packages` pull request.
3. Merging that pull request runs `pnpm release`, which builds `./packages/*` and runs
   `changeset publish`.

Publishing uses the `npm-publish` environment and npm trusted publishing (OIDC), with
`NPM_CONFIG_PROVENANCE=true`. Maintainers own that process.

## Testing expectations

- New behavior needs tests. Bug fixes should include a regression test.
- Core tests assert on `AuthError.code` and `statusCode`, not on message text. Error messages are
  not a stable contract.
- Core tests use the in-memory fakes in
  [`packages/core/src/__tests__/fakes.ts`](./packages/core/src/__tests__/fakes.ts). Fakes must
  behave like the real adapters: support the `$gt`, `$gte`, `$lt`, `$lte`, and `$ne` filter
  operators, return `null` for a no-match, and throw `DuplicateKeyError` for uniqueness violations.
- Storage adapter changes need tests against a real MongoDB instance. The mongo-storage suite uses
  `mongodb-memory-server`, runs test files serially, and covers indexes, TTLs, and atomic updates.
- Email adapter changes need tests for the transport behavior. The smtp suite uses injected
  `fetch` and transport fakes.
- There is no shared adapter contract test suite in this repository. If you add an adapter, mirror
  the existing adapter tests instead of looking for a reusable contract suite.
- `@cred-kit/express` has a full Vitest/Supertest suite covering the router, auth guard, rate
  limits, and error mapping. The suite mounts the real router on an Express app with in-memory
  core adapter fakes, so no MongoDB or SMTP connection is required. New behaviour belongs in
  those tests; see the package's `src/__tests__/` directory.

## Writing a new adapter

Adapter interfaces live in
[`packages/core/src/types/deps.types.ts`](./packages/core/src/types/deps.types.ts) and are
re-exported from `@cred-kit/core`:

- `UserDatabaseAdapter` for users.
- `RefreshTokenDatabaseAdapter` for refresh tokens.
- `AuditDatabaseAdapter` for audit logs (optional).
- `EmailAdapter` for verification and password-reset messages.

Use the existing implementations as the reference:
`packages/mongo-storage/src/adapters/*.adapter.ts` and `packages/smtp/src/helpers/email.helper.ts`.

Requirements:

- **Atomic operations.** `UserDatabaseAdapter.findOneAndUpdate` and
  `RefreshTokenDatabaseAdapter.findOneAndUpdate` must be atomic compare-and-set operations. They
  are used to consume verification and reset tokens and to claim refresh tokens during rotation.
  Return the updated record, or `null` when nothing matches. A no-match must not throw.
  `incrementLoginAttempts` must increment atomically and return the new count.
- **Bounded deletes.** `RefreshTokenDatabaseAdapter.deleteMany` is used with `{ family, user }` and
  `{ user }`. The Mongoose adapter rejects an empty filter so a bug cannot delete every token.
- **Id mapping.** Core exposes `User.id` as a string. Map your native identifier to a string and
  do not expose driver internals such as `_id` or `__v`. `RefreshToken.user` must be a string that
  matches `User.id`, and `AuditLogInterface.user` is a string or `null`. Core's `RefreshToken`
  type has no `id` field; the Mongoose adapter identifies a record by `lookupId` and the stored
  token hash. If you implement `update(id, ...)`, define a stable record id for it.
- **Error translation.** Catch native duplicate-key errors and throw `DuplicateKeyError` from
  `@cred-kit/core` (optionally with the conflicting field). Core maps that error to the
  `DUPLICATE_KEY` code. Do not let driver-specific error codes escape into core.
- **Exports and packaging.** Export a factory from the package root, following
  `mongooseStorage` and `emailService`. Publish ESM (`dist/index.mjs` plus `dist/index.d.mts`),
  list `dist` and `README.md` in `files`, and set `publishConfig.access` to `public`.
- **Peer dependencies.** Declare `@cred-kit/core` as a peer dependency and keep the driver or
  transport library as a peer when the host should own its copy. The Mongoose adapter peers on
  `mongoose`; the SMTP adapter peers on `nodemailer`. Do not depend on another adapter package.
- **Tests.** There is no shared contract suite. Add Vitest tests that cover the adapter contract,
  including no-match behavior, atomic updates, and duplicate-key translation. For a database
  adapter, use `mongodb-memory-server` the way `@cred-kit/mongo-storage` does.
- **Naming.** Published packages use the `@cred-kit` scope. Existing names are
  `@cred-kit/mongo-storage` for a database adapter and `@cred-kit/smtp` for an email adapter.
  Follow the same lowercase, hyphenated pattern for a new adapter.

A new adapter package belongs under `packages/`; `pnpm-workspace.yaml` already includes
`packages/*`. Give it `build`, `lint`, `typecheck`, and `test` scripts so the root Turborepo tasks
and CI pick it up.

## Code style

- Prettier settings are in [`.prettierrc`](./.prettierrc): semicolons, single quotes, no trailing
  commas, 100-column print width, two-space indentation, and parentheses around arrow parameters.
- [`.editorconfig`](./.editorconfig) sets UTF-8, LF line endings, two-space indentation, and a
  final newline. `.gitattributes` stores LF on every platform.
- Each package has its own `eslint.config.js` using `typescript-eslint` recommended rules and
  `no-restricted-imports` to enforce the layering rules.
- TypeScript is strict. Packages target ES2022 and use `NodeNext` module resolution. Relative
  imports in NodeNext packages end in `.js`, including from `.ts` files.
- Packages are ESM-only. Do not add a CommonJS build.
- Avoid `any` where a real type exists. The Mongoose adapter uses `Model<any>` intentionally
  because the host owns the schema, and its ESLint config disables that rule.

## Documentation changes

- The root [README.md](./README.md) is the current overview and API summary.
- `API.md` is an older standalone-API reference and does not describe the current adapter-based
  packages. Treat the README and package READMEs as authoritative.
- `AGENTS.md` contains repository notes for agents and is partly stale. Confirm behavior in the
  code and tests.
- Design notes live in `specs/`. The only design note in this checkout is
  `specs/01-express-adapter.md`.
- Each published package lists `README.md` in its `files` field, so its package README is included
  in the npm tarball. Update it when you change that package's public behavior.
- Do not hand-edit `CHANGELOG.md` files. Changesets generates them during the version PR.

## Reporting bugs and proposing features

- Report bugs by opening an issue with the bug report template:
  <https://github.com/NehanAhmed/cred-kit/issues/new?template=bug_report.yml>. Include the package,
  version, Node version, OS, adapters in use, reproduction steps, expected and actual behavior, and
  logs.
- Propose features by opening an issue with the feature request template:
  <https://github.com/NehanAhmed/cred-kit/issues/new?template=feature_request.yml>.
- Security vulnerabilities go through [SECURITY.md](./SECURITY.md), never a public issue.
- For usage questions and other support, see [SUPPORT.md](./SUPPORT.md).

Discuss large changes in an issue before starting. This is especially important for a new adapter,
a public API change, or anything that changes the layering rules.

## Pull request checklist

The same checklist appears in
[`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md):

- [ ] The change is focused and the pull request describes what changed and why.
- [ ] A linked issue is included when one exists.
- [ ] Tests were added or updated for new or changed behavior.
- [ ] `pnpm turbo run build lint typecheck test` passes locally.
- [ ] A changeset was added if a published package's behavior, API, or runtime dependencies changed.
- [ ] Documentation was updated when behavior or configuration changed.
- [ ] The layering rules above are respected.

## License

cred-kit is licensed under the MIT License. See [LICENSE](./LICENSE). By contributing, you agree that
your contributions are licensed under the same terms. There is no CLA or DCO requirement.
