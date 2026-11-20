# Cred API Testing Application — Product Requirements Document

**Version:** 1.0.0  
**Status:** Draft  
**Last updated:** 2026-06-28

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Scope](#2-product-scope)
3. [Technical Architecture](#3-technical-architecture)
4. [Functional Requirements](#4-functional-requirements)
   - 4.1 Health Check Module
   - 4.2 Authentication Module
   - 4.3 Profile Module
   - 4.4 OAuth Module
   - 4.5 Email Verification Flow
   - 4.6 Password Reset Flow
   - 4.7 Audit Log Viewer
   - 4.8 Session & Cookie Inspector
   - 4.9 Rate Limiting Test Harness
5. [Data Flow Specifications](#5-data-flow-specifications)
6. [Error Handling & Edge Cases](#6-error-handling--edge-cases)
7. [Implementation Order](#7-implementation-order)

---

## 1. Executive Summary

This is a **backend API testing application** for the **Cred** authentication service. Cred is a drop-in auth API (Express 5 / Mongoose 9 / TypeScript 6) that provides registration, login, OAuth (Google + GitHub), email verification, password reset, profile management, session audit logging, and rate limiting.

This testing application validates **every Cred API endpoint** through a structured manual testing interface. It is *not* an automated test suite — it is an interactive tool that lets developers and QA engineers execute real API calls against a running Cred instance, inspect full request/response details, and verify correct behavior across all states (success, validation errors, auth failures, rate limiting, OAuth redirects, token rotation, and edge cases).

The app manages browser-based authentication state entirely via httpOnly cookies (mirroring how a real frontend would interact with Cred), supporting the full JWT lifecycle including refresh token rotation, cookie scoping, same-site policies, and OAuth state parameter CSRF protection.

---

## 2. Product Scope

### In Scope

- A Next.js 16 application that lives alongside the Cred backend
- Interactive testing interfaces for every Cred API endpoint
- Real httpOnly cookie-based authentication management
- Full OAuth flow simulation (initiate redirect and handle callback)
- Email verification and password reset flow testing via Ethereal preview URLs
- Audit log inspection and pagination testing
- Rate limiter behavior observation
- Request/response inspection (status codes, headers, cookies, body)
- Environment configuration management (target backend URL)

### Out of Scope

- Automated CI/CD test suites (Cred's own Jest/supertest suite covers that)
- Production authentication service
- User management or CRUD for the testing app itself
- Performance or load testing
- The Cred API source code itself
- UI design system or branding

---

## 3. Technical Architecture

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router) |
| Language | TypeScript 5 |
| UI Components | shadcn/ui (radix-nova), Tailwind CSS v4 |
| State Management | React hooks + Next.js search params |
| HTTP Client | Fetch API (native) |
| Fonts | Geist (sans), Geist Mono, Roboto Slab (serif) |
| Package Manager | pnpm |
| Linting | ESLint v9 (flat config) |
| Formatting | Prettier (no semicolons, double quotes, trailing commas) |
| Path Alias | `@/*` → project root |

### Authentication Model

The app uses the browser's native cookie store for all authenticated requests. It does **not** manage JWT tokens in JavaScript memory or localStorage. Instead:

- Login calls `POST /api/auth/login` → the browser stores the `token` and `refreshToken` httpOnly cookies automatically
- All subsequent fetches to `*.api-domain.*` include cookies via `credentials: "include"` and `sameSite` handling
- Logout calls `POST /api/auth/logout` → cookies are cleared server-side
- Token refresh calls `POST /api/auth/refresh` → cookies are rotated silently
- OAuth flows are initiated via browser navigation (not fetch) so cookies are properly handled for state parameter verification

### Key Design Decision: Cookie Relay Architecture

Because the testing app runs on a different origin than the Cred API (e.g., `localhost:5173` vs `localhost:3000`), it requires a **CORS-compatible setup**. The testing app must:
1. Use `credentials: "include"` on all fetch requests
2. Ensure the Cred backend includes the testing app's origin in its CORS configuration (`CORS_ORIGIN`)
3. Handle the fact that `sameSite: "strict"` cookies won't be sent on cross-origin fetches — the testing app must communicate this requirement to the user or use a proxy

---

## 4. Functional Requirements

### 4.1 Health Check Module

**Purpose:** Verify the Cred API is reachable and the database connection is healthy.

**Endpoint:** `GET /api/health`

#### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| API is running, DB connected | HTTP 200, `success: true`, `database.status === "connected"`, `latency` is a number |
| DB disconnected | HTTP 503, `database.status === "disconnected"`, `latency === null` |
| Server error | HTTP 500, `success: false` |

#### Required Features

- Execute health check against configurable backend URL
- Display full response payload including `name`, `version`, `environment`, `uptime`, `memory`, `nodeVersion`, `platform`, `database.status`, `database.latency`, `timestamp`
- Color-coded status badge (green for connected, yellow for slow, red for disconnected)
- Show response headers (rate limit info via `RateLimit-*` headers if present)
- One-click "Refresh Health" action

### 4.2 Authentication Module

**Purpose:** Test the complete auth lifecycle — register, verify email, login, refresh token, logout.

#### 4.2.1 Register

**Endpoint:** `POST /api/auth`

**Rate limits:** Global 20/15min + Register 3/60min

##### Input Fields

| Field | Type | Required | Validation Rule |
|---|---|---|---|
| `username` | string | Yes | 3–30 characters |
| `email` | string (email) | Yes | Valid email format |
| `password` | string | Yes | Min 8 chars, ≥1 uppercase, ≥1 digit |
| `bio` | string | No | Free text |
| `phoneNumber` | string | No | Free text |
| `gender` | enum | No | `"male"` \| `"female"` \| `"other"` |

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Valid registration with all fields | HTTP 201, `success: true`, message about email verification |
| Valid registration with minimal fields (username, email, password) | HTTP 201 |
| Duplicate email | HTTP 400, `"User already exists"` |
| Duplicate username | HTTP 400, `"User already exists"` |
| Missing required field (e.g., no email) | HTTP 400, Zod validation error array |
| Invalid email format | HTTP 400, Zod validation error |
| Password too short (< 8 chars) | HTTP 400, Zod validation error |
| Password missing uppercase | HTTP 400, Zod validation error |
| Password missing digit | HTTP 400, Zod validation error |
| Username too short (< 3 chars) | HTTP 400, Zod validation error |
| Username too long (> 30 chars) | HTTP 400, Zod validation error |
| Invalid gender value | HTTP 400, Zod validation error |
| Rate limit exceeded | HTTP 429 after 3 registrations within 60 minutes |
| Server error scenario | HTTP 500 |

##### Required Features

- Form with all fields, live validation hints
- Display Zod validation error array when present (show each `path`, `message`, `code`)
- Display standard API error envelope when present
- Capture and display the Ethereal email preview URL from the server console (user must copy it manually or app provides a note)
- Track rate limit state across calls

#### 4.2.2 Login

**Endpoint:** `POST /api/auth/login`

**Rate limits:** Global 20/15min + Login 5/15min

##### Input Fields

| Field | Type | Required |
|---|---|---|
| `email` | string | At least one of email/username |
| `username` | string | At least one of email/username |
| `password` | string | Yes |

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Valid login with email | HTTP 200, `token` cookie set, user data returned |
| Valid login with username | HTTP 200, `token` cookie set |
| Valid login after email verification | HTTP 200 |
| Login before email verification | HTTP 401, `"Please verify your email first"` |
| Invalid password | HTTP 401, `"Invalid password"` |
| Non-existent user (by email) | HTTP 404, `"User not found"` |
| Non-existent user (by username) | HTTP 404, `"User not found"` |
| Missing both email and username | HTTP 400, Zod validation error |
| Missing password | HTTP 400, Zod validation error |
| Rate limited (6th attempt in 15 min) | HTTP 429 |

##### Required Features

- Toggle between email-based and username-based login
- After successful login, display:
  - The full user object from response `data.user`
  - Confirmation that cookies were set (note: cannot inspect httpOnly cookies from JS, but can verify auth state by calling GET /api/profile/me)
- "Verify Auth" button that calls `/api/profile/me` to confirm cookie is working
- Show remaining rate limit attempts if headers are available

#### 4.2.3 Logout

**Endpoint:** `POST /api/auth/logout`

**Rate limits:** Global 20/15min

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Logout with valid token cookie | HTTP 200, `success: true`, cookie cleared |
| Logout without token cookie | HTTP 401, `"Unauthorized"` |
| Logout with expired/invalid token | HTTP 401, `"Invalid token"` |
| Verify post-logout auth state | Calling `/api/profile/me` after logout should return 401 |

##### Required Features

- One-click logout button
- Display auth state before/after
- Auto-call profile endpoint after logout to verify

#### 4.2.4 Refresh Token

**Endpoint:** `POST /api/auth/refresh`

**Rate limits:** Global 20/15min + Refresh 10/15min

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Refresh with valid refreshToken cookie | HTTP 200, new `token` and `refreshToken` cookies set |
| Refresh without refreshToken cookie | HTTP 401, `"Refresh token not found"` |
| Refresh with expired refresh token | HTTP 401, `"Refresh token expired"` |
| Refresh with invalid refresh token | HTTP 401, `"Invalid refresh token"` |
| Refresh token reuse detection | HTTP 401, `"Refresh token reuse detected. All sessions revoked."` |
| Verify new tokens work post-refresh | Call `/api/profile/me` → should succeed |
| Verify old token fails post-refresh | The old access token cookie should be replaced on refresh response |

##### Required Features

- Button to execute refresh
- Show whether cookies were rotated (infer from successful response)
- "Verify Auth" button post-refresh
- Token reuse test flow:
  1. Login → capture cookies
  2. Refresh → new cookies set
  3. Attempt to use old refresh token → expect 401 with reuse detection message
  4. Verify the entire token family is revoked → attempt old access token → expect 401

### 4.3 Profile Module

**Purpose:** Test all profile CRUD operations and password changes.

#### 4.3.1 Get Profile

**Endpoint:** `GET /api/profile/me`

**Auth required:** Yes  
**Rate limits:** Global 50/15min

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Get profile with valid auth | HTTP 200, full user object |
| Get profile without auth | HTTP 401, `"Unauthorized"` |
| Get profile with invalid token | HTTP 401, `"Invalid token"` |
| User deleted mid-session (edge case) | HTTP 404, `"User not found"` |

##### Required Features

- Display all user fields: `_id`, `username`, `email`, `bio`, `phoneNumber`, `gender`, `isVerified`, `createdAt`, `updatedAt`
- Show auth status (authenticated vs not)
- Show which cookies are present (by name only, cannot read values)

#### 4.3.2 Update Profile

**Endpoint:** `PUT /api/profile/me`

**Auth required:** Yes  
**Rate limits:** Global 50/15min + Profile update 50/15min

##### Input Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `username` | string | No | 3–30 characters |
| `bio` | string | No | 3–200 characters |
| `phoneNumber` | string | No | 10–15 characters |
| `gender` | enum | No | `"male"` \| `"female"` \| `"other"` |

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Update single field (e.g., bio only) | HTTP 200, only bio updated |
| Update multiple fields | HTTP 200, all specified fields updated |
| Update username to existing username | HTTP 400, `"User already exists"` (if unique constraint enforced) |
| Invalid username length | HTTP 400, Zod validation error |
| Invalid bio length | HTTP 400, Zod validation error |
| Invalid gender value | HTTP 400, Zod validation error |
| Empty body (no fields to update) | Should fall through Zod validation, but controller skips all `if(value)` checks |
| Attempt to clear field by sending null/empty string | Known limitation: falsy values are skipped by controller |
| Update without auth | HTTP 401 |

##### Required Features

- Form pre-populated with current profile values from getProfile
- Show which fields changed in the response
- Display known limitation about falsy values

#### 4.3.3 Delete Account

**Endpoint:** `DELETE /api/profile/me`

**Auth required:** Yes  
**Rate limits:** Global 50/15min

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Delete account with valid auth | HTTP 200, `"Account deleted successfully"` |
| Verify post-deletion auth state | Calling any auth-required endpoint should return 401/404 |
| Attempt re-login with deleted account credentials | HTTP 404, `"User not found"` |
| Delete without auth | HTTP 401 |

##### Required Features

- Confirmation dialog before deletion (irreversible action)
- Post-deletion state verification
- Note that JWT cookie is not automatically cleared — app should call logout or note it

#### 4.3.4 Change Password

**Endpoint:** `POST /api/profile/me/change-password`

**Auth required:** Yes  
**Rate limits:** Global 50/15min + Profile update 50/15min

##### Input Fields

| Field | Type | Required | Validation |
|---|---|---|---|
| `currentPassword` | string | Yes | No min length (must match stored hash) |
| `newPassword` | string | Yes | Min 8 chars, ≥1 uppercase, ≥1 digit |

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Correct current password, valid new password | HTTP 200, `"Password updated successfully"` |
| Incorrect current password | HTTP 400, `"Current password is incorrect"` |
| New password too short | HTTP 400, Zod validation error |
| New password missing uppercase | HTTP 400, Zod validation error |
| New password missing digit | HTTP 400, Zod validation error |
| Verify new password works for login | Logout → login with new password → should succeed |
| Verify old password fails after change | Login with old password → should get 401 |
| Change without auth | HTTP 401 |

##### Required Features

- Two-password form with confirmation field (new password)
- Validation hints for new password requirements
- Post-change verification flow (logout → login with new password)
- Note about known limitation: response returns pre-update user object

### 4.4 OAuth Module

**Purpose:** Test Google and GitHub OAuth 2.0 Authorization Code grant flows, including initiation, callback, state parameter CSRF protection, and error handling.

#### Endpoints

- `GET /api/auth/google` — Initiate Google OAuth
- `GET /api/auth/google/callback` — Google OAuth callback
- `GET /api/auth/github` — Initiate GitHub OAuth
- `GET /api/auth/github/callback` — GitHub OAuth callback

#### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Initiate Google OAuth | Redirect to Google consent screen, `oauth_state` cookie set |
| Initiate GitHub OAuth | Redirect to GitHub authorization screen, `oauth_state` cookie set |
| Successful Google callback | Redirect to `{CLIENT_URL}/auth/callback` with JWT cookies set |
| Successful GitHub callback | Redirect to `{CLIENT_URL}/auth/callback` with JWT cookies set |
| State parameter mismatch | Redirect to `{CLIENT_URL}/login?error=oauth_state_mismatch` |
| Provider auth failure (user denies) | Redirect to `{CLIENT_URL}/login?error=google_auth_failed` or `github_auth_failed` |
| OAuth rate limited | HTTP 429 |
| OAuth for existing email | Auto-links account |

##### Required Features

- OAuth initiation buttons for Google and GitHub
- Because OAuth involves browser redirects (not fetch calls), the testing app must:
  - Open the OAuth initiation URL in the same browser window/ tab (or a new tab that the user can interact with)
  - After the full OAuth flow completes, the provider redirects to `{CLIENT_URL}/auth/callback`
  - The testing app must have a `/auth/callback` page that:
    - Receives the redirect with cookies set
    - Reads `error` query parameter if present
    - Verifies auth state by calling `GET /api/profile/me`
    - Displays the OAuth result (success with user info, or error)
- Show the cookies that should have been set (name-only)
- Display the full redirect URL for debugging
- Note: OAuth flow cannot be fully tested in a headless fetch — it requires browser interaction

### 4.5 Email Verification Flow

**Purpose:** Test the email verification lifecycle — registration triggers verification email, token validation, expiry, and redirect behavior.

#### Endpoints

- `GET /api/auth/verify-email/:token` — Verify email

#### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Valid token verification | Redirect to `{CLIENT_URL}/login?verified=true` |
| Invalid/expired token | Redirect to `{CLIENT_URL}/login?verified=false` |
| Already verified user clicks link again | Depends on implementation (likely redirect with verified=true or false) |
| Server error during verification | Redirect to `{CLIENT_URL}/login?verified=false` |

##### Required Features

- After registration, display the Ethereal preview URL so the tester can open it and extract the verification token
- Input field to paste the full verification URL or token
- "Simulate Verification" button that constructs the full URL and navigates to it (or fetches it)
- Display the redirect URL that the server responded with
- Show the final `?verified` query parameter from the redirect
- Post-verification: attempt login to confirm `isVerified` is now `true`

### 4.6 Password Reset Flow

**Purpose:** Test the forgot-password → reset-password lifecycle.

#### Endpoints

- `POST /api/auth/forgot-password` — Send reset email
- `POST /api/auth/reset-password/:token` — Reset password

#### 4.6.1 Forgot Password

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Existing email | HTTP 200, `"If an account exists, a password reset link has been sent"` |
| Non-existent email | HTTP 200, same message (prevents enumeration) |
| Invalid email format | HTTP 400, Zod validation error |
| Rate limited (4th attempt in 60 min) | HTTP 429 |

##### Required Features

- Single-field form (email)
- Note about email enumeration protection
- Display Ethereal preview URL with the reset link (fetched from server logs)
- Rate limit state tracking

#### 4.6.2 Reset Password

##### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Valid token + valid new password | HTTP 200, `"Password reset successfully"` |
| Invalid/expired token | HTTP 400, `"Invalid or expired token"` |
| New password fails validation | HTTP 400, Zod validation error |
| Reuse of same token | HTTP 400, `"Invalid or expired token"` (one-time use) |
| Verify new password works | Login with new password → success |
| Verify old password fails | Login with old password → 401 |

##### Required Features

- Input for token (paste from Ethereal preview URL or auto-extract from URL)
- New password field with confirmation
- Token one-time use verification flow
- Post-reset login test

### 4.7 Audit Log Viewer

**Purpose:** Test session audit logging — view paginated audit logs for the authenticated user.

**Endpoint:** `GET /api/profile/me/audit-logs`

**Auth required:** Yes

#### Testable Scenarios

| Scenario | Expected Result |
|---|---|
| Get audit logs for authenticated user | HTTP 200, array of log entries with pagination |
| Logs sorted newest-first | Most recent log entry is first |
| Pagination works (page, limit) | Different pages return different logs |
| Invalid page/limit params | Should default or return validation error |
| Logs contain expected actions | login, logout, register, refresh, password_reset, password_change, account_deletion, oauth_login events are recorded |
| Logs contain IP and user agent | Each entry has `ip` and `userAgent` fields |
| Unauthenticated access | HTTP 401 |
| Action verification after specific operations | Perform an action (e.g., login), then check audit logs contain that action |

##### Required Features

- Paginated log viewer with page controls
- Filter by action type (dropdown)
- Show entry details: `action`, `status`, `ip`, `userAgent`, `metadata`, `createdAt`
- Column sorting by date (newest/oldest)
- Badge for success/failure status
- Note: audit logging is fire-and-forget — logging failure should never break the request

### 4.8 Session & Cookie Inspector

**Purpose:** Provide visibility into the current authentication session state. Because httpOnly cookies are inaccessible to JavaScript, this module provides indirect verification of auth state.

#### Required Features

- Current auth status indicator (authenticated / not authenticated)
- Determined by calling `GET /api/profile/me`
- List of cookie names that should be present (`token`, `refreshToken`, `oauth_state`)
- Note that values cannot be read from JS (httpOnly)
- Session expiry information (extracted from JWT if available via decode, or from maxAge)
- Last refresh time
- Active session indicator

### 4.9 Rate Limiting Test Harness

**Purpose:** Allow testers to observe rate limiter behavior for each endpoint.

#### Rate Limiters

| Limiter | Window | Max Requests |
|---|---|---|
| Global auth | 15 min | 20 |
| Login | 15 min | 5 |
| Register | 60 min | 3 |
| Forgot password | 60 min | 3 |
| Refresh | 15 min | 10 |
| Verify email | 15 min | 10 |
| Reset password | 15 min | 5 |
| Logout | 15 min | 20 |
| OAuth | 15 min | 10 |
| Profile | 15 min | 50 |
| Profile update | 15 min | 50 |
| Health | 1 min | 30 |

#### Required Features

- "Rapid-fire" button for each endpoint that sends N requests in quick succession
- Display how many requests succeeded vs were rate-limited
- Show the rate limit response body (`{"message": "Too many authentication attempts, please try again later."}`)
- Show HTTP 429 status code
- Note that rate limit response does not follow standard `ApiResponse` envelope
- Reset timer display (when the rate limit window resets)

---

## 5. Data Flow Specifications

### 5.1 Standard API Request Flow

```
User Input → Testing App UI
  → Construct Request (URL, headers, body, method, credentials: "include")
  → Send to Cred API (fetch)
  → Receive Response
  → Parse Response
  → Classify Result (success / validation error / API error / rate limit / redirect)
  → Display Formatted Result
```

### 5.2 Authentication State Machine

```
[Unauthenticated]
  → Register → [Registered, Unverified]
  → Verify Email → [Registered, Verified]
  → Login → [Authenticated]
  → Refresh Token → [Authenticated] (tokens rotated)
  → Logout → [Unauthenticated]
  → Delete Account → [Deleted]
  → OAuth Initiate → [Redirect to Provider]
  → OAuth Callback → [Authenticated] (on success) or [Unauthenticated] (on failure)
```

### 5.3 Cookie Lifecycle

```
Register: No cookies set
Login: Set `token` (24h) + `refreshToken` (7d, path=/api/auth)
Refresh: Rotate `token` + `refreshToken`
Logout: Clear `token` + `refreshToken`
OAuth Init: Set `oauth_state` (short-lived)
OAuth Callback: Clear `oauth_state`, Set `token` + `refreshToken`
Delete Account: Cookies remain (client must clear)
```

---

## 6. Error Handling & Edge Cases

### 6.1 Response Classification

The testing app must classify every API response into one of these categories and display it accordingly:

| Response Shape | Detection | Display |
|---|---|---|
| **Standard Success** | `response.success === true` | Green success card with `data` |
| **Standard Error** | `response.success === false` | Red error card with `message` and `error` |
| **Zod Validation Error** | `response.errors` is an array of ZodIssue | Orange card, list each issue with `path`, `message`, `code`, `expected`, `received` |
| **Rate Limit Error** | HTTP 429, `response.message` contains rate limit text | Yellow card |
| **Redirect** | `response.redirected === true` or 302 status | Info card showing redirect URL |
| **Network Error** | `fetch` throws (e.g., DNS failure, connection refused) | Red card with network error details |
| **Unexpected Error** | Any other unclassifiable response | Gray card with raw body |

### 6.2 Edge Cases to Handle

| Edge Case | Handling |
|---|---|
| Cred API is not running | Graceful error message, retry button, configuration check |
| CORS errors | Detect blocked by CORS policy and guide user to configure `CORS_ORIGIN` on the backend |
| Cookie not set due to sameSite | Detect via post-login auth check failure, show guidance about same-origin requirement |
| Token expired mid-session | Call refresh automatically or show "Session expired" with re-login prompt |
| Concurrent token reuse race condition | Document that MongoDB atomic operations handle this; test by sending simultaneous refresh requests |
| Empty response body | Handle gracefully, show raw status code |
| Non-JSON response | Detect `Content-Type` header, show raw text |
| OAuth popup blockers | Guide user to allow popups or open in new tab manually |
| Ethereal not available | Show note that Ethereal preview URL is logged to server console |

---

## 7. Implementation Order

The features should be implemented in dependency order to allow progressive testing:

| Phase | Module | Dependency | Estimated Effort |
|---|---|---|---|
| **Phase 0** | Project scaffolding & infrastructure | None | Small |
| | Setup Next.js app, shadcn/ui, layout, API client utility, environment config | | |
| **Phase 1** | Health Check Module | Phase 0 | Small |
| **Phase 2** | Auth Module — Register | Phase 0 | Medium |
| **Phase 3** | Auth Module — Email Verification | Phase 2 | Medium |
| **Phase 4** | Auth Module — Login | Phase 2–3 | Medium |
| **Phase 5** | Auth Module — Logout & Session Inspector | Phase 4 | Small |
| **Phase 6** | Auth Module — Refresh Token | Phase 4–5 | Medium |
| **Phase 7** | Auth Module — Forgot & Reset Password | Phase 2 | Medium |
| **Phase 8** | Profile Module — Get & Update | Phase 4 | Medium |
| **Phase 9** | Profile Module — Change Password | Phase 4 | Medium |
| **Phase 10** | Profile Module — Delete Account | Phase 4 | Small |
| **Phase 11** | Profile Module — Audit Log Viewer | Phase 4 | Medium |
| **Phase 12** | OAuth Module — Google & GitHub | Phase 4 | Large |
| **Phase 13** | Rate Limiting Test Harness | All prior phases | Medium |

---

*End of PRD*
