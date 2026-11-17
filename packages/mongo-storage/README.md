# @cred/mongo-storage

MongoDB/Mongoose storage adapter for Cred. Implements core's three storage
contracts — `UserDatabaseAdapter`, `RefreshTokenDatabaseAdapter`, and
`AuditDatabaseAdapter` — so `@cred/core` can run against a real database
without knowing anything about Mongoose.

## Install

```bash
pnpm add @cred/mongo-storage @cred/core mongoose
```

> **Dependency contract:** `@cred/core` is declared as a regular (runtime)
> dependency on purpose — the adapters throw core's error classes
> (`DuplicateKeyError`) and return core's plain-object types at runtime.
> `mongoose` is a peer dependency so the host application supplies its own
> single copy; two copies of Mongoose in one process break `instanceof` and
> plugin behavior.

## Usage

```ts
import { mongooseStorage } from '@cred/mongo-storage';

const storage = mongooseStorage({ uri: process.env.MONGO_URI });

// Hand the adapters to core as `deps.userDatabase`,
// `deps.refreshTokenDatabase`, and `deps.auditDatabase`.

// Wait for the connection before serving traffic:
await storage.ready();

// On shutdown (only closes the connection when the adapter owns it):
await storage.close();
```

## Notes

- Models are registered **per connection** (`CredUser`, `CredRefreshToken`,
  `CredAuditLog`), so a host application can run multiple connections (for
  example, tests) without model-name collisions.
- Adapter methods return plain objects: ObjectId fields are converted to
  strings (`id`, `user`), and `_id`/`__v` are stripped.
- Native uniqueness violations (MongoDB error code 11000) are translated into
  core's `DuplicateKeyError`, so core services never see driver-specific
  errors.
- Login-attempt increments and refresh-token consumption use atomic
  `findOneAndUpdate` operations, which is what makes refresh rotation and
  reuse detection race-free.
