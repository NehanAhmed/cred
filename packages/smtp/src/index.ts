import type { EmailAdapter } from '@cred/core';
import { createEmailAdapter, type EmailSender } from './helpers/email.helper.js';
import { getTransporter, smtpSend, type smtpOptions } from './lib/transporter.js';
import { createResendSender, type resendOptions } from './lib/resend.js';

export type { smtpOptions, smtpTimeouts } from './lib/transporter.js';
export type { resendOptions, ResendSender } from './lib/resend.js';
export type { FetchLike, HttpClient, RetryOptions } from './lib/http.js';
export { EmailApiError } from './lib/http.js';
export type { EmailSender, OutboundEmail } from './helpers/email.helper.js';

const PREFIX = '@cred/smtp';

export type EmailProvider = 'smtp' | 'resend';

export type emailServiceOptions = smtpOptions &
  resendOptions & {
    /** Transport to use. Defaults to auto-detection (see `resolveProvider`). */
    provider?: EmailProvider;
    /** Envelope sender used for every message. */
    EMAIL_FROM: string;
    /** Public base URL used to build verification and reset links. */
    BACKEND_URL: string;
    /** IANA time zone used for the reset-link expiry. Defaults to `UTC`. */
    timeZone?: string;
    /** Reset-link lifetime in milliseconds. Defaults to one hour. */
    resetTokenTtlMs?: number;
    /**
     * Verify the selected transport's credentials while building the service.
     * Defaults to `false`: a temporary mail outage must not prevent the API
     * from starting.
     */
    verifyOnStart?: boolean;
  };

export interface EmailService {
  /** Core's email contract, backed by the selected transport. */
  EMAIL: EmailAdapter;
  /** Opens a connection/authenticates against the selected provider. */
  verify(): Promise<void>;
  /** Releases transport resources. Call this during application shutdown. */
  close(): void;
}

const PROVIDERS: readonly EmailProvider[] = ['smtp', 'resend'];

const isConfigured = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * Resolves the transport in use.
 *
 * An explicit `provider` always wins. Otherwise Resend is selected when
 * `RESEND_API_KEY` is configured and SMTP is the fallback, which lets an
 * existing SMTP deployment move to the API by adding one environment variable.
 */
export const resolveProvider = (
  options: Pick<emailServiceOptions, 'provider' | 'RESEND_API_KEY'>
): EmailProvider => {
  if (options.provider !== undefined && !PROVIDERS.includes(options.provider)) {
    throw new Error(
      `${PREFIX}: "provider" must be one of ${PROVIDERS.join(', ')}, received "${String(
        options.provider
      )}"`
    );
  }

  if (options.provider !== undefined) return options.provider;

  return isConfigured(options.RESEND_API_KEY) ? 'resend' : 'smtp';
};

/**
 * Builds the email service used by core's `EmailAdapter` contract.
 *
 * ```ts
 * const { EMAIL, verify, close } = await emailService({
 *   EMAIL_FROM: 'no-reply@example.com',
 *   BACKEND_URL: 'https://api.example.com',
 *   RESEND_API_KEY: process.env.RESEND_API_KEY // omit to use SMTP
 * });
 * ```
 */
export async function emailService(options: emailServiceOptions): Promise<EmailService> {
  if (options === null || typeof options !== 'object') {
    throw new Error(`${PREFIX}: email service options are required`);
  }

  const provider = resolveProvider(options);
  const { EMAIL_FROM, BACKEND_URL, timeZone, resetTokenTtlMs, verifyOnStart = false } = options;

  let send: EmailSender;
  let verify: () => Promise<void>;
  let close: () => void;

  if (provider === 'resend') {
    const resend = createResendSender(options);

    send = resend.send;
    verify = resend.verify;
    // Stateless HTTP: nothing to release.
    close = () => {};
  } else {
    const transporter = getTransporter(options);

    send = smtpSend(transporter);
    verify = async () => {
      try {
        await transporter.verify();
      } catch (error) {
        throw new Error(`${PREFIX}: SMTP connection verification failed`, { cause: error });
      }
    };
    close = () => {
      transporter.close();
    };
  }

  const EMAIL = createEmailAdapter(send, {
    EMAIL_FROM,
    BACKEND_URL,
    timeZone,
    resetTokenTtlMs
  });

  if (verifyOnStart) {
    try {
      await verify();
    } catch (error) {
      // Do not leak connections created for a transport that never became
      // usable.
      close();
      throw error;
    }
  }

  return { EMAIL, verify, close };
}
