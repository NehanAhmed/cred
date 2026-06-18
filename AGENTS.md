# AGENTS.md — Cred

## Quick start

```bash
pnpm install
pnpm dev          # ts-node-dev --respawn --transpile-only src/index.ts
pnpm build        # tsc -> dist/
pnpm start        # node dist/index.js
pnpm test         # jest (61 tests across 3 suites)
pnpm test:coverage# jest --coverage
```

Package manager is **pnpm** (v10.33.2). Lockfile: `pnpm-lock.yaml`.

## Stack

- **Express 5** + **Mongoose 9** + **TypeScript 6.0.3** (commonjs, ES2022 target)
- Auth: `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `dotenv`
- Validation: `zod` 4
- Rate limiting: `express-rate-limit`
- Email: `nodemailer` + Ethereal (dev)

## Architecture

```
src/
  index.ts                 — entrypoint: calls connectDB(), starts Express
  app.ts                   — Express app setup (cors-less), mounts /api/auth + /api/profile
  db/db.ts                 — mongoose.connect(MONGO_URI)
  models/user.models.ts    — User schema (username, email, password, bio, phoneNumber, gender,
                             isVerified, verificationToken, verificationTokenExpires,
                             resetPasswordToken, resetPasswordExpires)
  routes/
    auth.routes.ts         — register, login, logout, verify-email, forgot-password, reset-password
    profile.routes.ts      — get/update profile, change password, delete account
  controllers/
    auth.controllers.ts
    profile.controllers.ts
  middlewares/
    auth.middleware.ts      — JWT verify from req.cookies.token
    validate.middleware.ts  — generic Zod schema validation
  validators/auth.validator.ts  — Zod schemas for all request bodies
  helpers/
    api.helpers.ts          — sendSuccess / sendError helper
    email.helpers.ts        — Nodemailer (Ethereal dev), sendVerification, sendReset
  templates/email.templates.ts  — HTML email templates
  types/                    — auth.types.ts, api.types.ts, types.d.ts (global Express.Request.user)
```

## API endpoints

### `/api/auth`

| Method | Path                    | Auth required | Description |
|--------|-------------------------|---------------|-------------|
| POST   | /api/auth               | No            | Register (sends verification email) |
| POST   | /api/auth/login         | No            | Login (requires verified email) |
| POST   | /api/auth/logout        | Yes           | Clear JWT cookie |
| GET    | /api/auth/verify-email/:token | No      | Verify email, redirects to CLIENT_URL |
| POST   | /api/auth/forgot-password | No          | Sends password reset email |
| POST   | /api/auth/reset-password/:token | No     | Reset password with token from email |

### `/api/profile`

| Method | Path                              | Auth required | Description |
|--------|-----------------------------------|---------------|-------------|
| GET    | /api/profile/me                   | Yes           | Get current user profile |
| PUT    | /api/profile/me                   | Yes           | Update profile fields |
| DELETE | /api/profile/me                   | Yes           | Delete account |
| POST   | /api/profile/me/change-password   | Yes           | Change password |

Auth uses **httpOnly cookies** (`token`). `secure` flag depends on `NODE_ENV === 'production'`.

## Environment

`.env` requires: `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `BACKEND_URL`.

## Rate limiting

| Limiter       | Window | Max | Endpoint |
|---------------|--------|-----|----------|
| authLimiter   | 15 min | 20  | All /api/auth |
| loginLimiter  | 15 min | 5   | POST /api/auth/login |
| registerLimiter | 60 min | 3 | POST /api/auth |
| forgotLimiter | 60 min | 3  | POST /api/auth/forgot-password |
| profileLimiter | 15 min | 50 | All /api/profile |

## Notable facts

- `req.user` is globally typed via `src/types/types.d.ts` as `Express.Request.user` (type `any`).
- Dev email uses Ethereal (auto-creates test account, logs preview URL to console).
- Passwords are excluded from all API responses (destructured via `toObject()`).
- Tests use **Jest** + **ts-jest** + **supertest** + **mongodb-memory-server** (61 tests, 3 suites).
- Run with `pnpm test` or `pnpm test:coverage`.
- No linter, no formatter, no CI configured.
- Multer is in dependencies but unused.
