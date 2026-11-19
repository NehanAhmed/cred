# @cred/smtp

Email delivery for [Cred](https://github.com/NehanAhmed/cred) authentication flows. This package
implements core's `EmailAdapter` contract over either **SMTP (Nodemailer)** or the **Resend HTTP
API**, so switching transports is a configuration change rather than a code change.

ESM only · Node.js 20+ · MIT

---

## Table of contents

- [Why this package](#why-this-package)
- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Choosing a transport](#choosing-a-transport)
- [What gets sent](#what-gets-sent)
- [Configuration reference](#configuration-reference)
  - [Service options](#service-options)
  - [SMTP options](#smtp-options)
  - [Resend options](#resend-options)
- [Lifecycle](#lifecycle)
- [Error handling](#error-handling)
- [Security notes](#security-notes)
- [Using it with `@cred/core`](#using-it-with-cred-core)
- [Public API](#public-api)
- [Scope and non-goals](#scope-and-non-goals)
- [Project layout](#project-layout)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Why this package

Cred needs to send two transactional emails: address verification and password reset. The
messages themselves — subjects, HTML, link shape, expiry copy — belong to `@cred/core`. The
transport that actually delivers them is an operational decision: a self-hosted SMTP relay in one
deployment, a hosted API in another.

`@cred/smtp` keeps that decision at the edge:

- **One contract in.** It returns core's `EmailAdapter`, so application code only ever calls
  `sendEmailVerification` and `sendPasswordReset`.
- **Two transports out.** SMTP via Nodemailer, or Resend over HTTPS.
- **No drift.** Both transports share the same adapter, so link building, subjects and expiry
  formatting are identical regardless of provider.
- **Fail loudly at construction, not at 3 a.m.** Invalid configuration throws while the service is
  being built, with messages that name the exact option.

## Features

| Area | Behavior |
| --- | --- |
| Transports | SMTP (pooled Nodemailer) and Resend (`POST /emails`) |
| Provider selection | Explicit `provider`, otherwise automatic detection from `RESEND_API_KEY` |
| Validation | Every option is validated at construction; malformed values throw instead of degrading silently |
| SMTP hardening | TLS 1.2 floor, `requireTLS` by default, pooled connections, finite connect/greeting/socket timeouts |
| Resend resilience | Per-attempt timeouts, bounded retries with jitter, `Retry-After` support, one `Idempotency-Key` per logical send |
| Observability | Failures carry the transport error as `cause`; the API key is redacted from messages |
| Runtime footprint | No `dependencies` of its own; `@cred/core` and `nodemailer` are peers; the only Node built-in used is `node:crypto` |
| Types | Full TypeScript declarations, ESM output |

## Installation

`@cred/smtp` is consumed from the Cred monorepo as a workspace package. Both of its runtime
requirements are declared as **peer dependencies**, so the host application owns the copies of
`@cred/core` and `nodemailer`:

```jsonc
{
  "dependencies": {
    "@cred/smtp": "workspace:*",
    "@cred/core": "workspace:*",
    "nodemailer": "^10.5.0"
  }
}
```

The package is configured for public publishing (`publishConfig.access: "public"`), but it is not
published to the npm registry at this time. Install it from the workspace rather than from npm.

> **Note**
> `nodemailer` is a required peer dependency even when you use the Resend provider. The package
> entry point imports the SMTP transport statically, so Nodemailer is loaded whenever
> `@cred/smtp` is imported.

## Quick start

### SMTP

```ts
import { emailService } from '@cred/smtp';

const { EMAIL, verify, close } = await emailService({
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
  provider: 'smtp',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
});

// Optional: check credentials/connectivity before serving traffic.
await verify();
```

### Resend

```ts
import { emailService } from '@cred/smtp';

const { EMAIL, close } = await emailService({
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
  RESEND_API_KEY: process.env.RESEND_API_KEY,
});
```

### Sending

```ts
// Both methods come from core's EmailAdapter contract.
await EMAIL.sendEmailVerification('user@example.com', rawVerificationToken);
await EMAIL.sendPasswordReset('user@example.com', rawResetToken);
```

Both calls resolve only after the transport has accepted the message. Rejections propagate, which
is what allows core to roll back a registration whose verification email could not be sent.

### Shutdown

```ts
process.once('SIGTERM', () => {
  close(); // releases pooled SMTP connections; no-op for Resend
});
```

## Choosing a transport

`provider` is optional. `resolveProvider` applies these rules in order:

| Condition | Transport |
| --- | --- |
| `provider: 'smtp'` | `smtp` |
| `provider: 'resend'` | `resend` |
| No `provider`, `RESEND_API_KEY` is a non-blank string | `resend` |
| No `provider`, no usable `RESEND_API_KEY` | `smtp` |

An explicit `provider` always wins — including when it contradicts the environment:

```ts
// Resend key present, but SMTP is still selected. SMTP options are then required.
await emailService({ ...baseOptions, provider: 'smtp', RESEND_API_KEY: 're_...' });
```

Only the selected transport's settings are validated. That gives you two useful migrations:

- **Add Resend without a code change.** Set `RESEND_API_KEY` and the service switches to Resend.
- **Stay on SMTP deliberately.** Pin `provider: 'smtp'` and the key is ignored.

An unknown `provider` value throws immediately. `resolveProvider` is exported if you need the same
decision logic elsewhere.

## What gets sent

Both transports send exactly one HTML part. The copy itself comes from `@cred/core`
(`emailVerification` and `passwordReset`); this package supplies the link and the expiry line.

| Adapter method | Subject | Link |
| --- | --- | --- |
| `sendEmailVerification(email, rawToken)` | `Email Verification` | `${BACKEND_URL}/api/auth/verify-email/${encodeURIComponent(rawToken)}` |
| `sendPasswordReset(email, rawToken)` | `Password Reset Link` | `${BACKEND_URL}/api/auth/reset-password/${encodeURIComponent(rawToken)}` |

Details:

- `BACKEND_URL` is normalized once: trailing slashes are stripped, so both
  `https://api.example.com` and `https://api.example.com/` produce a single-slash URL.
- Tokens are URL-encoded before they are embedded.
- The reset email states when the link expires, formatted in `timeZone` (default `UTC`) with an
  explicit zone suffix, for example `Nov 19, 2026, 9:15 AM UTC`.
- The package never places the raw token in an error message; the wrapper names only the recipient
  address and subject.

## Configuration reference

### Service options

Passed to `emailService(options)`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `EMAIL_FROM` | `string` | **required** | Envelope sender for every message. Used verbatim. |
| `BACKEND_URL` | `string` | **required** | Absolute `http(s)` URL used to build verification and reset links. Must not contain a query string or fragment. |
| `provider` | `'smtp' \| 'resend'` | auto-detected | Forces a transport. |
| `timeZone` | `string` | `'UTC'` | IANA time zone used for the reset-link expiry. Invalid zones throw. |
| `resetTokenTtlMs` | `number` | `3_600_000` (1 hour) | Lifetime displayed in the reset email. Must be a positive integer. |
| `verifyOnStart` | `boolean` | `false` | Runs `verify()` during construction and throws if it fails. |

`emailService` is `async`, but it performs no network I/O unless `verifyOnStart` is `true`.

### SMTP options

Used only when the SMTP provider is selected. `SMTP_HOST` is required; everything else has a safe
default.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `SMTP_HOST` | `string` | **required** | Relay hostname. |
| `SMTP_PORT` | `number \| string` | `587` | Integer between `1` and `65535`. |
| `SMTP_SECURE` | `boolean \| string` | `true` when port is `465` | Implicit TLS (SMTPS). |
| `SMTP_USER` | `string` | — | Must be provided together with `SMTP_PASS`. |
| `SMTP_PASS` | `string` | — | Must be provided together with `SMTP_USER`. Leading/trailing whitespace is preserved. |
| `requireTLS` | `boolean \| string` | `true` unless SMTPS | Starts with `STARTTLS` and refuses plaintext. Ignored when `secure` is enabled. |
| `maxConnections` | `number` | `5` | Pooled connections, `1`–`100`. |
| `maxMessages` | `number` | `100` | Messages per connection before reconnecting. |
| `timeouts.connection` | `number` | `10_000` ms | Time allowed to establish the TCP connection. |
| `timeouts.greeting` | `number` | `10_000` ms | Time allowed for the server greeting. |
| `timeouts.socket` | `number` | `30_000` ms | Socket inactivity tolerated. |

Behavioral notes:

- The transport is **pooled** (`pool: true`) and connections open lazily on the first send or on
  `verify()`. Building the service never blocks startup.
- The minimum TLS version is fixed at **TLSv1.2**.
- `auth` is omitted entirely when neither `SMTP_USER` nor `SMTP_PASS` is set. Supplying only one
  of them is an error.
- Environment-style strings are parsed defensively. Booleans accept `true/1/yes/on` and
  `false/0/no/off` (case-insensitive); anything else throws. So `SMTP_SECURE="false"` really
  means `false`.
- Sending disables Nodemailer's file and URL access, so an HTML body can never be used to read
  local files or fetch remote resources.

### Resend options

Used only when the Resend provider is selected.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | `string` | **required** | Bearer token. Redacted from every error message. |
| `RESEND_BASE_URL` | `string` | `https://api.resend.com` | Absolute `http(s)` URL without query or fragment; trailing slashes are stripped. |
| `requestTimeoutMs` | `number` | `10_000` ms | Per-attempt timeout, `1`–`120_000`. |
| `retry.maxAttempts` | `number` | `3` | Total attempts including the first, `1`–`10`. `1` disables retries. |
| `retry.initialDelayMs` | `number` | `500` ms | Base delay before the first retry, `1`–`60_000`. |
| `retry.maxDelayMs` | `number` | `5_000` ms | Upper bound for any single delay, `1`–`60_000`. |
| `fetchImpl` | `FetchLike` | global `fetch` | Injection point for tests or custom HTTP stacks. |
| `sleep` | `(ms: number) => Promise<void>` | timer-based | Injection point for tests. |

Endpoints used:

| Operation | Request |
| --- | --- |
| `send` | `POST /emails` with `{ from, to, subject, html }` |
| `verify()` | `GET /domains` (read-only credential check) |

Retry policy:

- Retried: `408`, `429`, `500`, `502`, `503`, `504`, plus network errors and timeouts.
- Not retried: every other `4xx` (such as `400`, `401`, `403`, `404`, `422`) and non-JSON success
  bodies. A failure with a non-retryable status is reported immediately.
- Backoff is exponential with equal jitter:
  `min(initialDelayMs × 2^(attempt − 1), maxDelayMs)`, randomized between half and the full value.
- `Retry-After` is honored when present, either as seconds or an HTTP date, and capped by
  `maxDelayMs`.
- One `Idempotency-Key` (UUID v4) is generated per logical request and reused across its attempts,
  so providers that support the header can de-duplicate retried sends. Requests without a body
  (`GET`) send neither a body, `Content-Type`, nor `Idempotency-Key`.
- Timeouts are enforced per attempt with an `AbortController`; a timed-out attempt is retried and
  finally reported as `... timed out after <n>ms`.

> **Deployment note**
> Resend only accepts a `from` address on a domain verified in your Resend account. A rejected
> sender usually surfaces as a `422` and is not retried.

## Lifecycle

```ts
const { EMAIL, verify, close } = await emailService(options);
```

| Member | Type | Behavior |
| --- | --- | --- |
| `EMAIL` | `EmailAdapter` | Core's contract: `sendEmailVerification` and `sendPasswordReset`. |
| `verify()` | `() => Promise<void>` | SMTP: opens a connection and authenticates. Resend: `GET /domains`. Rejects on failure. |
| `close()` | `() => void` | SMTP: closes the pool. Resend: no-op (stateless HTTP). |

- `verifyOnStart: false` (default) means a temporary provider outage cannot prevent application
  startup. `verify()` can still be called later.
- `verifyOnStart: true` verifies during construction. If it fails, the transport is closed before
  the error is rethrown so a half-initialized connection pool is never leaked.
- `close()` is synchronous. Call it once during shutdown; it is safe for both providers.

## Error handling

Configuration errors are thrown while building the service — plain `Error` for service/SMTP
options, `EmailApiError` for HTTP-client options. All messages are prefixed with `@cred/smtp:` and
name the offending option, for example:

```text
@cred/smtp: "SMTP_HOST" is required for the SMTP provider
@cred/smtp: "SMTP_USER" and "SMTP_PASS" must be configured together for the SMTP provider
@cred/smtp: "BACKEND_URL" must not contain a query string or fragment
@cred/smtp: invalid "timeZone" "Mars/Olympus"
```

Delivery failures are wrapped once, so the original transport error stays inspectable:

```ts
try {
  await EMAIL.sendPasswordReset(email, token);
} catch (error) {
  // error.message: @cred/smtp: failed to send "Password Reset Link" to user@example.com
  // error.cause:   transport error (Nodemailer error or EmailApiError)
}
```

`EmailApiError` is exported and carries structured context:

| Property | Description |
| --- | --- |
| `name` | Always `EmailApiError`. |
| `provider` | Provider label used in messages, for example `Resend`. |
| `status` | HTTP status, when the failure came from a response. |
| `cause` | Underlying error, when there is one. |

Messages include the failing method and path, the status and status text, and the provider's own
`message` / `error` / `name` field (truncated to 300 characters). Any occurrence of the API key is
replaced with `[redacted]`.

## Security notes

- **No secret leakage.** API keys never appear in error messages. The package itself performs no
  logging.
- **No body-driven I/O.** SMTP sends use `disableFileAccess` and `disableUrlAccess`.
- **No token leakage.** Raw tokens are embedded only in the email HTML, never in the package's own
  error text.
- **TLS by default.** SMTP requires TLS unless implicit TLS is enabled and pins TLS 1.2 as the
  minimum version.
- **Input validation at the boundary.** `BACKEND_URL`, `RESEND_BASE_URL`, time zones, ports,
  integer bounds and booleans are all validated before any I/O happens.
- **Bounded egress.** HTTP attempts are timeout-bounded and retries are capped in count and delay.

## Using it with `@cred/core`

```ts
import { emailService } from '@cred/smtp';

const { EMAIL, close } = await emailService({
  EMAIL_FROM: process.env.EMAIL_FROM!,
  BACKEND_URL: process.env.BACKEND_URL!,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
});

// `EMAIL` is core's EmailAdapter; hand it to core wherever it accepts one.
```

Notes:

- `BACKEND_URL` must be the **public base URL of your API**, because the links point at
  `/api/auth/...` on that origin.
- Because `sendEmailVerification` rejects on transport failure, core can delete a user whose
  verification email could not be delivered. Do not swallow those rejections.
- The package does not read `process.env` or load dotenv. Read environment variables in your
  application and pass them in explicitly.

## Public API

```ts
import {
  emailService,
  resolveProvider,
  EmailApiError,
  type EmailProvider,
  type EmailService,
  type emailServiceOptions,
  type smtpOptions,
  type smtpTimeouts,
  type resendOptions,
  type ResendSender,
  type EmailSender,
  type OutboundEmail,
  type FetchLike,
  type HttpClient,
  type RetryOptions,
} from '@cred/smtp';
```

| Export | Kind | Purpose |
| --- | --- | --- |
| `emailService(options)` | function | Builds `{ EMAIL, verify, close }`. |
| `resolveProvider(options)` | function | Applies the transport-selection rules without building anything. |
| `EmailApiError` | class | Structured HTTP-provider failure. |
| `EmailProvider` | type | `'smtp' \| 'resend'`. |
| `EmailService` | type | Return type of `emailService`. |
| `emailServiceOptions` | type | Accepted service options. |
| `smtpOptions`, `smtpTimeouts` | types | SMTP configuration. |
| `resendOptions`, `ResendSender` | types | Resend configuration and sender shape. |
| `EmailSender`, `OutboundEmail` | types | Transport-neutral message and send function. |
| `FetchLike`, `HttpClient`, `RetryOptions` | types | HTTP client contracts used by the Resend adapter. |

The transport factories (`getTransporter`, `smtpSend`, `createResendSender`, `createHttpClient`,
`createEmailAdapter`) are internal implementation details and are not exported from the package
entry point.

## Scope and non-goals

This package is deliberately narrow. It does **not**:

- render or customize email templates (copy lives in `@cred/core`);
- send plain-text alternatives, attachments, `cc`, `bcc`, or `replyTo`;
- queue, schedule, or persist outbound messages;
- handle inbound email, bounces, or webhooks;
- manage Resend domains or sender verification;
- read environment variables or configuration files.

It only turns the two core email intents into messages and hands them to a transport.

## Project layout

```text
src/
  index.ts                  Public entry: provider resolution, service assembly, exports
  helpers/
    email.helper.ts         EmailAdapter implementation, link building, option validation
  lib/
    transporter.ts          Nodemailer transport factory, defaults, smtpSend
    resend.ts               Resend sender (POST /emails, GET /domains)
    http.ts                 JSON HTTP client, retries, idempotency, EmailApiError
  __tests__/
    http-fakes.ts           Fetch harness and response helpers used by tests
  *.test.ts                 Vitest suites colocated with the modules they cover
```

Import boundaries are enforced by ESLint: Express, Mongoose, Passport, JWT, bcrypt, rate-limit,
helmet, CORS and cookie-parser imports are rejected because they belong in the application or in
`@cred/core`, not in the email adapter.

## Development

Run commands from `packages/smtp`, or target the package from the repository root:

```bash
pnpm --filter @cred/smtp build
```

| Script | Command | Description |
| --- | --- | --- |
| `build` | `tsdown` | Builds `dist/index.mjs` and `dist/index.d.mts` (ESM + declarations, target `node20.0.0`). |
| `dev` | `tsdown --watch` | Rebuilds on change. |
| `typecheck` | `tsc --noEmit` | Type-checks the sources. |
| `lint` | `eslint .` | Lints with `typescript-eslint` and the import-boundary rules. |
| `lint:fix` | `eslint . --fix` | Applies autofixable lint changes. |
| `test` | `vitest run` | Runs the suite once. |
| `test:watch` | `vitest` | Runs in watch mode. |

The suite currently contains **65 tests across 5 files** (`index`, `email.helper`, `transporter`,
`resend`, `http`). None of them require network access or a real provider: SMTP is exercised
through transport construction and a mocked `sendMail`, and Resend through an injected `fetch`.

The package builds to a single ESM entry point with `sideEffects: false`, so bundlers can
tree-shake it. It targets Node.js 20 and newer (`engines.node: ">=20.0.0"`).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `"SMTP_HOST" is required for the SMTP provider` | SMTP was auto-selected (no `RESEND_API_KEY`) or pinned with `provider: 'smtp'`, but no host was supplied. |
| `"SMTP_USER" and "SMTP_PASS" must be configured together` | Only one half of the credential pair was set. |
| `"SMTP_PORT" must be an integer between 1 and 65535` | A non-numeric or out-of-range port string was passed through from the environment. |
| `"BACKEND_URL" must be an absolute URL` | A bare host such as `api.example.com` was supplied; include the scheme. |
| `"RESEND_API_KEY" is required for the Resend provider` | Resend was pinned or auto-selected, but the key is blank. |
| `GET /domains failed with 401` | The Resend key is invalid or revoked. |
| `POST /emails failed with 422` | Resend rejected the payload, commonly an unverified `from` domain. Not retried. |
| `"SMTP connection verification failed"` | `verify()` failed; inspect `error.cause` for the Nodemailer error. |

## License

MIT © 2026 Nehan Ahmed — Cred. See the repository [LICENSE](https://github.com/NehanAhmed/cred/blob/main/LICENSE).
