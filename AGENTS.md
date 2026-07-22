# AGENTS.md — Cred

## Quick start

```bash
pnpm install
pnpm dev          # turbo dev → builds deps, starts api in dev mode
pnpm build        # turbo build → tsc apps/api + tsup packages/shared
pnpm start        # node apps/api/dist/index.js
pnpm test         # turbo test → jest (115 tests across 7 suites)
pnpm test:coverage# jest --coverage
```

Package manager is **pnpm** (v10.33.2). Lockfile: `pnpm-lock.yaml`.

## Stack

- **Express 5** + **Mongoose 9** + **TypeScript 6.0.3** (ESM, ES2022 target)
- Auth: `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `dotenv`
- Validation: `zod` 4
- Rate limiting: `express-rate-limit`
- Email: `nodemailer` + Ethereal (dev) or SMTP (prod)
- OAuth: `passport`, `passport-google-oauth20`, `passport-github2`
- Security: `helmet`

## Architecture (monorepo)

```
cred/
  apps/
    api/                  — Express API server (@cred/api)
      src/
        index.ts          — entrypoint: awaits connectDB(), starts Express
        app.ts            — Express app setup, mounts /api/auth + /api/profile
        db/db.ts          — mongoose.connect(MONGO_URI)
        models/           — User, RefreshToken, AuditLog Mongoose models
        services/passport.ts  — Passport strategies
        routes/           — auth, oauth, profile, health, audit
        controllers/      — auth, oauth, profile, health, audit
        middlewares/       — JWT auth, Zod validation
        helpers/          — API helpers, token helpers, email, audit
        templates/        — HTML email templates
  packages/
    shared/               — @cred/shared (types, Zod validators)
      src/
        types/            — auth.types, jwt.types, api.types, audit.types
        validators/       — auth.validator (Zod schemas)
    config/               — @cred/config (shared tsconfigs)
      tsconfig/
        base.json
        node.json
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
| GET    | /api/auth/google        | No            | Initiate Google OAuth |
| GET    | /api/auth/google/callback | No          | Google OAuth callback |
| GET    | /api/auth/github        | No            | Initiate GitHub OAuth |
| GET    | /api/auth/github/callback | No          | GitHub OAuth callback |

### `/api/profile`

| Method | Path                              | Auth required | Description |
|--------|-----------------------------------|---------------|-------------|
| GET    | /api/profile/me                   | Yes           | Get current user profile |
| PUT    | /api/profile/me                   | Yes           | Update profile fields |
| DELETE | /api/profile/me                   | Yes           | Delete account |
| POST   | /api/profile/me/change-password   | Yes           | Change password |

Auth uses **httpOnly cookies** (`token`). `secure` flag depends on `NODE_ENV === 'production'`.

## Environment

`.env` (in `apps/api/`) requires: `PORT`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `BACKEND_URL`, `CORS_ORIGIN`.

## Rate limiting

| Limiter           | Window | Max | Endpoint |
|-------------------|--------|-----|----------|
| authLimiter       | 15 min | 20  | All /api/auth |
| oauthLimiter      | 15 min | 10  | All OAuth routes |
| loginLimiter      | 15 min | 5   | POST /api/auth/login |
| registerLimiter   | 60 min | 3   | POST /api/auth |
| forgotLimiter     | 60 min | 3   | POST /api/auth/forgot-password |
| profileLimiter    | 15 min | 50  | All /api/profile |
| profileUpdateLimiter | 15 min | 50 | PUT /api/profile/me, POST /api/profile/me/change-password |

## Notable facts

- `req.user` is globally typed via `apps/api/src/types/types.d.ts`.
- `@cred/shared` is built with `tsup` (ESM output); `@cred/api` is built with `tsc`.
- Dev email uses Ethereal (auto-creates test account, logs preview URL to console).
- Production SMTP is configured via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- Passwords are excluded from all API responses (destructured via `toObject()`).
- Tests use **Jest** + **ts-jest** (ESM preset) + **supertest** + **mongodb-memory-server** (115 tests, 7 suites).
- Run with `pnpm test` or `pnpm test:coverage` from root (turbo delegates to apps/api).
- No linter, no formatter, no CI configured.
