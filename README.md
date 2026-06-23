<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Express-5.2.1-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Mongoose-9.7.0-880000?logo=mongodb&logoColor=white" alt="Mongoose">
  <img src="https://img.shields.io/badge/Zod-4.4.3-3068B7?logo=zod&logoColor=white" alt="Zod">
  <img src="https://img.shields.io/badge/JWT-9.0.3-000000?logo=jsonwebtokens&logoColor=white" alt="JWT">
  <img src="https://img.shields.io/badge/bcryptjs-3.0.3-3178C6?logo=npm&logoColor=white" alt="bcryptjs">
  <img src="https://img.shields.io/badge/Nodemailer-9.0.0-30B980?logo=npm&logoColor=white" alt="Nodemailer">
  <img src="https://img.shields.io/badge/pnpm-10.33.2-F69220?logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="MIT License">
</p>

---

<h1 align="center">Cred</h1>

<p align="center">
  <strong>Cred</strong> — a production-ready authentication API.<br>
  Think <strong>Clerk for your personal projects</strong>.<br>
  Built with TypeScript, Express 5, Mongoose 9, and a security-first mindset.
</p>

---

## About

**Cred** is a drop-in authentication service that handles the hardest part of any application — auth — so you don't have to rebuild it every time. Designed as a pluggable backend for personal projects, side hustles, and MVPs, it mirrors the architecture of services like Clerk but stays fully self-contained and customizable.

Every decision — from httpOnly JWT cookies to Zod validation to rate limiting to Ethereal email — prioritizes security and developer experience without unnecessary complexity.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js — ts-node-dev (hot reload) |
| **Language** | TypeScript 6 (strict mode, ES2022, CommonJS) |
| **Web Framework** | Express 5 |
| **Database** | MongoDB via Mongoose 9 |
| **Auth** | bcryptjs (hashing) + jsonwebtoken (JWT) + Passport (OAuth) |
| **OAuth** | passport-google-oauth20, passport-github2 |
| **Validation** | Zod 4 (schema-based request validation) |
| **Rate Limiting** | express-rate-limit |
| **Security** | helmet (headers), cookie-parser (httpOnly, sameSite) |
| **Email (Dev)** | Nodemailer + Ethereal (fake SMTP) |
| **Package Manager** | pnpm 10 |

---

## Features

### Core Auth

| Feature | Status |
|---|---|
| Register with username, email, password, bio, phone, gender | ✅ |
| Login with email or username | ✅ |
| Logout (clears httpOnly cookie) | ✅ |
| JWT stored in secure httpOnly cookie | ✅ |
| SameSite strict mode, secure flag in production | ✅ |

### OAuth

| Feature | Status |
|---|---|
| Google OAuth (login + account linking) | ✅ |
| GitHub OAuth (login + account linking) | ✅ |
| Auto-link OAuth to existing email accounts | ✅ |
| Unique username generation on collision | ✅ |

### Security

| Feature | Status |
|---|---|
| bcrypt password hashing (salt rounds: 10) | ✅ |
| Zod input validation with typed schemas | ✅ |
| Rate limiting per endpoint (register, login, OAuth, profile) | ✅ |
| Global auth rate ceiling (20 req / 15 min) | ✅ |
| Password strength enforcement (uppercase + digit) | ✅ |
| Helmet security headers | ✅ |
| Request body size limit (10kb) | ✅ |
| Generic login errors (no user enumeration) | ✅ |
| Startup env var validation | ✅ |

### Email & Verification

| Feature | Status |
|---|---|
| Email verification with token-based confirmation | ✅ |
| Forgot password flow (email with reset link) | ✅ |
| Reset password with secure token | ✅ |
| Dev email via Ethereal (preview URLs in console) | ✅ |
| Production SMTP ready (env config) | ✅ |

### User Management

| Feature | Status |
|---|---|
| Get current profile (`GET /api/profile/me`) | ✅ |
| Update profile (username, bio, phone, gender) | ✅ |
| Change password with current password verification | ✅ |
| Delete account | ✅ |

---

## Architecture & Concepts

```
src/
  index.ts                 Entrypoint — connects to MongoDB, starts server
  app.ts                   Express app — middleware, routes, rate limiters
  routes/                  Route definitions
  controllers/             Request handlers
  middlewares/             Auth guard, validation middleware
  validators/              Zod schemas
  models/                  Mongoose User model
  helpers/                 Response + email helpers
  templates/               HTML email templates
  types/                   TypeScript types + global augmentations
```

