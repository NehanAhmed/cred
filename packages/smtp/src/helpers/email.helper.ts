import { emailVerification, passwordReset, type EmailAdapter } from '@cred-kit/core';

const PREFIX = '@cred-kit/smtp';

/** Reset links stay valid for one hour, matching core's reset-token TTL. */
const DEFAULT_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const EMAIL_VERIFICATION_SUBJECT = 'Email Verification';
const PASSWORD_RESET_SUBJECT = 'Password Reset Link';

/** Transport-neutral message handed to an email transport. */
export type OutboundEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

/** The one operation a transport (SMTP, Resend, ...) must provide. */
export type EmailSender = (message: OutboundEmail) => Promise<void>;

export type emailAdapterOptions = {
  /** Envelope sender used for every message. */
  EMAIL_FROM: string;
  /** Public base URL used to build the verification and reset links. */
  BACKEND_URL: string;
  /**
   * Public path prefix for the auth routes, used to build the verification and
   * reset links. Defaults to `/api/auth`. Set this to the prefix your host
   * mounts the router under (for example `/auth` when the router is mounted at
   * `/auth` rather than `/api`).
   */
  authPathPrefix?: string;
  /** IANA time zone used for the reset-link expiry. Defaults to `UTC`. */
  timeZone?: string;
  /** Lifetime of the reset link shown in the email. Defaults to one hour. */
  resetTokenTtlMs?: number;
};

/** Default public path prefix for the auth routes. */
export const DEFAULT_AUTH_PATH_PREFIX = '/api/auth';

const parseFromAddress = (value: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${PREFIX}: "EMAIL_FROM" is required`);
  }

  return value.trim();
};

/**
 * Accepts `https://api.example.com/` and `https://api.example.com` alike and
 * rejects anything that would produce a broken or unsafe link.
 */
const parseBackendUrl = (value: string): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${PREFIX}: "BACKEND_URL" must be an absolute URL, received "${value}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${PREFIX}: "BACKEND_URL" must use http or https, received "${url.protocol}"`);
  }

  if (url.search !== '' || url.hash !== '') {
    throw new Error(`${PREFIX}: "BACKEND_URL" must not contain a query string or fragment`);
  }

  return url.href.replace(/\/+$/, '');
};

const assertPositiveInteger = (name: string, value: number): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${PREFIX}: "${name}" must be a positive integer, received "${value}"`);
  }

  return value;
};

/**
 * Validates the public auth path prefix used in email links. The prefix is
 * joined directly onto `BACKEND_URL`, so a missing leading slash, a trailing
 * slash, or a query/fragment would produce a broken link.
 */
const parseAuthPathPrefix = (value: string | undefined): string => {
  if (value === undefined) return DEFAULT_AUTH_PATH_PREFIX;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${PREFIX}: "authPathPrefix" must be a non-empty string`);
  }

  if (!value.startsWith('/')) {
    throw new Error(`${PREFIX}: "authPathPrefix" must start with "/", received "${value}"`);
  }

  if (value === '/' || value.endsWith('/')) {
    throw new Error(`${PREFIX}: "authPathPrefix" must not end with "/", received "${value}"`);
  }

  if (value.includes('?') || value.includes('#') || /\s/.test(value)) {
    throw new Error(`${PREFIX}: "authPathPrefix" must be a plain URL path, received "${value}"`);
  }

  return value;
};

/**
 * Formats expiry in a fixed time zone with an explicit zone suffix. Relying on
 * `toLocaleString` without a zone silently printed the server's local time.
 */
const createExpiryFormatter = (timeZone: string): ((date: Date) => string) => {
  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone
    });
  } catch (error) {
    throw new Error(`${PREFIX}: invalid "timeZone" "${timeZone}"`, { cause: error });
  }

  return (date) => formatter.format(date);
};

/**
 * Maps core's `EmailAdapter` contract onto a transport supplied by the caller.
 *
 * Both built-in transports (SMTP and Resend) go through this function so email
 * copy, link building and expiry formatting can never drift apart.
 *
 * Every send is awaited: core deletes a freshly registered user when
 * `sendEmailVerification` rejects, so swallowing the transport error would
 * leave an unverifiable account behind. Failures are re-thrown with the
 * transport error preserved as `cause`; the raw token never appears in the
 * message.
 */
export const createEmailAdapter = (
  send: EmailSender,
  options: emailAdapterOptions
): EmailAdapter => {
  const from = parseFromAddress(options.EMAIL_FROM);
  const backendUrl = parseBackendUrl(options.BACKEND_URL);
  const authPathPrefix = parseAuthPathPrefix(options.authPathPrefix);
  const formatExpiry = createExpiryFormatter(options.timeZone?.trim() || 'UTC');
  const resetTokenTtlMs = assertPositiveInteger(
    'resetTokenTtlMs',
    options.resetTokenTtlMs ?? DEFAULT_RESET_TOKEN_TTL_MS
  );

  const sendMessage = async (to: string, subject: string, html: string): Promise<void> => {
    try {
      await send({ from, to, subject, html });
    } catch (error) {
      throw new Error(`${PREFIX}: failed to send "${subject}" to ${to}`, { cause: error });
    }
  };

  return {
    sendEmailVerification: async (email: string, rawToken: string): Promise<void> => {
      const verificationLink = `${backendUrl}${authPathPrefix}/verify-email/${encodeURIComponent(rawToken)}`;

      await sendMessage(email, EMAIL_VERIFICATION_SUBJECT, emailVerification(verificationLink));
    },
    sendPasswordReset: async (email: string, rawToken: string): Promise<void> => {
      const resetLink = `${backendUrl}${authPathPrefix}/reset-password/${encodeURIComponent(rawToken)}`;
      const expiresAt = formatExpiry(new Date(Date.now() + resetTokenTtlMs));

      await sendMessage(email, PASSWORD_RESET_SUBJECT, passwordReset(resetLink, expiresAt));
    }
  };
};
