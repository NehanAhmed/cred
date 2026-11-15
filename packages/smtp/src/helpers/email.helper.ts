import { emailVerification, passwordReset, type EmailAdapter } from '@cred/core';
import type nodemailer from 'nodemailer';

const PREFIX = '@cred/smtp';

/** Reset links stay valid for one hour, matching core's reset-token TTL. */
const DEFAULT_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const EMAIL_VERIFICATION_SUBJECT = 'Email Verification';
const PASSWORD_RESET_SUBJECT = 'Password Reset Link';

export type emailAdapterOptions = {
  /** Envelope sender used for every message. */
  SMTP_FROM: string;
  /** Public base URL used to build the verification and reset links. */
  BACKEND_URL: string;
  /** IANA time zone used for the reset-link expiry. Defaults to `UTC`. */
  timeZone?: string;
  /** Lifetime of the reset link shown in the email. Defaults to one hour. */
  resetTokenTtlMs?: number;
};

const parseFromAddress = (value: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${PREFIX}: "SMTP_FROM" is required`);
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
 * Maps core's `EmailAdapter` contract onto Nodemailer.
 *
 * Every send is awaited: core deletes a freshly registered user when
 * `sendEmailVerification` rejects, so swallowing the SMTP error would leave an
 * unverifiable account behind. Failures are re-thrown with the transport error
 * preserved as `cause`; the raw token never appears in the message.
 */
export const emailAdapter = (
  transporter: nodemailer.Transporter,
  options: emailAdapterOptions
): EmailAdapter => {
  const from = parseFromAddress(options.SMTP_FROM);
  const backendUrl = parseBackendUrl(options.BACKEND_URL);
  const formatExpiry = createExpiryFormatter(options.timeZone?.trim() || 'UTC');
  const resetTokenTtlMs = assertPositiveInteger(
    'resetTokenTtlMs',
    options.resetTokenTtlMs ?? DEFAULT_RESET_TOKEN_TTL_MS
  );

  const send = async (to: string, subject: string, html: string): Promise<void> => {
    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
        // Messages only contain inline HTML; loading remote or local
        // resources would be an SSRF/arbitrary-file-read primitive.
        disableFileAccess: true,
        disableUrlAccess: true
      });
    } catch (error) {
      throw new Error(`${PREFIX}: failed to send "${subject}" to ${to}`, { cause: error });
    }
  };

  return {
    sendEmailVerification: async (email: string, rawToken: string): Promise<void> => {
      const verificationLink = `${backendUrl}/api/auth/verify-email/${encodeURIComponent(rawToken)}`;

      await send(email, EMAIL_VERIFICATION_SUBJECT, emailVerification(verificationLink));
    },
    sendPasswordReset: async (email: string, rawToken: string): Promise<void> => {
      const resetLink = `${backendUrl}/api/auth/reset-password/${encodeURIComponent(rawToken)}`;
      const expiresAt = formatExpiry(new Date(Date.now() + resetTokenTtlMs));

      await send(email, PASSWORD_RESET_SUBJECT, passwordReset(resetLink, expiresAt));
    }
  };
};
