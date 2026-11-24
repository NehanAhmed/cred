# Cred API — API Reference

**Version:** 1.0.0  
**Base URL:** `http://localhost:3000/api`  
**Last updated:** 2026-11-11

---

## Table of Contents

- [Overview](#overview)
- [Standard Response Format](#standard-response-format)
- [Environment Variables](#environment-variables)
- [Rate Limiting](#rate-limiting)
- [Authentication](#authentication)
- [Authentication Endpoints](#authentication-endpoints)
  - [POST /api/auth — Register](#post-apiauth--register)
  - [POST /api/auth/login — Login](#post-apiauthlogin--login)
  - [POST /api/auth/logout — Logout](#post-apiauthlogout--logout)
  - [POST /api/auth/refresh — Refresh Token](#post-apiauthrefresh--refresh-token)
  - [GET /api/auth/verify-email/:token — Verify Email](#get-apiauthverify-emailtoken--verify-email)
  - [POST /api/auth/forgot-password — Forgot Password](#post-apiauthforgot-password--forgot-password)
  - [POST /api/auth/reset-password/:token — Reset Password](#post-apiauthreset-passwordtoken--reset-password)
  - [OAuth Endpoints](#oauth-endpoints)
- [Profile Endpoints](#profile-endpoints)
  - [GET /api/profile/me — Get Profile](#get-apiprofileme--get-profile)
  - [PUT /api/profile/me — Update Profile](#put-apiprofileme--update-profile)
  - [DELETE /api/profile/me — Delete Account](#delete-apiprofileme--delete-account)
  - [POST /api/profile/me/change-password — Change Password](#post-apiprofilemechange-password--change-password)
- [Health Endpoint](#health-endpoint)
- [Session Audit Logging](#session-audit-logging)
  - [GET /api/profile/me/audit-logs — Get Audit Logs](#get-apiprofilemeaudit-logs--get-audit-logs)
- [Data Models](#data-models)
- [Error Reference](#error-reference)
- [Security Considerations](#security-considerations)
- [Email System](#email-system)
- [Quick Start](#quick-start)

---

## Overview

**Cred** is a drop-in authentication API built with Express 5, Mongoose 9, and TypeScript 6. All authentication is handled via **httpOnly JWT cookies** — no bearer tokens, no `Authorization` headers. Access state lives in the signed JWT; refresh tokens are stored as SHA-256 hashes in MongoDB so they can be rotated and revoked.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| httpOnly cookies over bearer tokens | Mitigates XSS token theft. No client-side token management needed. |
| Zod for request validation | Schema-based parsing with typed inference. Strips unknown fields automatically. |
| SHA-256 hashing of email and refresh tokens | Raw verification, reset, and refresh tokens are never stored — only their hashes. Limits damage if the database is compromised. |
| Same forgot-password response for all emails | Prevents email enumeration attacks. |
| Layered rate limiting | Route-specific limiters sit behind a global auth ceiling for defense in depth. |

---

## Standard Response Format

Most endpoints return JSON. There are **three distinct JSON response shapes**; the exceptions
are rate-limit responses (plain text) and browser redirects (`verify-email` and OAuth).

### Success Response

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": { }
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Always `true` |
| `message` | `string` | Human-readable status |
| `data` | `object \| null` | Response payload |

### Error Response

```json
{
  "success": false,
  "message": "User not found",
  "error": "User not found"
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Always `false` |
| `message` | `string` | Human-readable error |
| `error` | `string` | Same as `message` (duplicated for convenience) |

### Validation Error Response

Returned by the Zod validation middleware when the request body fails schema validation.

```json
{
  "errors": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["email"],
      "message": "Required"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `errors` | `ZodIssue[]` | Array of validation issues |

Each issue conforms to the [Zod `ZodIssue`](https://zod.dev/ERROR_HANDLING) specification. Notable fields: `code`, `path`, `message`, `expected`, `received`.

### HTTP Status Codes

| Code | When |
|---|---|
| `200` | Success |
| `201` | Resource created (register) |
| `302` | Redirect (email verification) |
| `400` | Validation error or business logic error |
| `401` | Unauthorized or unverified email |
| `404` | Resource not found |
| `429` | Rate limited |
| `500` | Internal server error |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `"3000"` | Server listen port |
| `MONGO_URI` | **Yes** | — | MongoDB connection string |
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWTs |
| `CLIENT_URL` | **Yes** | — | Frontend URL, e.g. `http://localhost:5173` (used for redirects) |
| `BACKEND_URL` | **Yes** | — | Public API origin, e.g. `http://localhost:3000` (email links and OAuth callbacks) |
| `NODE_ENV` | **Yes** | — | `development` or `production`; the app throws on startup if unset |
| `CORS_ORIGIN` | **Yes** | — | Allowed CORS origin, e.g. `http://localhost:5173`; must match the frontend |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | No | — | Enables Google OAuth when both are set |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | No | — | Enables GitHub OAuth when both are set |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | No | Ethereal | Production email; without `SMTP_HOST`, Ethereal is used |

> The effective env file is `apps/api/.env` for Turbo-run commands (`pnpm start`, `pnpm dev`). A root `.env` is not loaded by those commands.

---

## Rate Limiting

The API uses **layered rate limiting**. Each request to a protected route passes through a global rate limiter and then a route-specific limiter. The tighter limit governs.

| Limiter | Window | Max Requests | Applies To |
|---|---|---|---|
| `authLimiter` | 15 min | 20 | All `/api/auth/*`, including OAuth |
| `loginLimiter` | 15 min | 5 | `POST /api/auth/login` |
| `registerLimiter` | 60 min | 3 | `POST /api/auth` |
| `forgotLimiter` | 60 min | 3 | `POST /api/auth/forgot-password` |
| `refreshLimiter` | 15 min | 10 | `POST /api/auth/refresh` |
| `verifyEmailLimiter` | 15 min | 10 | `GET /api/auth/verify-email/:token` |
| `resetPasswordLimiter` | 15 min | 5 | `POST /api/auth/reset-password/:token` |
| `logoutLimiter` | 15 min | 20 | `POST /api/auth/logout` |
| `oauthLimiter` | 15 min | 10 | All OAuth routes (`/api/auth/google*`, `/api/auth/github*`) |
| `profileLimiter` | 15 min | 50 | All `/api/profile/*` |
| `profileUpdateLimiter` | 15 min | 50 | `PUT /api/profile/me` and `POST /api/profile/me/change-password` |
| `healthLimiter` | 1 min | 30 | `GET /api/health` |

All limiter options are defined in `apps/api/src/config/rate-limiters.ts` (`healthLimiter` is inline
in `health.routes.ts`). The API trusts the first proxy hop, so limits and audit IPs use the
forwarded client address.

**Rate limit response** (HTTP 429, plain text):

```text
Too many authentication attempts, please try again later.
```

> The rate limit response does **not** follow the standard `ApiResponse` envelope. It is the
> default plain-text body from `express-rate-limit`.

---

## Authentication

### How It Works

1. User registers → password is bcrypt-hashed, user document created, verification email sent.
2. User verifies email → `isVerified` set to `true`, login unblocked.
3. User logs in → credentials validated, JWT signed, stored in an **httpOnly cookie** named `token`.
4. Authenticated requests → `authMiddleware` reads `req.cookies.token`, verifies the JWT, attaches the decoded payload to `req.user`.
5. Logout → the presented refresh token is deleted and both auth cookies are cleared.

### Cookie Configuration

#### Access Token (`token`)

| Property | Value |
|---|---|
| Name | `token` |
| `httpOnly` | `true` |
| `secure` | `true` when `NODE_ENV === 'production'`, else `false` |
| `sameSite` | `"strict"` (standard auth) or `"lax"` (OAuth) |
| `maxAge` | `900000` ms (15 minutes) |

#### Refresh Token (`refreshToken`)

| Property | Value |
|---|---|
| Name | `refreshToken` |
| `httpOnly` | `true` |
| `secure` | `true` when `NODE_ENV === 'production'`, else `false` |
| `sameSite` | `"strict"` (standard auth) or `"lax"` (OAuth) |
| `path` | `/api/auth` |
| `maxAge` | `604800000` ms (7 days) |

The refresh token cookie is scoped to `/api/auth` so it is sent on any auth-related request. It stores a SHA-256 hash of the raw token. Tokens are rotated on each use — the old token is atomically marked as consumed and a new token in the same family is created. Replay of a consumed token revokes the entire token family and returns `401`. Expired tokens are also rejected with `401`.

### JWT Payload

```json
{
  "id": "664f1a2b3c4d5e6f7a8b9c0d",
  "email": "user@example.com",
  "username": "johndoe",
  "tokenType": "access",
  "iat": 1718000000,
  "exp": 1718000900
}
```

### Auth Middleware Behavior

- **No cookie** → `401 { success: false, message: "Unauthorized", error: "Unauthorized" }`
- **Invalid / expired / non-access cookie** → `401 { success: false, message: "Invalid token", error: "Invalid token" }`
- **Valid cookie** → `req.user` is populated, request proceeds.

---

## Authentication Endpoints

---

### POST /api/auth — Register

Create a new user account. Sends a verification email to the provided address. Login is blocked until the email is verified.

```http
POST /api/auth
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + Register-specific (3/60min)  
**Middleware chain:** `authLimiter` → `registerLimiter` → `validate(registerSchema)` → `controllers.register`

#### Request Body

```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePass1",
  "bio": "Full-stack developer",
  "phoneNumber": "1234567890",
  "gender": "male"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `username` | `string` | Yes | 3–30 characters |
| `email` | `string` (email) | Yes | Valid email format |
| `password` | `string` | Yes | Min 8 chars, must contain ≥1 uppercase letter, ≥1 digit |
| `bio` | `string` | No | 3–200 characters |
| `phoneNumber` | `string` | No | 10–15 digits |
| `gender` | `"male" \| "female" \| "other"` | No | Must be one of the enum values |

#### Example

```bash
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "SecurePass1"
  }'
```

#### Success Response

**HTTP 201**

```json
{
  "success": true,
  "message": "User registered successfully. Verify your email first.",
  "data": {}
}
```

#### Error Responses

| Status | Body |
|---|---|
| `400` | `{ "success": false, "message": "User already exists", "error": "User already exists" }` |
| `400` | `{ "errors": [ ...ZodIssue[] ] }` — validation failure |
| `429` | Rate limited |
| `500` | `{ "success": false, "message": "Failed to send verification email. Please try again.", "error": "..." }` |
| `500` | `{ "success": false, "message": "Internal server error", "error": "Internal server error" }` |

#### Notes

- Username and email are both **unique**. A conflict on either triggers "User already exists".
- The raw verification token is emailed. The database stores a **SHA-256 hash** of the token. The token expires after **24 hours**.
- If the verification email cannot be sent, the new user is deleted and the API returns `500 Failed to send verification email. Please try again.`

---

### POST /api/auth/login — Login

Authenticate with email **or** username. Sets the JWT httpOnly cookie on success.

```
POST /api/auth/login
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + Login-specific (5/15min)  
**Middleware chain:** `authLimiter` → `loginLimiter` → `validate(loginSchema)` → `controllers.login`

#### Request Body

```json
{
  "email": "john@example.com",
  "password": "SecurePass1"
}
```

Or with username instead of email:

```json
{
  "username": "johndoe",
  "password": "SecurePass1"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `email` | `string` (email) | No* | At least one of `email` or `username` must be present |
| `username` | `string` | No* | At least one of `email` or `username` must be present |
| `password` | `string` | Yes | Min 1 character |

#### Example

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass1"
  }'
```

#### Success Response

**HTTP 200** — also sets cookie `token` (httpOnly, sameSite=strict, 15-minute expiry)

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "user": {
      "_id": "664f1a2b3c4d5e6f7a8b9c0d",
      "username": "johndoe",
      "email": "john@example.com",
      "bio": null,
      "phoneNumber": null,
      "gender": null,
      "isVerified": true,
      "verificationToken": null,
      "verificationTokenExpires": null,
      "resetPasswordToken": null,
      "resetPasswordExpires": null,
      "createdAt": "2026-06-18T10:00:00.000Z",
      "updatedAt": "2026-06-18T10:00:00.000Z"
    }
  }
}
```

> The `password` field is always excluded from API responses.

#### Error Responses

| Status | Body |
|---|---|
| `400` | `{ "errors": [ ...ZodIssue[] ] }` — validation failure |
| `401` | `{ "success": false, "message": "Please verify your email first", "error": "..." }` |
| `401` | `{ "success": false, "message": "Invalid credentials", "error": "..." }` |
| `401` | `{ "success": false, "message": "Account locked due to too many failed login attempts. Please try again later.", "error": "..." }` |
| `400` | `{ "success": false, "message": "This account uses google login. Please sign in with google.", "error": "..." }` |
| `429` | Rate limited |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- Email verification is **required** before login. Unverified accounts receive `401`.
- The login-specific rate limiter (5 requests per 15 minutes) is tighter than the global auth limiter.

---

### POST /api/auth/logout — Logout

Deletes the presented refresh token (if any) and clears both the `token` and `refreshToken`
cookies. Requires a valid access-token cookie.

```
POST /api/auth/logout
```

**Auth required:** Yes  
**Rate limiting:** Global (20/15min) + Logout-specific (20/15min)  
**Middleware chain:** `authLimiter` → `logoutLimiter` → `authMiddleware` → `controllers.logout`

#### Request Body

None.

#### Example

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Cookie: token=<your-jwt>"
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null
}
```

#### Error Responses

| Status | Body |
|---|---|
| `401` | `{ "success": false, "message": "Unauthorized", "error": "Unauthorized" }` |
| `401` | `{ "success": false, "message": "Invalid token", "error": "Invalid token" }` |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

---

### POST /api/auth/refresh — Refresh Token

Exchange a valid refresh token for a new access token and a rotated refresh token. The old refresh token is atomically marked as consumed; a new one in the same family is issued.

```http
POST /api/auth/refresh
```

**Auth required:** No (uses `refreshToken` cookie instead of `token` cookie)  
**Rate limiting:** Global (20/15min) + Refresh-specific (10/15min)  
**Middleware chain:** `authLimiter` → `refreshLimiter` → `controllers.refresh`

#### Request Body

None.

#### Example

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Cookie: refreshToken=<raw-token>"
```

#### Success Response

**HTTP 200** — also sets new `token` (access) and `refreshToken` cookies

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": null
}
```

#### Error Responses

| Status | Body |
|---|---|
| `401` | `{ "success": false, "message": "Refresh token not found", "error": "..." }` |
| `401` | `{ "success": false, "message": "Invalid refresh token", "error": "..." }` |
| `401` | `{ "success": false, "message": "Refresh token reuse detected. All sessions revoked.", "error": "..." }` |
| `401` | `{ "success": false, "message": "Refresh token expired", "error": "..." }` |
| `401` | `{ "success": false, "message": "User not found", "error": "..." }` |
| `429` | Rate limited |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- The refresh token cookie must be present and valid. It is **not** the `token` cookie.
- Refresh token rotation is atomic — concurrent reuse of the same token is safe (only one request succeeds; the rest see `"Refresh token reuse detected. All sessions revoked."` and the entire token family is invalidated).
- Expired tokens are explicitly rejected with a distinct error message.
- The new `token` cookie is set (15m expiry) along with the rotated `refreshToken` cookie (7 days).

---

### GET /api/auth/verify-email/:token — Verify Email

Verify a user's email address. This is the **only endpoint that returns a redirect** rather than JSON. Users arrive here via the link in their verification email.

```
GET /api/auth/verify-email/:token
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + Verify-specific (10/15min)  
**Middleware chain:** `authLimiter` → `verifyEmailLimiter` → `controllers.verifyEmail`

#### Path Parameters

| Param | Type | Description |
|---|---|---|
| `token` | `string` | 64-character hex token from verification email |

#### Example

```bash
curl -v http://localhost:3000/api/auth/verify-email/a1b2c3d4e5f6...
```

Note: Use `-L` with curl to follow the redirect, or `-v` to inspect the `Location` header.

#### Success Behavior

Redirects to `{CLIENT_URL}/login?verified=true` (HTTP 302).

#### Failure Behavior

Redirects to `{CLIENT_URL}/login?verified=false` (HTTP 302). This includes both invalid/expired tokens **and** internal server errors.

#### Notes

- This endpoint does **not** return JSON under any circumstances. It always redirects.
- The raw token from the URL is SHA-256 hashed before the database lookup.
- Tokens expire **24 hours** after registration.
- The frontend should read the `?verified` query parameter and display an appropriate message.

---

### POST /api/auth/forgot-password — Forgot Password

Sends a password reset email if the account exists. Returns the same response regardless of whether the email is found (prevents email enumeration).

```
POST /api/auth/forgot-password
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + Forgot-specific (3/60min)  
**Middleware chain:** `authLimiter` → `forgotLimiter` → `validate(passwordForgotSchema)` → `controllers.forgotPassword`

#### Request Body

```json
{
  "email": "john@example.com"
}
```

| Field | Type | Required |
|---|---|---|
| `email` | `string` (email) | Yes |

#### Example

```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'
```

#### Success Response

**HTTP 200** — identical response whether the email exists or not

```json
{
  "success": true,
  "message": "If an account exists, a password reset link has been sent",
  "data": null
}
```

#### Error Responses

| Status | Body |
|---|---|
| `400` | `{ "errors": [ ...ZodIssue[] ] }` — validation failure |
| `429` | Rate limited |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- The **same success message** is returned even when no account matches the email. This prevents attackers from probing which emails are registered.
- Reset tokens expire after **1 hour**.
- The raw token is SHA-256 hashed before storage.

---

### POST /api/auth/reset-password/:token — Reset Password

Reset a user's password using the token from the reset email.

```
POST /api/auth/reset-password/:token
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + Reset-specific (5/15min)  
**Middleware chain:** `authLimiter` → `resetPasswordLimiter` → `validate(passwordResetSchema)` → `controllers.resetPassword`

#### Path Parameters

| Param | Type | Description |
|---|---|---|
| `token` | `string` | 64-character hex token from reset email |

#### Request Body

```json
{
  "password": "NewSecurePass1"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `password` | `string` | Yes | Min 8 chars, must contain ≥1 uppercase letter, ≥1 digit |

#### Example

```bash
curl -X POST http://localhost:3000/api/auth/reset-password/a1b2c3d4e5f6... \
  -H "Content-Type: application/json" \
  -d '{"password": "NewSecurePass1"}'
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Password reset successfully",
  "data": null
}
```

#### Error Responses

| Status | Body |
|---|---|
| `400` | `{ "errors": [ ...ZodIssue[] ] }` — validation failure |
| `400` | `{ "success": false, "message": "Invalid or expired token", "error": "Invalid or expired token" }` |
| `429` | Rate limited |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- The raw token from the URL is SHA-256 hashed before the database lookup.
- After a successful reset, the `resetPasswordToken` and `resetPasswordExpires` fields are nullified and all refresh tokens for the user are revoked.
- Login attempts and any active lockout are reset.
- Multiple resets with the same token are not possible — the token is a one-time use.

---

## OAuth Endpoints

OAuth authentication is handled via Passport.js with Google and GitHub strategies. The flow follows the standard OAuth 2.0 Authorization Code grant.

### How It Works

1. Frontend redirects the user to `/api/auth/google` or `/api/auth/github`.
2. The user authorizes on the provider's consent screen.
3. The provider redirects back to your callback URL with an authorization code.
4. The server exchanges the code for an access token, fetches the user's profile, and creates or links an account.
5. The server sets the JWT cookies and redirects to `{CLIENT_URL}/auth/callback`.

> If an existing account matches by email, it is linked and `provider` becomes `google` or `github`.
> That account can then no longer use password login or change-password.

### State Parameter (CSRF Protection)

A cryptographically random `oauth_state` value is generated on each OAuth initiation, stored as an httpOnly cookie (`oauth_state`) with a 10-minute lifetime, and verified on callback. A mismatch results in a redirect to `{CLIENT_URL}/login?error=oauth_state_mismatch`.

---

### GET /api/auth/google — Initiate Google OAuth

Redirects the user to Google's consent screen.

```http
GET /api/auth/google
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + OAuth-specific (10/15min)

#### Example

```bash
# Open in browser — this initiates a redirect
http://localhost:3000/api/auth/google
```

#### Success Behavior

Redirects to Google's OAuth consent screen.

#### Error Behavior

If rate limited — `429` with the default plain-text `express-rate-limit` body.

---

### GET /api/auth/google/callback — Google OAuth Callback

Handles the callback from Google after user authorization.

```http
GET /api/auth/google/callback?code=<authorization-code>&state=<state>
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + OAuth-specific (10/15min)

#### Query Parameters

| Param | Type | Description |
|---|---|---|
| `code` | `string` | Authorization code from Google |
| `state` | `string` | State parameter for CSRF validation (must match cookie) |

#### Success Behavior

Redirects to `{CLIENT_URL}/auth/callback` with JWT cookies set.

#### Error Behavior

- State mismatch → redirects to `{CLIENT_URL}/login?error=oauth_state_mismatch`
- Google auth failure → redirects to `{CLIENT_URL}/login?error=google_auth_failed`
- Server error → redirects to `{CLIENT_URL}/login?error=oauth_failed`

---

### GET /api/auth/github — Initiate GitHub OAuth

Redirects the user to GitHub's authorization screen.

```http
GET /api/auth/github
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + OAuth-specific (10/15min)

#### Example

```bash
http://localhost:3000/api/auth/github
```

#### Success Behavior

Redirects to GitHub's authorization screen.

---

### GET /api/auth/github/callback — GitHub OAuth Callback

Handles the callback from GitHub after user authorization.

```http
GET /api/auth/github/callback?code=<authorization-code>&state=<state>
```

**Auth required:** No  
**Rate limiting:** Global (20/15min) + OAuth-specific (10/15min)

#### Success Behavior

Redirects to `{CLIENT_URL}/auth/callback` with JWT cookies set.

#### Error Behavior

- State mismatch → redirects to `{CLIENT_URL}/login?error=oauth_state_mismatch`
- GitHub auth failure → redirects to `{CLIENT_URL}/login?error=github_auth_failed`
- Server error → redirects to `{CLIENT_URL}/login?error=oauth_failed`

---

## Profile Endpoints

All profile endpoints require the JWT cookie (`token`) to be present and valid.

---

### GET /api/profile/me — Get Profile

Returns the authenticated user's profile.

```
GET /api/profile/me
```

**Auth required:** Yes  
**Rate limiting:** Global (50/15min)  
**Middleware chain:** `profileLimiter` → `authMiddleware` → `controllers.getProfile`

#### Example

```bash
curl http://localhost:3000/api/profile/me \
  -H "Cookie: token=<your-jwt>"
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Profile fetched successfully",
  "data": {
    "_id": "664f1a2b3c4d5e6f7a8b9c0d",
    "username": "johndoe",
    "email": "john@example.com",
    "bio": "Full-stack developer",
    "phoneNumber": "1234567890",
    "gender": "male",
    "isVerified": true,
    "verificationToken": null,
    "verificationTokenExpires": null,
    "resetPasswordToken": null,
    "resetPasswordExpires": null,
    "provider": "local",
    "avatar": null,
    "createdAt": "2026-06-18T10:00:00.000Z",
    "updatedAt": "2026-06-18T10:00:00.000Z"
  }
}
```

#### Error Responses

| Status | Body |
|---|---|
| `401` | `{ "success": false, "message": "Unauthorized", "error": "..." }` or `"Invalid token"` |
| `404` | `{ "success": false, "message": "User not found", "error": "User not found" }` |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

---

### PUT /api/profile/me — Update Profile

Update one or more profile fields. Only the fields included in the request body are updated.

```
PUT /api/profile/me
```

**Auth required:** Yes  
**Rate limiting:** Global (50/15min) + Profile update (50/15min)  
**Middleware chain:** `profileLimiter` → `authMiddleware` → `profileUpdateLimiter` → `validate(profileSchema)` → `controllers.updateProfile`

#### Request Body

```json
{
  "username": "johndoe_new",
  "bio": "Updated bio text",
  "phoneNumber": "9876543210",
  "gender": "other"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `username` | `string` | No | 3–30 characters |
| `bio` | `string` | No | 3–200 characters |
| `phoneNumber` | `string` | No | 10–15 digits |
| `gender` | `"male" \| "female" \| "other"` | No | Not nullable through this endpoint |

#### Example

```bash
curl -X PUT http://localhost:3000/api/profile/me \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<your-jwt>" \
  -d '{"bio": "Senior software engineer"}'
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "_id": "664f1a2b3c4d5e6f7a8b9c0d",
    "username": "johndoe",
    "email": "john@example.com",
    "bio": "Senior software engineer",
    "phoneNumber": null,
    "gender": null,
    "isVerified": true,
    "verificationToken": null,
    "verificationTokenExpires": null,
    "resetPasswordToken": null,
    "resetPasswordExpires": null,
    "createdAt": "2026-06-18T10:00:00.000Z",
    "updatedAt": "2026-06-18T10:01:00.000Z"
  }
}
```

#### Error Responses

| Status | Body |
|---|---|
| `400` | `{ "errors": [ ...ZodIssue[] ] }` — validation failure |
| `400` | `{ "success": false, "message": "{field} is already taken", "error": "..." }` — unique conflict |
| `401` | Unauthorized / Invalid token |
| `404` | `{ "success": false, "message": "User not found", "error": "..." }` |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Update semantics

- Omitted fields are left untouched. Zod strips unknown fields before the controller runs.
- `username` must be 3–30 characters; `bio` 3–200; `phoneNumber` 10–15 digits; `gender` must be
  `male`, `female`, or `other`.
- `gender` is not nullable through this endpoint (the Zod schema rejects `null`).
- Unique conflicts are reported as `400 {field} is already taken`.

---

### DELETE /api/profile/me — Delete Account

Permanently deletes the authenticated user's account.

```
DELETE /api/profile/me
```

**Auth required:** Yes  
**Rate limiting:** Global (50/15min)  
**Middleware chain:** `profileLimiter` → `authMiddleware` → `controllers.deleteAccount`

#### Example

```bash
curl -X DELETE http://localhost:3000/api/profile/me \
  -H "Cookie: token=<your-jwt>"
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Account deleted successfully",
  "data": null
}
```

#### Error Responses

| Status | Body |
|---|---|
| `401` | Unauthorized / Invalid token |
| `404` | `{ "success": false, "message": "User not found", "error": "..." }` |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- This action is **irreversible**. The user document is removed, all refresh tokens for the user are deleted, and both auth cookies are cleared in the response.

---

### POST /api/profile/me/change-password — Change Password

Change the authenticated user's password. Requires the current password for verification.

```
POST /api/profile/me/change-password
```

**Auth required:** Yes  
**Rate limiting:** Global (50/15min) + Profile update (50/15min)  
**Middleware chain:** `profileLimiter` → `authMiddleware` → `profileUpdateLimiter` → `validate(passwordChangeSchema)` → `controllers.updatePassword`

#### Request Body

```json
{
  "currentPassword": "SecurePass1",
  "newPassword": "EvenMoreSecure2"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `currentPassword` | `string` | Yes | Min 1 character (must match the stored hash) |
| `newPassword` | `string` | Yes | Min 8 chars, must contain ≥1 uppercase letter, ≥1 digit |

#### Example

```bash
curl -X POST http://localhost:3000/api/profile/me/change-password \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<your-jwt>" \
  -d '{
    "currentPassword": "SecurePass1",
    "newPassword": "EvenMoreSecure2"
  }'
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Password updated successfully",
  "data": {
    "_id": "664f1a2b3c4d5e6f7a8b9c0d",
    "username": "johndoe",
    "email": "john@example.com",
    ...
  }
}
```

#### Error Responses

| Status | Body |
|---|---|
| `400` | `{ "errors": [ ...ZodIssue[] ] }` — validation failure |
| `400` | `{ "success": false, "message": "Current password is incorrect", "error": "..." }` |
| `400` | `{ "success": false, "message": "Cannot change password for social login accounts", "error": "..." }` |
| `401` | Unauthorized / Invalid token |
| `404` | `{ "success": false, "message": "User not found", "error": "..." }` |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- Passwords are hashed with bcrypt (10 rounds) and saved via `user.save()`. All refresh tokens for the user are revoked, and the returned user reflects the post-save document with `password` removed.
- Social-login accounts (`provider` not `local`) cannot change passwords; the API returns `400 Cannot change password for social login accounts`.

---

## Health Endpoint

### GET /api/health — Health Check

Returns the application and database health status. Useful for monitoring and load balancer health probes.

```http
GET /api/health
```

**Auth required:** No  
**Rate limiting:** Health-specific (30 per minute)

**Middleware chain:** `healthLimiter` → `controllers.healthCheck`

#### Example

```bash
curl http://localhost:3000/api/health
```

#### Success Response

**HTTP 200** (database connected)

```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "name": "cred",
    "version": "1.0.0",
    "environment": "development",
    "uptime": 3600,
    "memory": { "rss": 123456, "heapTotal": 65432, "heapUsed": 43210 },
    "nodeVersion": "v22.0.0",
    "platform": "linux",
    "database": {
      "status": "connected",
      "latency": 2
    },
    "timestamp": "2026-06-27T12:00:00.000Z"
  }
}
```

#### Degraded Response

**HTTP 503** (database disconnected)

```json
{
  "success": false,
  "message": "Service is degraded — database not connected",
  "error": "Service is degraded — database not connected",
  "data": {
    "name": "cred",
    "version": "1.0.0",
    "database": { "status": "disconnected", "latency": null },
    ...
  }
}
```

#### Error Response

**HTTP 500**

```json
{
  "success": false,
  "message": "Health check failed",
  "error": "Health check failed",
  "data": { ... }
}
```

#### Notes

- The `data` object is always included, even on error responses, so clients can always parse uptime/version.
- `database.latency` is the ping round-trip in milliseconds (null when slow or disconnected).
- If the ping exceeds 3 seconds, the database status is reported as `"slow"`.

---

## Session Audit Logging

Every authentication event (login, logout, refresh, OAuth, password operations, account deletion) is recorded as an audit log entry. Audit logs are visible to the authenticated user.

### GET /api/profile/me/audit-logs — Get Audit Logs

Returns paginated audit log entries for the current user.

```http
GET /api/profile/me/audit-logs
```

**Auth required:** Yes  
**Rate limiting:** Profile (50/15min)

**Middleware chain:** `profileLimiter` → `authMiddleware` → `controllers.getAuditLogs`

#### Query Parameters

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number (min 1) |
| `limit` | `number` | `20` | Items per page (1–100) |

#### Example

```bash
curl http://localhost:3000/api/profile/me/audit-logs?page=1&limit=10 \
  -H "Cookie: token=<your-jwt>"
```

#### Success Response

**HTTP 200**

```json
{
  "success": true,
  "message": "Audit logs fetched successfully",
  "data": {
    "logs": [
      {
        "_id": "664f1a2b...",
        "user": "664f1a2b...",
        "action": "login",
        "status": "success",
        "ip": "::1",
        "userAgent": "curl/8.0",
        "metadata": {},
        "createdAt": "2026-06-27T12:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "totalPages": 5
    }
  }
}
```

#### Error Responses

| Status | Body |
|---|---|
| `401` | Unauthorized / Invalid token |
| `500` | `{ "success": false, "message": "Internal server error", "error": "..." }` |

#### Notes

- Logs are sorted newest-first.
- Tracked actions: `register`, `login`, `logout`, `token_refresh`, `email_verification`, `password_reset_request`, `password_reset`, `oauth_login`, `profile_update`, `password_change`, `account_deletion`.
- Audit logging is fire-and-forget — a logging failure never breaks the request.

---

## Data Models

### User

| Field | Type | Required | Unique | Default | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | — | — | auto | MongoDB document ID |
| `username` | `string` | Yes | Yes | — | Display name (3–30 chars) |
| `email` | `string` | Yes | Yes | — | Email address |
| `password` | `string` | Conditional | No | — | bcrypt hash; required by a pre-save hook for `provider=local`; never returned in API responses |
| `bio` | `string` | No | No | — | Short biography |
| `phoneNumber` | `string` | No | No | — | Contact number |
| `gender` | `string` | No | No | — | `"male"`, `"female"`, or `"other"` |
| `isVerified` | `boolean` | No | No | `false` | Email verification status |
| `verificationToken` | `string \| null` | No | No | `null` | SHA-256 hash of email verification token |
| `verificationTokenExpires` | `Date \| null` | No | No | `null` | Expiry for verification token |
| `resetPasswordToken` | `string \| null` | No | No | `null` | SHA-256 hash of password reset token |
| `resetPasswordExpires` | `Date \| null` | No | No | `null` | Expiry for reset token |
| `provider` | `string` | No | No | `"local"` | `"local"`, `"google"`, or `"github"` |
| `googleId` | `string` | No | Sparse | — | Google profile ID when linked |
| `githubId` | `string` | No | Sparse | — | GitHub profile ID when linked |
| `avatar` | `string \| null` | No | No | `null` | Avatar URL from the OAuth provider |
| `loginAttempts` | `number` | No | No | `0` | Consecutive failed login count |
| `lockoutUntil` | `Date \| null` | No | No | `null` | Lockout expiry after repeated failures |
| `lastLogin` | `Date \| null` | No | No | `null` | Last successful login |
| `lastIp` | `string \| null` | No | No | `null` | Last successful login IP |
| `createdAt` | `Date` | — | — | auto | Via Mongoose `timestamps: true` |
| `updatedAt` | `Date` | — | — | auto | Via Mongoose `timestamps: true` |

### JWT Payload

| Field | Type | Description |
|---|---|---|
| `id` | `string` | User's MongoDB `_id` |
| `email` | `string` | User's email address |
| `username` | `string` | User's username |
| `tokenType` | `"access"` | Access-token discriminator; refresh tokens are rejected by `authMiddleware` |
| `iat` | `number` | Issued at (Unix timestamp) |
| `exp` | `number` | Expiry (Unix timestamp, 15 minutes from `iat`) |

---

## Error Reference

Every possible error message grouped by endpoint.

| Endpoint | Status | `message` / `error` |
|---|---|---|
| `POST /api/auth` | 400 | `"User already exists"` |
| `POST /api/auth` | 500 | `"Failed to send verification email. Please try again."` / `"Internal server error"` |
| `POST /api/auth/login` | 401 | `"Please verify your email first"` |
| `POST /api/auth/login` | 401 | `"Invalid credentials"` |
| `POST /api/auth/login` | 401 | `"Account locked due to too many failed login attempts. Please try again later."` |
| `POST /api/auth/login` | 400 | `"This account uses {provider} login. Please sign in with {provider}."` |
| `POST /api/auth/login` | 500 | `"Internal server error"` |
| `POST /api/auth/logout` | 401 | `"Unauthorized"` |
| `POST /api/auth/logout` | 401 | `"Invalid token"` |
| `POST /api/auth/logout` | 500 | `"Internal server error"` |
| `POST /api/auth/refresh` | 401 | `"Refresh token not found"` |
| `POST /api/auth/refresh` | 401 | `"Invalid refresh token"` |
| `POST /api/auth/refresh` | 401 | `"Refresh token reuse detected. All sessions revoked."` |
| `POST /api/auth/refresh` | 401 | `"Refresh token expired"` |
| `POST /api/auth/refresh` | 401 | `"User not found"` |
| `POST /api/auth/refresh` | 500 | `"Internal server error"` |
| `POST /api/auth/forgot-password` | 500 | `"Internal server error"` |
| `POST /api/auth/reset-password/:token` | 400 | `"Invalid or expired token"` |
| `POST /api/auth/reset-password/:token` | 500 | `"Internal server error"` |
| `GET /api/profile/me` | 404 | `"User not found"` |
| `GET /api/profile/me` | 500 | `"Internal server error"` |
| `PUT /api/profile/me` | 400 | `"{field} is already taken"` |
| `PUT /api/profile/me` | 404 | `"User not found"` |
| `PUT /api/profile/me` | 500 | `"Internal server error"` |
| `DELETE /api/profile/me` | 404 | `"User not found"` |
| `DELETE /api/profile/me` | 500 | `"Internal server error"` |
| `POST /api/profile/me/change-password` | 400 | `"Current password is incorrect"` |
| `POST /api/profile/me/change-password` | 400 | `"Cannot change password for social login accounts"` |
| `POST /api/profile/me/change-password` | 404 | `"User not found"` |
| `POST /api/profile/me/change-password` | 500 | `"Internal server error"` |
| `GET /api/profile/me/audit-logs` | 500 | `"Internal server error"` |
| `GET /api/health` | 503 | `"Service is degraded — database not connected"` |
| `GET /api/health` | 500 | `"Health check failed"` |

Additionally, any endpoint with Zod validation can return `400` with `{ "errors": [ ...ZodIssue[] ] }`.

---

## Security Considerations

| Practice | Implementation |
|---|---|
| **Password hashing** | bcrypt with 10 salt rounds at registration, password reset, and password change |
| **Token hashing** | Email verification, password reset, and refresh tokens are hashed with SHA-256 before database storage. Raw tokens are only sent to the client. |
| **httpOnly cookies** | The JWT and refresh token are inaccessible to JavaScript, mitigating XSS-based token theft. |
| **sameSite cookies** | `strict` for normal auth flows; `lax` only where OAuth redirects require it. |
| **Secure flag in production** | The cookie is only transmitted over HTTPS when `NODE_ENV=production`. |
| **No email enumeration** | `forgot-password` returns the same response whether or not the email exists. |
| **Input validation** | All request bodies are parsed and validated by Zod schemas. Unknown fields are stripped. Type coercion is prevented by Zod 4's strict parsing. |
| **Rate limiting** | Every endpoint has at least one rate limiter to mitigate brute-force and DoS attacks. Login is limited to 5 attempts per 15 minutes. Registration and forgot-password are limited to 3 per 60 minutes. |
| **Password excluded from responses** | The `password` field is destructured out via `toObject()` in every response. |
| **CORS** | Configured with `CORS_ORIGIN` and `credentials: true`; set it to the exact frontend origin. |

---

## Email System

### Development (Ethereal)

In development, the API uses **Ethereal** — a fake SMTP service by the nodemailer team. A test email account is automatically created on the first email send.

```bash
# Example console output
Message sent: <abc123@ethereal.email>
Preview URL: https://ethereal.email/message/abc123
```

The `Preview URL` is logged to the console for every email sent. Open it in a browser to view the rendered email.

### Production

Set `SMTP_HOST` and the related variables; `email.helpers.ts` selects SMTP automatically and falls
back to Ethereal only when `SMTP_HOST` is absent. No code change is required.

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-user
SMTP_PASS=your-password
SMTP_FROM=noreply@example.com
```

### Email Templates

| Template | Trigger | Link Expiry |
|---|---|---|
| `emailVerification` | `POST /api/auth` (register) | 24 hours |
| `passwordReset` | `POST /api/auth/forgot-password` | 1 hour |

Both templates are minimal HTML strings in `src/templates/email.templates.ts`. Customize them as needed.

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Create the env file used by Turbo scripts
cp apps/api/.env.example apps/api/.env

# Minimum required values
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb://localhost:27017/auth
JWT_SECRET=your-secret-key
CLIENT_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:5173

# Build and start (the current `pnpm dev` script is broken; see AGENTS.md)
pnpm build
pnpm start
```

The server starts on `http://localhost:3000`. Verify it's running:

```bash
curl http://localhost:3000/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

Expect a `401` with `Invalid credentials` (no user exists yet) — this confirms the API is live.

---

*Documentation generated from source analysis. For questions or issues, please open a ticket in the project repository.*
