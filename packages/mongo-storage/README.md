# @cred/mongo-storage

MongoDB/Mongoose implementation of the storage contracts defined by
[`@cred/core`](../core). It provides three adapters — users, refresh tokens, and
audit logs — that implement those contracts against MongoDB.

- **ESM-only**, typed, and built with `tsdown`.
- **Zero runtime dependencies of its own**: `@cred/core` and `mongoose` are peer
  dependencies supplied by the host application.
- Models are registered on a connection, not globally, so multiple connections
  (application, tests, workers) can coexist in one process.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [API](#api)
  - [`mongooseStorage(options)`](#mongoosestorageoptions)
  - [`MongooseStorage`](#mongoosestorage)
- [Adapters](#adapters)
  - [`storage.user`](#storageuser)
  - [`storage.refreshToken`](#storagerefreshtoken)
  - [`storage.auditLogs`](#storageauditlogs)
- [Data model](#data-model)
- [Behavior and guarantees](#behavior-and-guarantees)
- [Caveats and edge cases](#caveats-and-edge-cases)
- [Error reference](#error-reference)
- [TypeScript and module format](#typescript-and-module-format)
- [Project structure](#project-structure)
- [Development](#development)
- [Design boundaries](#design-boundaries)
- [License](#license)

## Requirements

| Requirement | Version / note |
|---|---|
| Node.js | `>=20.0.0` (declared in `engines`) |
| Mongoose | `^9.7.0` (peer dependency) |
| `@cred/core` | Workspace peer dependency; required at runtime |
| Module system | ESM only — there is no CommonJS build |

`@cred/core` is a peer dependency, not a bundled dependency. The adapters import
runtime values from it (`DuplicateKeyError` for error translation and
`AUDIT_ACTIONS` for the audit-log schema enum), so it must be installed by the
host application. `mongoose` is a peer so the host supplies a single copy; two
copies of Mongoose in one process break `instanceof` checks and plugin behavior.

## Installation

```bash
pnpm add @cred/mongo-storage @cred/core mongoose
```

```bash
npm install @cred/mongo-storage @cred/core mongoose
```

## Quick start

### Option A — the adapter owns the connection

Pass a MongoDB connection string. The adapter creates and owns the connection.

```ts
import { mongooseStorage } from '@cred/mongo-storage';

const storage = mongooseStorage({ uri: process.env.MONGO_URI! });

// Wait until the connection is established before serving traffic.
await storage.ready();

// Use storage.user, storage.refreshToken, and storage.auditLogs wherever
// @cred/core expects its storage adapters.

// On shutdown, close the connection created by the adapter.
await storage.close();
```

### Option B — reuse an existing connection

Pass an existing Mongoose `Connection`. The adapter registers its models on that
connection and never closes it.

```ts
import mongoose from 'mongoose';
import { mongooseStorage } from '@cred/mongo-storage';

await mongoose.connect(process.env.MONGO_URI!);

const storage = mongooseStorage({ connection: mongoose.connection });

// Resolves once the supplied connection is ready.
await storage.ready();

// No-op here: the adapter does not own this connection.
await storage.close();
```

`uri` and `connection` are mutually exclusive in the type system. If both are
passed at runtime (for example from untyped JavaScript), `connection` wins and
`uri` is ignored.

## API

### `mongooseStorage(options)`

Creates the three adapters and returns the storage object.

```ts
import type { Connection } from 'mongoose';

type MongooseStorageOptions =
  | { uri: string; connection?: never }
  | { connection: Connection; uri?: never };
```

| Input | Result |
|---|---|
| `{ uri: string }` | Creates a dedicated connection with `mongoose.createConnection(uri)`. |
| `{ connection: Connection }` | Uses the supplied connection as-is. |
| Neither, or a non-string/empty `uri` | Throws `Error('mongooseStorage: "uri" or "connection" is required')`. |

### `MongooseStorage`

```ts
interface MongooseStorage {
  user: UserDatabaseAdapter;
  refreshToken: RefreshTokenDatabaseAdapter;
  auditLogs: AuditDatabaseAdapter;
  ready: () => Promise<void>;
  close: () => Promise<void>;
}
```

| Member | Description |
|---|---|
| `user` | User storage adapter. |
| `refreshToken` | Refresh-token storage adapter. |
| `auditLogs` | Audit-log storage adapter. Note the plural name. |
| `ready()` | Awaits `connection.asPromise()`: resolves immediately when the connection is already connected, otherwise waits for it (and rejects if the initial connection fails). |
| `close()` | Closes the connection **only** when it was created from `uri`. With a supplied `connection`, it does nothing. |

The package root exports only `mongooseStorage`, the `MongooseStorage`
interface, and the `MongooseStorageOptions` type. The schema/model factories in
`src/models` are not re-exported from the package entry point.

## Adapters

All adapters live in `src/adapters` and return plain objects. They use the
schemas in `src/models`, which are registered on the connection passed to
`mongooseStorage`.

### `storage.user`

Implements `UserDatabaseAdapter`.

| Method | Behavior |
|---|---|
| `findOne(filter)` | Finds one user. Drops `undefined` values, maps `id` to `_id`, and queries with `strictQuery: false`. Throws when no usable filter field remains. |
| `create(input)` | Inserts a user with `strict: false` and saves it. The schema's pre-save hook applies. Duplicate unique keys become `DuplicateKeyError`. |
| `delete(id)` | Deletes the document whose `_id` matches `id`. Missing documents are not an error. |
| `update(id, updates)` | Partial `$set` update by `_id` with `runValidators: true`. Strips `id`, `createdAt`, and `updatedAt`; writes `password` only when it is a non-empty string. Duplicate unique keys become `DuplicateKeyError`. |
| `findOneByTwoConditions(filter1, filter2)` | Returns the first user matching either non-empty filter (`$or`). If both filters are empty after dropping `undefined`, returns `null`. |
| `incrementLoginAttempts(id)` | Atomically increments `loginAttempts` (`$inc`) and returns the new value. Returns `0` when the user does not exist. |
| `findOneAndUpdate(condition, updates)` | Atomic conditional update. Condition values may be comparison operators (`$gt`, `$lte`, …); `condition.id` is mapped to `_id`. Throws when the condition is empty; returns `null` when nothing matches. |

### `storage.refreshToken`

Implements `RefreshTokenDatabaseAdapter`.

| Method | Behavior |
|---|---|
| `findOne(filter)` | Finds one token. Drops `undefined` values and queries with `strictQuery: false`. Throws when the filter is empty. |
| `create(token)` | Inserts a token with `strict: false`. Duplicate unique keys become `DuplicateKeyError`. |
| `delete(token)` | Deletes one document matching `{ token }` — the token value, not the document id. Missing documents are not an error. |
| `update(id, updates)` | Partial `$set` update by `_id` with `runValidators: true`. Strips `id`, `createdAt`, and `updatedAt`. |
| `findOneAndUpdate(condition, updates)` | Atomic compare-and-set: only the caller whose condition matches receives the document. Both the condition and the update are sanitized. Throws when the condition is empty; returns `null` when nothing matches. |
| `deleteMany(filter)` | Deletes every matching token. Throws when the filter is empty, so it cannot be used to wipe the collection accidentally. |

### `storage.auditLogs`

Implements `AuditDatabaseAdapter`.

| Method | Behavior |
|---|---|
| `create(entry)` | Inserts an audit entry and returns it. No duplicate-key translation. |
| `find(filter, options)` | Returns entries newest first (`createdAt: -1`, then `_id: -1` as a tie-breaker), applying `options.skip` and `options.limit`. Only `filter.user` is applied; an undefined `user` means no filter. |
| `count(filter)` | Counts entries, applying only `filter.user`. |

Pagination normalization in `find`:

- `skip`: non-finite → `0`; negative → `0`; decimals truncated.
- `limit`: non-finite → `20`; clamped to the range `1`–`1000`. A limit of `0` is
  emitted as `1` because MongoDB treats `0` as "unlimited".

## Data model

Schemas live in `src/models` and are compiled per connection. All schemas use
`{ timestamps: true }`, so documents carry `createdAt` and `updatedAt`.

### User

| Field | Type | Default / constraint |
|---|---|---|
| `username` | String | Required, unique |
| `email` | String | Required, unique |
| `password` | String | Optional at the schema level |
| `bio` | String | Optional |
| `phoneNumber` | String | Optional |
| `gender` | String | `male \| female \| other \| null`, default `null` |
| `isVerified` | Boolean | Default `false` |
| `verificationToken` | String | Default `null` |
| `verificationTokenExpires` | Date | Default `null` |
| `verificationTokenLookup` | String | Default `null` |
| `resetPasswordToken` | String | Default `null` |
| `resetPasswordExpires` | Date | Default `null` |
| `resetPasswordTokenLookup` | String | Default `null` |
| `googleId` | String | Optional |
| `githubId` | String | Optional |
| `provider` | String | `local \| github \| google`, default `local` |
| `avatar` | String | Default `null` |
| `loginAttempts` | Number | Default `0` |
| `lockoutUntil` | Date | Default `null` |
| `lastLogin` | Date | Default `null` |
| `lastIp` | String | Default `null` |

Indexes:

- Unique indexes on `username` and `email` from the field definitions.
- Unique **partial** indexes on `verificationTokenLookup` and
  `resetPasswordTokenLookup`, restricted to string values. A partial index is
  used because these fields are `null` for most users and a sparse index would
  still collide on explicit `null`.
- Unique **sparse** indexes on `googleId` and `githubId`.

Pre-save hook: a user with `provider === 'local'` must have a password, otherwise
`save()` throws `Error('Password is required for local accounts')`. Update paths
(`update`, `findOneAndUpdate`) do not run the hook; the user adapter compensates
by dropping empty passwords from updates.

### RefreshToken

| Field | Type | Default / constraint |
|---|---|---|
| `token` | String | Required |
| `lookupId` | String | Default `null` |
| `user` | ObjectId | Required, `ref: 'User'` |
| `family` | String | Required |
| `expiresAt` | Date | Required |
| `consumed` | Boolean | Default `false` |

Indexes:

- Non-unique indexes on `token`, `lookupId`, and `{ user, family }`.
- TTL index on `expiresAt` with `expireAfterSeconds: 0`, so MongoDB removes the
  document once `expiresAt` passes.

### AuditLog

| Field | Type | Default / constraint |
|---|---|---|
| `user` | ObjectId | Default `null`, `ref: 'User'` |
| `action` | String | Required, enum values from `AUDIT_ACTIONS` in `@cred/core` |
| `status` | String | Required, `success \| failure` |
| `ip` | String | Default `null` |
| `userAgent` | String | Default `null` |
| `provider` | String | `local \| google \| github \| null`, default `null` |
| `metadata` | Mixed | Default `null` (arbitrary shape, not schema-validated) |

Indexes:

- `{ user: 1, createdAt: -1 }` for per-user history queries.
- TTL index on `createdAt` with `expireAfterSeconds: 7776000` (90 days).

### Model registration

| Model name | Collection | Schema factory (internal) |
|---|---|---|
| `CredUser` | `User` | `getUserModel` |
| `CredRefreshToken` | `RefreshToken` | `getRefreshModel` |
| `CredAuditLog` | `AuditLog` | `getAuditModel` |

Each factory returns `connection.models[name]` when that model is already
registered on the connection, otherwise it compiles and registers the schema.
This keeps model names per connection, avoiding collisions between an
application connection and a test connection in the same process. It also means
an existing model registered under one of these names on the same connection is
reused as-is.

Index creation follows Mongoose's normal `autoIndex` behavior for the host
connection. In production, applications that disable `autoIndex` must create
the indexes themselves.

## Behavior and guarantees

### Plain objects in and out

- Documents are read with `.lean()` or converted with `.toObject()`, so callers
  receive plain objects, not Mongoose documents.
- `_id` and `__v` are always stripped.
- User objects expose the document id as a string in `id`.
- Refresh-token and audit-log objects expose `user` as a string (`null` for
  audit entries without a user). The refresh-token mapper does not add an `id`
  field.
- `Date` fields stay `Date` objects; no JSON serialization happens inside the
  adapters.

### Atomic operations

The adapters expose single-document atomic operations:

- `refreshToken.findOneAndUpdate` is an atomic compare-and-set, so only one
  caller can consume a given token state.
- `refreshToken.findOneAndUpdate` and `user.findOneAndUpdate` sanitize input but
  send it to MongoDB as one operation.
- `user.incrementLoginAttempts` uses `$inc` and returns the resulting counter.

### Duplicate-key translation

Writes that can hit a unique index translate MongoDB error code `11000` into
`DuplicateKeyError` from `@cred/core`, with the conflicting field name taken from
`keyPattern` (or `keyValue` as a fallback) when available. This applies to:

- `user.create`
- `user.update`
- `refreshToken.create`

`auditLogs.create` does not translate duplicate-key errors; the audit schema
declares no unique indexes.

### Protected fields

- `id`, `createdAt`, and `updatedAt` cannot be reassigned through user or
  refresh-token updates.
- A user's `password` is written only when the update contains a non-empty
  string. Empty strings, `null`, and `undefined` are dropped, so an update
  cannot clear a password and bypass the local-account rule.
- `user.delete` and `refreshToken.delete` do not throw when no document
  matches.

### Schema tolerance

The adapters are written against `@cred/core` types, not against a fixed
Mongoose schema:

- `user.create` and `refreshToken.create` use `strict: false` so contract fields
  missing from an older schema revision (for example token lookup ids) are still
  persisted.
- User and refresh-token reads use `strictQuery: false` so filters on those
  fields are not silently stripped.
- User and refresh-token updates use `strict: false` for the same reason.
- `Model<any>` is used intentionally: the concrete document type belongs to the
  host application's schema.

## Caveats and edge cases

These behaviors follow from the current implementation and are worth knowing
before relying on the adapters:

- `user.findOneByTwoConditions` does **not** map `id` to `_id`; filters are used
  as given. Only `user.findOne` and `user.findOneAndUpdate` perform that
  mapping.
- `user.update` and `refreshToken.update` are typed as returning a document, but
  can resolve to `null` in a concurrent-deletion race.
- `refreshToken.delete` matches on the `token` value, not on `id`.
- `refreshToken.deleteMany({})` throws instead of deleting everything. Pass at
  least one field.
- `auditLogs.find` ignores every filter field except `user`, including `action`,
  `status`, and date ranges.
- `auditLogs.find` treats a limit of `0` as `1`, not as "all".
- Mongoose casts schema-typed paths (such as `user` ObjectIds) during queries;
  the adapters pass filter values through without their own casting layer.
- `verificationTokenLookup` and `resetPasswordTokenLookup` are unique only for
  string values. Multiple documents may hold `null`.

## Error reference

| Error | Thrown when |
|---|---|
| `Error('mongooseStorage: "uri" or "connection" is required')` | Neither option is provided, or `uri` is empty/not a string. |
| `Error('findOne requires at least one filter field')` | `user.findOne` receives a filter that is empty after dropping `undefined`. |
| `Error('A refresh-token query requires at least one filter field')` | `refreshToken.findOne`, `findOneAndUpdate`, or `deleteMany` receives an empty filter. |
| `Error('A conditional user update requires at least one condition')` | `user.findOneAndUpdate` receives an empty condition. |
| `Error('Password is required for local accounts')` | A local user is saved without a password (pre-save hook). |
| `DuplicateKeyError` | A unique index rejects `user.create`, `user.update`, or `refreshToken.create`. |
| `TypeError('Expected a Mongoose document or a plain object')` | A mapper receives a non-object value. |
| `Error('Cannot map a user document without an _id')` | A user document without `_id` reaches the mapper. |

## TypeScript and module format

- The package is ESM only: `"type": "module"` with `dist/index.mjs` and
  `dist/index.d.mts`. There is no `require` export condition.
- Types are shipped alongside the bundle; no `@types/*` package is needed.
- Relative imports inside the package use explicit `.js` extensions, which is
  required by `NodeNext` resolution.
- `MongooseStorageOptions` prevents supplying both `uri` and `connection` at
  compile time.

## Project structure

```text
packages/mongo-storage/
├── src/
│   ├── index.ts                     public entry point: mongooseStorage()
│   ├── adapters/
│   │   ├── user.adapter.ts          UserDatabaseAdapter
│   │   ├── refreshToken.adapter.ts  RefreshTokenDatabaseAdapter
│   │   └── auditLog.adapter.ts      AuditDatabaseAdapter
│   ├── helpers/
│   │   └── database.helper.ts       filter translation (id -> _id)
│   └── models/
│       ├── user.model.ts            CredUser schema + factory
│       ├── refresh-token.model.ts   CredRefreshToken schema + factory
│       └── audit-log.model.ts       CredAuditLog schema + factory
├── tsdown.config.ts                 ESM bundle + .d.mts declarations
├── tsconfig.json                    extends @cred/config
├── eslint.config.js                 lint rules and import boundaries
└── package.json
```

## Development

Run these from `packages/mongo-storage`, or from the repository root with
`pnpm --filter @cred/mongo-storage <script>`.

| Command | Description |
|---|---|
| `pnpm build` | Bundles `src/index.ts` to `dist/` with declarations (`tsdown`). |
| `pnpm dev` | Rebuilds on change (`tsdown --watch`). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | ESLint over the package. |
| `pnpm lint:fix` | ESLint with `--fix`. |

This package defines build, lint, and typecheck scripts; it has no test script.
Run `pnpm build` before publishing so `dist/` matches `src/`; the
`prepublishOnly` script also runs the build.

## Design boundaries

The package owns database models and adapters only. `eslint.config.js` rejects
imports of HTTP, authentication-token, mail, and OAuth libraries, including
`express`, `passport`, `nodemailer`, `express-rate-limit`, `helmet`, `cors`,
`cookie-parser`, `jsonwebtoken`, and `bcryptjs`. Those concerns belong to
`@cred/core` or the application layer.

## License

MIT

