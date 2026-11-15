import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailSender } from '../helpers/email.helper.js';

/** Operational defaults applied when the caller does not override them. */
export const SMTP_DEFAULTS = {
  port: 587,
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
  tlsMinVersion: 'TLSv1.2'
} as const;

export type smtpTimeouts = {
  /** Milliseconds allowed to establish the TCP connection. Defaults to 10s. */
  connection?: number;
  /** Milliseconds allowed for the server greeting. Defaults to 10s. */
  greeting?: number;
  /** Milliseconds of socket inactivity tolerated. Defaults to 30s. */
  socket?: number;
};

/**
 * SMTP connection settings. Only used when the SMTP transport is selected, so
 * every field is optional here and validated at construction time.
 *
 * These values commonly come straight from environment variables, so ports and
 * booleans are parsed defensively (`'false'` stays `false`) and invalid values
 * throw instead of silently degrading the transport.
 */
export type smtpOptions = {
  SMTP_HOST?: string;
  /** Defaults to 587. */
  SMTP_PORT?: number | string;
  /** Implicit TLS (SMTPS). Defaults to `true` when `SMTP_PORT` is 465. */
  SMTP_SECURE?: boolean | string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** Refuse plaintext delivery. Defaults to `true` unless `SMTP_SECURE` is enabled. */
  requireTLS?: boolean | string;
  /** Pooled connections kept open. Defaults to 5. */
  maxConnections?: number;
  /** Messages sent per connection before reconnecting. Defaults to 100. */
  maxMessages?: number;
  timeouts?: smtpTimeouts;
};

const PREFIX = '@cred/smtp';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const readRequiredString = (name: string, value: string | undefined): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${PREFIX}: "${name}" is required for the SMTP provider`);
  }

  return value.trim();
};

/**
 * Passwords are intentionally not trimmed: leading or trailing whitespace is
 * part of the credential. A blank value still counts as "not configured".
 */
const readOptionalString = (value: string | undefined, trim = true): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const normalized = trim ? value.trim() : value;
  return normalized === '' ? undefined : normalized;
};

const readBoolean = (
  name: string,
  value: boolean | string | undefined,
  fallback: boolean
): boolean => {
  if (isBlank(value)) return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = (value as string).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  throw new Error(`${PREFIX}: "${name}" must be a boolean, received "${value}"`);
};

type IntegerBounds = {
  fallback: number;
  min?: number;
  max?: number;
};

const readInteger = (
  name: string,
  value: number | string | undefined,
  bounds: IntegerBounds
): number => {
  if (isBlank(value)) return bounds.fallback;

  const min = bounds.min ?? 1;
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  const parsed = typeof value === 'number' ? value : Number((value as string).trim());

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `${PREFIX}: "${name}" must be an integer between ${min} and ${max}, received "${String(value)}"`
    );
  }

  return parsed;
};

/**
 * Builds a pooled SMTP transport. Connections are opened lazily on the first
 * send (or on `verify()`), so constructing a transport never blocks startup.
 */
export const getTransporter = (options: smtpOptions): Transporter => {
  if (options === null || typeof options !== 'object') {
    throw new Error(`${PREFIX}: SMTP options are required`);
  }

  const host = readRequiredString('SMTP_HOST', options.SMTP_HOST);

  const port = readInteger('SMTP_PORT', options.SMTP_PORT, {
    fallback: SMTP_DEFAULTS.port,
    max: 65_535
  });
  const secure = readBoolean('SMTP_SECURE', options.SMTP_SECURE, port === 465);
  const requireTLS = readBoolean('requireTLS', options.requireTLS, !secure);

  const user = readOptionalString(options.SMTP_USER);
  const pass = readOptionalString(options.SMTP_PASS, false);

  if ((user === undefined) !== (pass === undefined)) {
    throw new Error(
      `${PREFIX}: "SMTP_USER" and "SMTP_PASS" must be configured together for the SMTP provider`
    );
  }

  const timeouts = options.timeouts ?? {};

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: secure ? undefined : requireTLS,
    auth: user !== undefined && pass !== undefined ? { user, pass } : undefined,
    pool: true,
    maxConnections: readInteger('maxConnections', options.maxConnections, {
      fallback: SMTP_DEFAULTS.maxConnections,
      max: 100
    }),
    maxMessages: readInteger('maxMessages', options.maxMessages, {
      fallback: SMTP_DEFAULTS.maxMessages
    }),
    connectionTimeout: readInteger('timeouts.connection', timeouts.connection, {
      fallback: SMTP_DEFAULTS.connectionTimeout
    }),
    greetingTimeout: readInteger('timeouts.greeting', timeouts.greeting, {
      fallback: SMTP_DEFAULTS.greetingTimeout
    }),
    socketTimeout: readInteger('timeouts.socket', timeouts.socket, {
      fallback: SMTP_DEFAULTS.socketTimeout
    }),
    tls: { minVersion: SMTP_DEFAULTS.tlsMinVersion }
  });
};

/**
 * Adapts a Nodemailer transporter to the transport-neutral `EmailSender`
 * contract used by `createEmailAdapter`.
 */
export const smtpSend =
  (transporter: Transporter): EmailSender =>
  async (message) => {
    await transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      // Messages only contain inline HTML; loading remote or local resources
      // would be an SSRF/arbitrary-file-read primitive.
      disableFileAccess: true,
      disableUrlAccess: true
    });
  };
