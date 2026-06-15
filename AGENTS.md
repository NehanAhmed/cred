# AGENTS.md — Authentication API

## Quick start

```bash
pnpm install
pnpm dev          # ts-node-dev --respawn --transpile-only src/index.ts
pnpm build        # tsc -> dist/
pnpm start        # node dist/index.js
```

Package manager is **pnpm** (v10.33.2). Lockfile: `pnpm-lock.yaml`.

## Stack

- **Express 5** + **Mongoose 9** + **TypeScript 6.0.3** (commonjs, ES2022 target)
- Auth: `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `dotenv`

## Architecture

```
src/
  index.ts                 — entrypoint: calls connectDB(), starts Express
  app.ts                   — Express app setup (cors-less), mounts /api/auth
  db/db.ts                 — mongoose.connect(MONGO_URI)
  models/user.models.ts    — User schema (username, email, password, bio, phoneNumber, gender)
  routes/auth.routes.ts    — POST /api/auth (register), /login, /logout
  controllers/auth.controllers.ts
  middlewares/auth.middleware.ts  — JWT verify from req.cookies.token
  helpers/api.helpers.ts   — sendSuccess / sendError helper
  types/                   — auth.types.ts, api.types.ts, types.d.ts (global Express.Request.user)
```

## API endpoints

| Method | Path              | Auth required |
|--------|-------------------|---------------|
| POST   | /api/auth         | No            |
| POST   | /api/auth/login   | No            |
| POST   | /api/auth/logout  | Yes (cookie)  |

Auth uses **httpOnly cookies** (`token`). `secure` flag depends on `NODE_ENV === 'production'`.

## Environment

`.env` requires: `PORT`, `MONGO_URI`, `JWT_SECRET`.

> `.env` is checked into the repo with live secrets — do not commit sensitive values.

## Notable facts

- `req.user` is globally typed via `src/types/types.d.ts` as `Express.Request.user` (type `any`).
- No test framework, no linter, no formatter, no CI configured.
- No `.gitignore` — candidate for creation if committing.
- Multer is in dependencies but unused.
