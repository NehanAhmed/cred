<p align="center">
  <img src="https://ik.imagekit.io/td7wr0ax7o/Gemini_Generated_Image_cwp7cbcwp7cbcwp7.clean.png" alt="Cred Banner" width="100%">
</p>

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

<h1 align="center">Cred</h1>

<p align="center">
  A drop-in authentication API for personal projects — registration, login, OAuth (Google + GitHub), email verification, password reset, and profile management. TypeScript, Express 5, Mongoose 9. Security-first, self-hosted.
</p>

## Getting Started

```bash
git clone https://github.com/NehanAhmed/cred.git
cd cred
pnpm install
cp .env.example .env      # then fill in secrets
pnpm dev
```

### Environment Variables

All required variables are listed in `.env.example`. Key ones:

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JSON Web Tokens |
| `CLIENT_URL` | Frontend URL (e.g. `http://localhost:5173`) |
| `BACKEND_URL` | Backend URL (e.g. `http://localhost:3000`) |
| `CORS_ORIGIN` | Allowed CORS origin (typically same as `CLIENT_URL`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth app ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth app secret |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth app ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app secret |

SMTP is optional — dev mode uses Ethereal (preview URLs logged to console). For production, provide `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js ≥18 — ts-node-dev (hot reload) |
| **Language** | TypeScript 6 (strict, ES2022, CommonJS) |
| **Web Framework** | Express 5 |
| **Database** | MongoDB via Mongoose 9 |
| **Auth** | bcryptjs + jsonwebtoken (httpOnly cookies) |
| **OAuth** | Passport (Google + GitHub) |
| **Validation** | Zod 4 |
| **Rate Limiting** | express-rate-limit (per-endpoint + global) |
| **Security** | helmet, cookie-parser (httpOnly, sameSite, secure) |
| **Email** | Nodemailer + Ethereal (dev) / SMTP (prod) |
| **Package Manager** | pnpm 10 |

## Features

| Area | Capabilities |
|---|---|
| **Registration** | Username, email, password, bio, phone, gender. Zod-validated. Email verification required before login. |
| **Login / Logout** | Email or username. httpOnly JWT cookie (strict sameSite, secure in production). |
| **OAuth** | Google + GitHub. Auto-links to existing accounts by email. Generates unique usernames on collision. |
| **Email** | Verification, forgot password, reset password. Ethereal in dev, SMTP in prod. |
| **Profile** | Get, update (username, bio, phone, gender), change password, delete account. |
| **Security** | bcrypt (10 rounds), rate limiting per endpoint, helmet headers, 10kb body limit, generic login errors (no user enumeration), startup env validation. |

## API Reference

All routes are prefixed with `/api`.

### `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth` | No | Register |
| `POST` | `/api/auth/login` | No | Log in (returns JWT cookie) |
| `POST` | `/api/auth/logout` | Yes | Clear JWT cookie |
| `GET` | `/api/auth/verify-email/:token` | No | Verify email (redirects to frontend) |
| `POST` | `/api/auth/forgot-password` | No | Send password reset email |
| `POST` | `/api/auth/reset-password/:token` | No | Reset password |
| `GET` | `/api/auth/google` | No | Initiate Google OAuth |
| `GET` | `/api/auth/google/callback` | No | Google OAuth callback |
| `GET` | `/api/auth/github` | No | Initiate GitHub OAuth |
| `GET` | `/api/auth/github/callback` | No | GitHub OAuth callback |

### `/api/profile`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/profile/me` | Yes | Get profile |
| `PUT` | `/api/profile/me` | Yes | Update profile |
| `DELETE` | `/api/profile/me` | Yes | Delete account |
| `POST` | `/api/profile/me/change-password` | Yes | Change password |

### `/api/health`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | App + DB health check |

## Testing

115 tests across 7 suites. In-memory MongoDB (`mongodb-memory-server`), supertest for HTTP, email helpers mocked.

```bash
pnpm test              # run all
pnpm test:coverage     # with coverage report
```

| Suite | Tests |
|---|---|
| Auth (register, login, logout, refresh, verify-email) | 27 |
| Auth email (forgot-password, reset-password) | 11 |
| Profile (get, update, delete, change-password) | 26 |
| OAuth (Google + GitHub init + callback) | 15 |
| Health (app + DB status) | 10 |
| Audit (session logging, pagination) | 22 |
| Rate limiters (all 8 limiters) | 4 |

## License

MIT. See [LICENSE](./LICENSE).

Copyright © 2026 [Nehan Ahmed](https://github.com/NehanAhmed)

## Contributing

Contributions welcome. Open an issue or pull request at [github.com/NehanAhmed/cred](https://github.com/NehanAhmed/cred).