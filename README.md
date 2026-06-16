<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Express-5.2.1-000000?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Mongoose-9.7.0-880000?logo=mongodb&logoColor=white" alt="Mongoose">
  <img src="https://img.shields.io/badge/Zod-4.4.3-3068B7?logo=zod&logoColor=white" alt="Zod">
  <img src="https://img.shields.io/badge/JWT-9.0.3-000000?logo=jsonwebtokens&logoColor=white" alt="JWT">
  <img src="https://img.shields.io/badge/bcryptjs-3.0.3-3178C6?logo=npm&logoColor=white" alt="bcryptjs">
  <img src="https://img.shields.io/badge/pnpm-10.33.2-F69220?logo=pnpm&logoColor=white" alt="pnpm">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen" alt="MIT License">
</p>

---

<h1 align="center">Authentication API</h1>

<p align="center">
  A production-ready, reusable authentication backend — think <strong>Clerk for your personal projects</strong>.<br>
  Built with TypeScript, Express 5, Mongoose 9, and a security-first mindset.
</p>

---

## About

This is a **drop-in authentication service** that handles the hardest part of any application — auth — so you don't have to rebuild it every time. Designed as a pluggable backend for personal projects, side hustles, and MVPs, it mirrors the architecture of services like Clerk but stays fully self-contained and customizable.

Every decision — from httpOnly JWT cookies to Zod validation to rate limiting — prioritizes security and developer experience without unnecessary complexity.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js — ts-node-dev (hot reload) |
| **Language** | TypeScript 6 (strict mode, ES2022, CommonJS) |
| **Web Framework** | Express 5 |
| **Database** | MongoDB via Mongoose 9 |
| **Auth** | bcryptjs (hashing) + jsonwebtoken (JWT) |
| **Validation** | Zod 4 (schema-based request validation) |
| **Rate Limiting** | express-rate-limit |
| **Cookies** | cookie-parser (httpOnly, sameSite) |
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

### Security

| Feature | Status |
|---|---|
| bcrypt password hashing (salt rounds: 10) | ✅ |
| Zod input validation with typed schemas | ✅ |
| Rate limiting per endpoint (register, login, profile) | ✅ |
| Global auth rate ceiling (20 req / 15 min) | ✅ |
| Password strength enforcement (uppercase + digit) | ✅ |

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
  helpers/                 Success/error response helpers
  types/                   TypeScript types + global augmentations
```

### How Auth Works

1. **Register** — password is hashed with bcrypt, user document is created in MongoDB. No session is created — the client must log in.
2. **Login** — credentials are validated against the database. On success, a JWT is signed with the user's `id`, `email`, and `username`, then stored in an **httpOnly cookie** (`sameSite: strict`, `secure` in production).
3. **Authenticated requests** — the `authMiddleware` reads the JWT from `req.cookies.token`, verifies it, and attaches the decoded payload to `req.user`. Your routes can access it directly.
4. **Logout** — the cookie is cleared server-side.

### Why httpOnly Cookies?

httpOnly cookies are **not accessible to JavaScript** in the browser, making them immune to XSS-based token theft. Combined with `sameSite: strict` and the `secure` flag, this is the most secure session storage strategy for SPAs without additional infrastructure.

---

## API Reference

All routes are prefixed with `/api`.

### Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth` | No | Register a new user |
| `POST` | `/api/auth/login` | No | Log in and receive JWT cookie |
| `POST` | `/api/auth/logout` | Yes | Clear JWT cookie |

### Profile (`/api/profile`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/profile/me` | Yes | Get current user profile |
| `PUT` | `/api/profile/me` | Yes | Update profile fields |
| `DELETE` | `/api/profile/me` | Yes | Delete account permanently |
| `POST` | `/api/profile/me/change-password` | Yes | Change password |

---

## Roadmap

### Tier 3 — Communication (planned)

| Feature | Description |
|---|---|
| **Email verification** | Verify email after registration with token-based confirmation |
| **Password reset** | Forgot/reset flow with email delivery of reset token |

### Tier 4 — Advanced (exploring)

| Feature | Description |
|---|---|
| **Refresh tokens** | Rotate access tokens silently for long-lived sessions |
| **Role-based access control** | `user` / `admin` roles with middleware guards |
| **OAuth / social login** | Google, GitHub authentication strategies |
| **Multi-factor authentication** | TOTP-based 2FA with recovery codes |
| **Account lockout** | Temporary lock after N failed login attempts |
| **Session logging** | Audit log of IP, user agent, and login timestamps |

---

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

Copyright © 2026 [Nehan Ahmed](https://github.com/NehanAhmed)
