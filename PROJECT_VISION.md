# Cred — Project Vision & Architecture Guide

> A developer-friendly, open-source authentication package that any Node.js developer can install and use in minutes. Think "better-auth but built by us."

---

## Table of Contents

1. [Current Project State](#1-current-project-state)
2. [The Goal — Complete Picture](#2-the-goal--complete-picture)
3. [The Problem With the Current Approach](#3-the-problem-with-the-current-approach)
4. [The Solution — Adapter Pattern](#4-the-solution--adapter-pattern)
5. [Package Architecture (The Split)](#5-package-architecture-the-split)
6. [Deep Dive: How Each Piece Works Together](#6-deep-dive-how-each-piece-works-together)
7. [Concepts You Need to Know Well](#7-concepts-you-need-to-know-well)
8. [Future Goals (Post-MVP)](#8-future-goals-post-mvp)
9. [The Roadmap — Step by Step](#9-the-roadmap--step-by-step)

---

## 1. Current Project State

### What exists now

Cred is a **monorepo** with three packages:

- **apps/api** — A complete Express 5 REST API server with authentication, OAuth (Google + GitHub), profile management, email verification, password reset, rate limiting, account lockout, refresh token rotation, and audit logging. Uses MongoDB via Mongoose, JWT via jsonwebtoken, email via Nodemailer (Ethereal in dev, SMTP in production), and Zod for validation. All 115 tests pass.

- **packages/shared** — Shared TypeScript types and Zod validators used by the API. Built with tsup.

- **packages/config** — Shared TypeScript configuration (tsconfig/base.json, tsconfig/node.json).

### How it works today

A developer who wants to use Cred currently has to:

1. Clone the entire repository
2. Set up MongoDB
3. Configure environment variables
4. Run the server as a separate service
5. Make HTTP calls to it from their application

This is how most auth projects start — as a standalone server. But it means Cred is **not a package you install**, it's a **service you run**. This limits who can use it and how easily.

---

## 2. The Goal — Complete Picture

### The vision

Cred should be an **npm package** (or a set of packages) that any Node.js developer can add to their existing application with a few lines of code. It should handle authentication so they don't have to.

### How a user should experience Cred

A developer discovers Cred, runs:

```bash
npm install @cred/core @cred/express @cred/storage-mongoose @cred/email-smtp
```

Then writes something like this in their app (conceptual, not actual code):

```
Import cred core, express adapter, mongoose storage, and email adapter
Create an Express app
Tell cred to attach itself to the app with:
  - MongoDB connection string
  - JWT secret
  - SMTP settings for email
Start the server
```

That's it. Now their app has:
- User registration with email verification
- Login/logout with JWT refresh token rotation
- Google and GitHub OAuth
- Password reset via email
- Account lockout after failed attempts
- Rate limiting
- Profile management
- Audit logging

All without writing a single auth endpoint themselves.

### The key principle

**Cred should work with your existing stack, not force you into a new one.**

If you use Express, there's an adapter. If you use Fastify, there's an adapter (later). If you use MongoDB, there's storage for that. If you use PostgreSQL, there's storage for that (later). If you use SendGrid for email, there's an adapter for that (later).

The core package has zero opinions about your tech stack. The adapters handle all the specifics.

---

## 3. The Problem With the Current Approach

Right now, Cred has three tight couplings that prevent it from being a reusable package:

### Coupling #1: Tied to Express

Every controller function looks like this (conceptually):

```
function register(req, res):
  Read email and password from req.body
  Create user in database
  Send verification email
  Return JSON response via res.json()
```

The `req` and `res` objects are Express-specific. If someone uses Fastify, Hono, or plain Node HTTP, they can't use Cred without rewriting all the controllers.

**What we need instead:** The auth logic should be pure functions that take plain data in and return plain data out. A thin Express layer converts `req` → data → calls function → converts result → `res`.

### Coupling #2: Tied to MongoDB/Mongoose

Every controller directly imports Mongoose models:

```
Import UserModel from '../../models/user.models.js'

function login(email, password):
  UserModel.findOne({ email })
```

If someone uses PostgreSQL, SQLite, or even a different MongoDB ODM, they can't use Cred.

**What we need instead:** The auth logic should call a generic "storage" interface. A separate adapter implements that interface using Mongoose. To use PostgreSQL, you just swap the adapter.

### Coupling #3: Tied to Nodemailer/SMTP

Email sending calls Nodemailer directly. If someone wants to use SendGrid, Resend, or Mailgun, they can't.

**What we need instead:** Same pattern — an email interface. Core calls `sendVerificationEmail(to, token)`. An adapter implements it with whatever email service you want.

### The result of these couplings

- Cred can only be used with Express + MongoDB + Nodemailer
- Cred can only be distributed as a server, not a package
- Contributions that add new database support would require changing core auth logic
- The project has a low ceiling for adoption

---

## 4. The Solution — Adapter Pattern

The adapter pattern is the solution to all three couplings. It's a simple idea:

**Define a contract (interface), then write separate implementations of that contract.**

### Real-world analogy

Think of a power plug. In the US, plugs have two flat pins. In Europe, they have two round pins. In the UK, three rectangular pins.

Your phone charger (the "core") doesn't care about any of this. It just needs electricity. The **adapter** (the part that goes into the wall) converts whatever wall shape you have into the standard input your charger expects.

To use your phone in Europe, you don't buy a new phone. You buy a different adapter.

Cred works the same way:
- **Core** = the phone (auth logic, doesn't care about the outside world)
- **Storage adapter** = converts between your database and what core expects
- **Email adapter** = converts between your email service and what core expects
- **Framework adapter** = converts between your web framework and what core expects

### How the interfaces work (no code, just concept)

**Storage Interface:**
Think of this as a list of questions you can ask a database:
- Can you find a user by their email? (yes/no)
- Can you create a new user? (yes/no)
- Can you save a refresh token? (yes/no)
- Can you log an audit event? (yes/no)
- Can you update a user's password? (yes/no)

Any database adapter that can answer "yes" to all these questions can work with Cred.

**Email Interface:**
- Can you send a verification email to an address with a token? (yes/no)
- Can you send a password reset email? (yes/no)

**Framework Interface:**
- Can you send a JSON success response? (yes/no)
- Can you send a JSON error response? (yes/no)
- Can you read a cookie from a request? (yes/no)
- Can you set a cookie on a response? (yes/no)
- Can you redirect a user to a URL? (yes/no)

### How this changes Cred's architecture

**Before:** Controllers use Express req/res, Mongoose models, and Nodemailer directly.

**After:** Core functions take plain input, call interfaces, return plain output. Framework adapters, storage adapters, and email adapters handle all the specifics.

This means:
- Adding PostgreSQL support = write one adapter, zero changes to core
- Adding Fastify support = write one adapter, zero changes to core
- Adding SendGrid support = write one adapter, zero changes to core
- Testing core = no database, no server needed, just unit test pure functions
- Anyone can contribute a new adapter without understanding the full auth logic

---

## 5. Package Architecture (The Split)

Cred becomes a set of independently published npm packages under the `@cred` scope. Each package has one job.

### The packages (MVP, v1)

| Package | Job | Dependencies |
|---------|-----|-------------|
| `@cred/core` | All auth logic + interface definitions | Zero runtime deps (only peer deps) |
| `@cred/express` | Converts Express req/res into core-friendly format | Depends on `@cred/core` |
| `@cred/storage-mongoose` | Implements storage interface using Mongoose | Depends on `@cred/core` + mongoose |
| `@cred/email-smtp` | Implements email interface using Nodemailer/SMTP | Depends on `@cred/core` + nodemailer |

### What each package contains

**`@cred/core` — The brain of the operation**

This is the most important package. It contains:

1. **Interface definitions** — TypeScript types for `StorageAdapter`, `EmailAdapter`, `FrameworkAdapter`. These are the contracts that all other adapters must follow.

2. **Auth service functions** — Pure functions that implement every auth feature:
   - Register a user (validate input, check for duplicates, hash password, save user, send verification email)
   - Login (find user, check password, check lockout, check verified, generate tokens, return result)
   - Verify email (find token, mark verified, return result)
   - Forgot password (find user, generate reset token, send email, return result)
   - Reset password (validate token, hash new password, save, return result)
   - Refresh token (validate old token, rotate, return new tokens)
   - OAuth callback (find or create user by provider ID, generate tokens, return result)
   - Logout (clear tokens, return result)
   - Change password (verify old, hash new, save, return result)
   - Update profile (validate fields, save, return result)
   - Delete account (remove user and all tokens, return result)

   Each function takes plain data and a "dependencies" object containing the adapters. Each function returns plain data. No side effects except through the adapters.

3. **The main `cred()` function** — This is what users call. It takes a configuration object (with adapters and settings) and returns a set of route handlers that the framework adapter can use.

4. **Configuration types** — Types for JWT settings, cookie settings, OAuth provider settings, rate limits, etc.

5. **Error types** — Standardized error classes that the framework adapter can convert to appropriate HTTP responses.

**What `@cred/core` does NOT contain:**
- No Express, Fastify, or any framework code
- No Mongoose, Knex, Prisma, or any database code
- No Nodemailer, SendGrid, or any email library code
- No `process.env` reads (config is passed explicitly)
- No file I/O, network requests, or side effects (except through adapters)

**`@cred/express` — The Express glue**

This is a small package (probably under 200 lines). It:

1. Provides a middleware factory that takes the same config as `@cred/core` plus Express-specific options
2. Creates an Express Router with all auth routes mounted
3. Each route handler:
   - Reads data from `req.body`, `req.params`, `req.query`, `req.cookies`
   - Calls the appropriate `@cred/core` function
   - Sends the response using Express methods (`res.json()`, `res.cookie()`, etc.)

This package is intentionally thin. It's just translating between Express conventions and core conventions. If Express v6 changes its API, only this package needs updating.

**`@cred/storage-mongoose` — Your existing models, wrapped**

This package implements the storage interface using Mongoose. It:

1. Takes a MongoDB connection URI (or an existing Mongoose connection)
2. Defines Mongoose schemas for users, refresh tokens, and audit logs (your current models, moved here)
3. Exports a factory function that returns an object matching the storage interface
4. Each method (findUserByEmail, createUser, etc.) does a Mongoose query and maps the result to the interface's expected format

Most of your current code lives here, just wrapped in the interface shape.

**`@cred/email-smtp` — Your email helpers, wrapped**

Implements the email interface. Takes SMTP config, creates a Nodemailer transporter, sends emails. Falls back to Ethereal in development like you currently do.

### How the packages depend on each other

```
@cred/express ─────depends on─────┐
                                   ▼
                              @cred/core
                                   ▲
@cred/storage-mongoose ─depends on─┘
@cred/email-smtp ───────depends on─┘
```

- `@cred/core` has zero runtime dependencies (pure TypeScript logic)
- Adapters depend on `@cred/core` for the interface types
- Adapters do NOT depend on each other
- Users install core + the adapters they need

### The monorepo folder structure

```
cred/
  packages/
    core/
      package.json        ← @cred/core
      src/
        index.ts          ← main export: cred() function + types
        interfaces/
          storage.ts      ← IStorageAdapter interface
          email.ts        ← IEmailAdapter interface
          framework.ts    ← IFrameworkAdapter interface
        services/
          auth.service.ts       ← register, login, logout, verifyEmail
          token.service.ts      ← generate tokens, refresh rotation
          oauth.service.ts      ← OAuth callback handling
          password.service.ts   ← forgot, reset, change password
          profile.service.ts    ← get, update, delete profile
          audit.service.ts      ← log and query audit events
        errors/
          auth-error.ts   ← Standardized error classes
        config/
          types.ts        ← Config types
          defaults.ts     ← Default config values
    express/
      package.json        ← @cred/express
      src/
        index.ts          ← Main export: middleware factory
        router.ts         ← Creates Express router
        adapters/
          framework.ts    ← Express implementation of IFrameworkAdapter
    storage-mongoose/
      package.json        ← @cred/storage-mongoose
      src/
        index.ts          ← Main export: factory function
        models/
          user.models.ts        ← (moved from current project)
          refreshToken.models.ts ← (moved from current project)
          auditLog.models.ts    ← (moved from current project)
        adapters/
          user.adapter.ts       ← Maps Mongoose queries to interface
          token.adapter.ts      ← Maps Mongoose queries to interface
          audit.adapter.ts      ← Maps Mongoose queries to interface
    email-smtp/
      package.json        ← @cred/email-smtp
      src/
        index.ts          ← Main export: factory function
        transporter.ts    ← Creates Nodemailer transporter
        templates.ts      ← Email templates (moved from current project)
  apps/
    demo/                 ← A simple Express app using the packages
      src/
        index.ts          ← Imports all 4 packages, starts server
      package.json
```

---

## 6. Deep Dive: How Each Piece Works Together

### The full flow: User registers

Let's trace what happens when someone registers through Cred in its new architecture.

**Step 1: HTTP request arrives at Express**

The user's browser sends `POST /api/auth` with `{ email, password, username }`. Express routes it to Cred's router.

**Step 2: Express adapter extracts data**

The Express adapter reads `req.body` and gets the email, password, and username. It also checks `req.cookies` for any existing tokens. It then calls the core `register` function with this data.

**Step 3: Core runs the register logic**

The core function:

1. Validates the input (email format, password strength, username rules). Uses Zod validators from the shared package.
2. Calls the storage adapter to check if a user with this email already exists.
3. If yes, returns an error that the Express adapter will convert to a 409 Conflict response.
4. If no, hashes the password using bcryptjs.
5. Calls the storage adapter to create the user with the hashed password.
6. Calls the email adapter to send a verification email.
7. Generates access and refresh tokens via the token service.
8. Returns the result: user info (without password), tokens, and any necessary cookie data.

**Step 4: Express adapter sends response**

The Express adapter takes the result from step 3 and:
- Sets cookies (access token, refresh token) on the response
- Sends a JSON response with the user data

### How the adapters are connected

The user's code (the app that installs Cred) is what wires everything together:

```
User's code creates the adapters and passes them to core.
Core doesn't know what database or email service is being used.
Core just calls the interface methods.
```

The user is responsible for:
1. Creating the storage adapter with their database config
2. Creating the email adapter with their email service config
3. Passing both to the core setup function

The user is NOT responsible for:
- Writing any auth logic
- Handling tokens, cookies, or sessions
- Rate limiting or lockout logic
- Email templating or sending

### Configuration flow

Config flows like this:

```
User's config object
  │
  ▼
Express adapter receives it
  │
  ▼
Express adapter passes storage + email parts to core's storage/email adapters
  │
  ▼
Express adapter passes framework-specific parts (cookie settings, CORS) to Express itself
```

Some config is consumed by the framework adapter (like cookie settings), some by core (like JWT secret), some by storage (like MongoDB URI), some by email (like SMTP host). Each adapter reads what it needs from the config object.

### How a user would use different adapters

**Scenario: User switches from MongoDB to PostgreSQL**

Before:
```
Install: @cred/core, @cred/express, @cred/storage-mongoose, @cred/email-smtp
Config: pass mongooseStorage({ uri: 'mongodb://...' })
```

After:
```
Install: @cred/core, @cred/express, @cred/storage-knex, @cred/email-smtp
Config: pass knexStorage({ connection: 'postgresql://...' })
```

Only the import and one config line changes. Core, Express adapter, and email adapter stay exactly the same.

**Scenario: User switches from Express to Fastify**

Before:
```
Install: @cred/core, @cred/express, @cred/storage-mongoose, @cred/email-smtp
Code: app.use(credExpress({...}))
```

After:
```
Install: @cred/core, @cred/fastify, @cred/storage-mongoose, @cred/email-smtp
Code: app.register(credFastify({...}))
```

Storage adapter stays. Framework adapter changes. Core stays.

### How this helps you as the maintainer

**Adding a new feature** (like MFA/TOTP):
- Add the logic to `@cred/core` (auth service)
- Add storage methods if needed (save MFA secret, verify MFA code)
- The Express adapter automatically gets the new routes
- All existing storage/email adapters work without changes
- Need to store MFA secrets in PostgreSQL too? Update `@cred/storage-knex` later, separately

**Adding a new database:**
- Create a new package `@cred/storage-prisma`
- Implement the storage interface using Prisma
- Zero changes to core, Express, or email adapters
- Publish independently

**Fixing a bug:**
- If it's a logic bug (wrong token rotation), fix in `@cred/core`, publish patch
- If it's a database bug (wrong query), fix in the storage adapter, publish patch
- If it's an Express bug (wrong cookie setting), fix in `@cred/express`, publish patch

---

## 7. Concepts You Need to Know Well

### Core concept #1: Dependency Injection (DI)

**What it is:** Instead of a function reaching out to get what it needs, you give it what it needs.

**Real-world example:** Making coffee.
- Without DI: You grow coffee beans, roast them, grind them, boil water, and make coffee.
- With DI: You buy coffee beans from a store, use a grinder you already have, and an electric kettle. The "make coffee" function just receives pre-ground coffee and hot water.

**In code without DI (current Cred):** The register controller imports `UserModel` directly and calls `UserModel.findOne()`. It decides what database to use.

**In code with DI (future Cred):** The register function receives `storage` as a parameter and calls `storage.findUserByEmail()`. It has no idea what database is behind it.

**Why you need it:** Without DI, every function is permanently tied to its dependencies. With DI, you can swap out the entire database or email service without changing a single line of auth logic.

### Core concept #2: Interface/Contract Programming

**What it is:** Define *what* something does, not *how* it does it.

**Real-world example:** A USB port. It defines the shape and electrical signals (the interface). Any device that follows the USB standard can plug into any USB port. The port doesn't care if you plug in a keyboard, a phone charger, or a mouse.

**In Cred:** The storage interface says "there is a method called `findUserByEmail` that takes a string and returns a user or null." The Mongoose adapter and the PostgreSQL adapter both have a method called `findUserByEmail`. Core calls `storage.findUserByEmail(email)` and doesn't care which adapter is providing it.

**Why you need it:** Interfaces are the contract between core and adapters. They let you develop core and adapters independently, as long as both sides stick to the contract.

### Core concept #3: Separation of Concerns

**What it is:** Each piece of code should have one job and one reason to change.

**Real-world example:** A restaurant has:
- A chef who cooks food (one job)
- A waiter who serves food (one job)
- A cashier who handles payments (one job)
- A dishwasher who cleans dishes (one job)

If the menu changes, only the chef changes. If the payment system changes, only the cashier changes. Everyone can work independently.

**In Cred:**
- `@cred/core` — knows about auth logic (one job: authentication)
- `@cred/express` — knows about Express (one job: framework translation)
- `@cred/storage-mongoose` — knows about Mongoose (one job: database operations)

If Express releases a new version, only `@cred/express` changes. If a security vulnerability is found in the auth logic, only `@cred/core` changes. If MongoDB releases a new driver, only `@cred/storage-mongoose` changes.

**Why you need it:** If you mix everything together, a change to your email provider could accidentally break your login logic. Separation ensures changes are isolated and safe.

### Core concept #4: TypeScript Generics and Advanced Types

**What it is:** Writing types that work with multiple types instead of one specific type.

**Example in Cred:** The `ApiResponse<T>` type you already have. `T` is a generic — it can be `User`, `AuditLog[]`, or any other type. One type definition works for all responses.

**Why you need it:** Your interfaces will use generics heavily. The storage interface might have `findUserByEmail(email: string): Promise<User | null>` — `User` is a specific type but the storage adapter defines what `User` looks like. Generics let you be flexible about the exact shape while being strict about the interface.

### Core concept #5: Monorepo Package Management

**What it is:** Managing multiple npm packages in one repository, with shared tooling and the ability to reference each other during development.

**You already have this set up** with pnpm workspaces. Each `@cred/*` package lives in `packages/` and has its own `package.json`. When you run `pnpm build`, it builds all packages. When you want to publish, you publish each package independently.

**The key things to understand:**
- Each package has its own version (you can update `@cred/storage-mongoose` without updating `@cred/core`)
- Packages can reference each other via `workspace:*` in their dependencies (you already do this)
- When you publish, you replace `workspace:*` with the actual version number
- You can publish individual packages with `pnpm publish --filter @cred/core`

### Core concept #6: Testing Pure Functions

**What it is:** A pure function always returns the same output for the same input and has no side effects.

**Example in Cred:** A pure `register` function:
- Same input (email, password, username) → same behavior (though the result might differ based on whether the user already exists — but that's because you pass a different "existing users" state through the storage adapter)
- No side effects: it doesn't write to the database itself, doesn't send emails itself, doesn't set cookies

**Why it matters for testing:**
- You can test the register function by passing a fake storage adapter and checking the return value
- No database needed, no server needed, no network needed
- Tests are fast (milliseconds instead of seconds)
- You can test edge cases easily (what happens when the storage adapter returns null? what when it returns a user? what when it throws an error?)
- You can test the adapter separately (unit test storage adapter with real MongoDB, unit test framework adapter with Express req/res mocks)

### Core concept #7: The Framework Adapter Pattern

**What it is:** A generic interface that any web framework can implement to work with Cred.

**The framework adapter needs to do a few things:**
- Read input from the request (body, params, query, cookies)
- Send a success response (with optional cookie setting)
- Send an error response
- Redirect to a URL
- Read and set cookies

**Why you need this:** Your auth logic needs to interact with HTTP requests and responses. If it does this directly with Express objects, it's tied to Express. By abstracting this behind an interface, any framework can work.

**Example of framework differences:**
- Express: reads cookies via `req.cookies`, sets via `res.cookie(name, value, options)`
- Fastify: reads cookies via `req.cookies`, sets via `reply.setCookie(name, value, options)`
- Hono: reads via `c.req.cookie(name)`, sets via `c.res.headers.append('Set-Cookie', ...)`

The framework adapter handles these differences. Core just calls `adapter.getCookie(req, 'token')` and `adapter.setCookie(res, 'token', value, options)`.

### Core concept #8: Strict Layering

**What it is:** Rules about which packages can depend on which other packages.

**The rules for Cred:**
- `@cred/core` can import nothing from adapters (core never depends on express/mongoose/nodemailer)
- `@cred/express` can import from `@cred/core` but not from storage or email adapters
- `@cred/storage-mongoose` can import from `@cred/core` but not from express or email adapters
- `@cred/email-smtp` can import from `@cred/core` but not from express or storage adapters
- Adapters never import from each other

**Why strict layering matters:**
- It keeps the dependency graph simple and acyclic
- You can understand each package in isolation
- You can test each package independently
- You can replace any adapter without worrying about breaking other adapters

### Core concept #9: Configuration Merging and Validation

**What it is:** Taking user-provided config, merging it with sensible defaults, and validating it before use.

**For Cred, the config object will include:**
- Storage adapter instance (required)
- Email adapter instance (optional — if not provided, email features are disabled)
- JWT settings (secret, expiration times — with sensible defaults)
- Cookie settings (name, secure flag, same-site — with sensible defaults)
- OAuth provider settings (client IDs, secrets, callback URLs)
- Rate limit settings (with sensible defaults)
- Feature flags (enable/disable registration, password reset, etc.)

**The pattern:**
1. User passes partial config
2. Core merges it with defaults
3. Core validates the result (required fields present, values are valid)
4. Core passes relevant parts to each adapter
5. If validation fails, throw a clear error telling the user what's wrong

### Core concept #10: Error Standardization

**What it is:** All errors follow the same structure, so the framework adapter always knows how to convert them to HTTP responses.

**For Cred, errors should include:**
- A machine-readable code (like `USER_NOT_FOUND`, `INVALID_PASSWORD`, `EMAIL_NOT_VERIFIED`)
- A human-readable message
- An HTTP status code (the framework adapter may override this)
- Optional metadata (like remaining lockout time in seconds)

**Why it matters:** Without standardized errors, each framework adapter would need to guess the HTTP status code. With standardized errors, the adapter just reads `error.statusCode` and `error.message` and sends the appropriate response.

---

## 8. Future Goals (Post-MVP)

### After the initial npm release

**Phase 2 — More adapters:**
- `@cred/storage-knex` — PostgreSQL/MySQL/SQLite via Knex
- `@cred/email-resend` — Email via Resend API
- `@cred/email-sendgrid` — Email via SendGrid
- `@cred/fastify` — Fastify framework adapter
- `@cred/hono` — Hono framework adapter

**Phase 3 — Client SDK:**
- `@cred/client` — Browser-side helpers (TypeScript fetch wrappers, auto-refresh tokens, OAuth popup)
- `@cred/react` — React hooks (useAuth, useSession, useLogin, etc.)
- `@cred/next` — Next.js server actions and middleware helpers

**Phase 4 — Advanced features:**
- Multi-factor authentication (TOTP, WebAuthn/Passkeys)
- Session management dashboard (view/revoke active sessions)
- Webhooks (notify your app of auth events)
- Admin API (manage users, view audit logs)
- Self-hosted admin UI (like Clerk's dashboard)

**Phase 5 — Infrastructure:**
- Docker image (one-command self-hosted deployment)
- Database migration tooling
- Documentation site (docusaurus or similar)
- CLI scaffolding tool (`npx @cred/create` or `npx @cred/init`)
- Starter templates (Express + Cred, Fastify + Cred, etc.)

### Business/adoption goals

- Get featured on notable open-source collections
- Achieve 1000+ GitHub stars as validation
- Have active community contributors for adapters
- Be a viable self-hosted alternative to Auth0, Clerk, Better-Auth

---

## 9. The Roadmap — Step by Step

### Step 1: Define interfaces
Create the `@cred/core` package structure with all interface definitions (storage, email, framework). No implementation yet. Just TypeScript types.

**How to verify:** You can import the interfaces and they compile. You can write a dummy implementation of each interface.

### Step 2: Extract storage interface implementation
Move your current Mongoose models and database logic into `@cred/storage-mongoose`. Wrap them in the storage interface.

**How to verify:** The Mongoose adapter passes all storage interface tests. It can create users, find them by email, save refresh tokens, etc.

### Step 3: Extract email interface implementation
Move your current email helpers into `@cred/email-smtp`. Wrap them in the email interface.

**How to verify:** The SMTP adapter can send test emails via Ethereal.

### Step 4: Extract auth logic into core
This is the biggest step. One by one, move each controller's logic into `@cred/core` as pure functions. Each function accepts dependencies (storage, email adapters) and returns data instead of sending responses.

**How to verify:** You can call the core functions manually with fake adapters and check the return values.

### Step 5: Build Express adapter
Create `@cred/express` that wires the adapters together and mounts routes. This replaces your current `apps/api` routes.

**How to verify:** The adapter creates an Express router with all routes. Requests go through Express → adapter → core → adapter → response.

### Step 6: Replace `apps/api` with `apps/demo`
Your current `apps/api` becomes `apps/demo`. It imports `@cred/core`, `@cred/express`, `@cred/storage-mongoose`, and `@cred/email-smtp` (all via `workspace:*`) and uses them. This proves the packages work together.

**How to verify:** All 115 tests still pass. The demo app behaves identically to the current API.

### Step 7: Publish
Set up CI/CD (GitHub Actions). On each tag push, build and publish all changed packages to npm.

**How to verify:** `npm install @cred/core` works in a fresh project. Someone can follow the README and have auth working in 5 minutes.

---

## Architecture Principles Summary

1. **Core has zero opinions about your stack.** It knows nothing about Express, MongoDB, or Nodemailer. It only knows about its interfaces.

2. **Adapters are thin.** They should only translate between their specific tech and core's interfaces. No business logic.

3. **Packages are independently versioned and published.** You can update the Mongoose adapter without touching the SMTP adapter.

4. **The dependency graph is simple and one-directional.** Core → nothing. Adapters → core. No adapter → adapter or adapter ← core.

5. **Configuration has sensible defaults.** A user should need minimal config to get started. Required values (like JWT secret) should have clear error messages.

6. **Every piece is testable in isolation.** Core logic with fake adapters. Adapters with real services. The integration test uses all real adapters together.

7. **Nothing is hidden.** If a user wants to customize behavior, they can extend or replace any adapter. The interface is the public API.