### How Auth Works

1. **Register** — password is hashed with bcrypt, user document is created in MongoDB. A verification token is generated, hashed (SHA-256), and stored in the database. The raw token is emailed to the user. Login is blocked until the email is verified.
2. **Email Verification** — user clicks the link in their email. The backend hashes the token, matches it against the database, marks the user as verified, and redirects to the frontend login page.
3. **Login (email/password)** — credentials are validated against the database. If the email isn't verified, a `401` is returned. On success, a JWT is signed with the user's `id`, `email`, and `username`, then stored in an **httpOnly cookie** (`sameSite: strict`, `secure` in production).
4. **OAuth Login (Google / GitHub)** — user clicks "Sign in with Google/GitHub". Passport redirects to the provider, which calls back with a profile. The backend finds or creates the user (auto-linking if the email matches an existing account), signs a JWT, sets an httpOnly cookie (`sameSite: lax` required for the redirect flow), and redirects to `CLIENT_URL/auth/callback`.
5. **Authenticated requests** — the `authMiddleware` reads the JWT from `req.cookies.token`, verifies it, and attaches the decoded payload to `req.user`.
6. **Password Reset** — user enters their email on the "forgot password" form. If the email exists, a reset token is generated, hashed, stored, and emailed. The user clicks the link, enters a new password, and the backend updates it.
7. **Logout** — the cookie is cleared server-side.

---

## API Reference

All routes are prefixed with `/api`.

### Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth` | No | Register a new user |
| `POST` | `/api/auth/login` | No | Log in and receive JWT cookie |
| `POST` | `/api/auth/logout` | Yes | Clear JWT cookie |
| `GET` | `/api/auth/verify-email/:token` | No | Verify email (redirects to frontend) |
| `POST` | `/api/auth/forgot-password` | No | Send password reset email |
| `POST` | `/api/auth/reset-password/:token` | No | Reset password with token |
| `GET` | `/api/auth/google` | No | Initiate Google OAuth |
| `GET` | `/api/auth/google/callback` | No | Google OAuth callback |
| `GET` | `/api/auth/github` | No | Initiate GitHub OAuth |
| `GET` | `/api/auth/github/callback` | No | GitHub OAuth callback |

### Profile (`/api/profile`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/profile/me` | Yes | Get current user profile |
| `PUT` | `/api/profile/me` | Yes | Update profile fields |
| `DELETE` | `/api/profile/me` | Yes | Delete account permanently |
| `POST` | `/api/profile/me/change-password` | Yes | Change password |

---

## Testing

The project includes **61 tests** across **3 test suites** covering all 10 API endpoints.

| Suite | File | Tests |
|---|---|---|
| Auth (register, login, logout, verify-email) | `src/__tests__/routes/auth.test.ts` | 24 |
| Auth email (forgot-password, reset-password) | `src/__tests__/routes/auth-email.test.ts` | 11 |
| Profile (get, update, delete, change-password) | `src/__tests__/routes/profile.test.ts` | 26 |

```bash
# Run all tests
pnpm test

# Run with coverage report
pnpm test:coverage
```

### How tests work

- **Database**: Each test suite spins up a fresh in-memory MongoDB via `mongodb-memory-server`. Collections are wiped after every test so state never leaks.
- **HTTP**: Requests are sent via **supertest** against a lightweight Express app that mirrors production routes without rate limiters (to avoid test blocking).
- **Email**: `nodemailer` is mocked — no Ethereal accounts are created during tests. Use `jest.fn()` assertions to verify email helpers are called correctly.
- **Auth tokens**: JWTs are generated directly with `jsonwebtoken` when a valid token is needed, and raw invalid strings are used for 401 assertions.

---

## Roadmap

### Planned

| Feature | Description |
|---|---|
| **Refresh tokens** | Rotate access tokens silently for long-lived sessions |
| **Role-based access control** | `user` / `admin` roles with middleware guards |
| **Multi-factor authentication** | TOTP-based 2FA with recovery codes |
| **Account lockout** | Temporary lock after N failed login attempts |
| **Session logging** | Audit log of IP, user agent, and login timestamps |

---

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

Copyright © 2026 [Nehan Ahmed](https://github.com/NehanAhmed)
