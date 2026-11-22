# Security Policy

## Supported versions

The published packages are pre-1.0. The current release line is `0.1.x`, and security fixes are
made against it.

| Version | Supported |
|---|---|
| `0.1.x` | Yes |
| `< 0.1.0` | No |

This policy covers the published packages:

- `@cred-kit/core`
- `@cred-kit/express`
- `@cred-kit/mongo-storage`
- `@cred-kit/smtp`

The private workspace packages and apps (`@cred-kit/shared`, `@cred-kit/config`,
`apps/cred-testing`, and `apps/demo`) are not published and are not part of the supported release.

Cred runs inside a host application. The host owns TLS, CORS, security headers, proxy trust,
secret storage, and the choice of cookie settings outside production. Vulnerabilities in those
areas should be reported to the host application, not to Cred. If the problem is in Cred's
defaults or in code shipped by one of the packages above, report it here.

## Reporting a vulnerability

Use GitHub private vulnerability reporting:

<https://github.com/NehanAhmed/cred/security/advisories/new>

The repository's Security page shows the "Report a vulnerability" action, which means private
reporting is enabled. Do not open a public issue, discussion, or pull request for a vulnerability.

Include:

- The affected package and version.
- Your Node.js version and operating system.
- The adapter configuration in use (database, email, framework).
- A minimal reproduction, if possible.
- The impact and any known preconditions.
- Relevant logs with secrets, tokens, passwords, and personal data removed.

Do not include real user data, production credentials, or live access tokens. Do not test against
systems you do not own or have permission to test.

This project does not publish a response-time SLA. Please allow time for a fix before public
disclosure.
