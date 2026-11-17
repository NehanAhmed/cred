# @cred/smtp

Email adapter for Cred. Implements core's `EmailAdapter` contract over either
**SMTP (Nodemailer)** or the **Resend HTTP API**, so the transport is a
configuration decision rather than a code change.

## Install

```bash
pnpm add @cred/smtp @cred/core
```

> **Dependency contract:** `@cred/core` is declared as a regular (runtime)
> dependency on purpose — this adapter imports the email HTML templates
> (`emailVerification`, `passwordReset`) from core at runtime, not just its
> types. `nodemailer` is a peer dependency so the host application supplies
> its own single copy.

## Usage

```ts
import { emailService } from '@cred/smtp';

const { EMAIL, verify, close } = await emailService({
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com',
  // Opt into Resend by providing a key...
  RESEND_API_KEY: process.env.RESEND_API_KEY
  // ...or use SMTP:
  // SMTP_HOST: 'smtp.example.com',
  // SMTP_PORT: 587,
  // SMTP_USER: '...',
  // SMTP_PASS: '...'
});

// Hand EMAIL to core as `deps.email`.
```

### Choosing a transport

`provider` is optional. When omitted:

| Environment             | Transport |
| ----------------------- | --------- |
| `RESEND_API_KEY` is set | `resend`  |
| otherwise               | `smtp`    |

An explicit `provider: 'smtp' | 'resend'` always wins, and only the selected
transport's settings are validated. This lets an existing SMTP deployment move
to Resend by adding one environment variable, or stay on SMTP by pinning
`provider: 'smtp'`.

## Options

| Option            | Default     | Notes                                                         |
| ----------------- | ----------- | ------------------------------------------------------------- |
| `EMAIL_FROM`      | required    | Envelope sender for every message                             |
| `BACKEND_URL`     | required    | Absolute http(s) URL; links are `${BACKEND_URL}/api/auth/...` |
| `provider`        | auto-detect | `'smtp'` or `'resend'`                                        |
| `timeZone`        | `UTC`       | IANA zone used in the reset-link expiry                       |
| `resetTokenTtlMs` | 1 hour      | Displayed reset-link lifetime                                 |
| `verifyOnStart`   | `false`     | Verify credentials while building the service                 |

### SMTP

| Option                           | Default                                           | Notes                                    |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `SMTP_HOST`                      | required in SMTP mode                             |                                          |
| `SMTP_PORT`                      | `587`                                             | `465` implies `SMTP_SECURE`              |
| `SMTP_SECURE`                    | `port === 465`                                    | Implicit TLS; accepts `'true'`/`'false'` |
| `SMTP_USER` / `SMTP_PASS`        | —                                                 | Must be provided together                |
| `requireTLS`                     | `true` unless SMTPS                               | Refuses plaintext delivery               |
| `maxConnections` / `maxMessages` | `5` / `100`                                       | Pool sizing                              |
| `timeouts`                       | `{ connection: 10s, greeting: 10s, socket: 30s }` | Milliseconds                             |

The SMTP transport pools connections and enforces a TLS 1.2 floor.

### Resend

| Option             | Default                                                     | Notes                             |
| ------------------ | ----------------------------------------------------------- | --------------------------------- |
| `RESEND_API_KEY`   | required in Resend mode                                     | Bearer token; never logged        |
| `RESEND_BASE_URL`  | `https://api.resend.com`                                    | Override for testing/self-hosting |
| `requestTimeoutMs` | `10s`                                                       | Per-attempt timeout               |
| `retry`            | `{ maxAttempts: 3, initialDelayMs: 500, maxDelayMs: 5000 }` | Backoff with jitter               |

The Resend transport retries only failures that cannot have accepted the
message (`408`, `429`, `5xx`, network errors, timeouts), honours `Retry-After`,
and reuses one `Idempotency-Key` per send across attempts. Other `4xx`
responses fail immediately.

## Lifecycle

- `verify()` opens a connection / authenticates against the selected provider.
  With `verifyOnStart: true` it runs during construction and throws on failure.
- `close()` releases pooled SMTP connections. It is a no-op for Resend.

Failures from `EMAIL.sendEmailVerification` / `EMAIL.sendPasswordReset` reject
with the transport error attached as `cause`, which core relies on to roll back
a registration whose verification email could not be sent.
