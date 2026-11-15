import type { EmailAdapter } from '@cred/core';
import { getTransporter, type smtpOptions } from './lib/transporter.js';
import { emailAdapter } from './helpers/email.helper.js';

export type { smtpConnectionOptions, smtpOptions, smtpTimeouts } from './lib/transporter.js';

const PREFIX = '@cred/smtp';

export type emailSmtpOptions = smtpOptions & {
  /** Public base URL used to build verification and reset links. */
  BACKEND_URL: string;
  /** IANA time zone used for the reset-link expiry. Defaults to `UTC`. */
  timeZone?: string;
  /** Reset-link lifetime in milliseconds. Defaults to one hour. */
  resetTokenTtlMs?: number;
  /**
   * Verify host, TLS and credentials while building the adapter. Defaults to
   * `false`: a temporary mail outage must not prevent the API from starting.
   */
  verifyOnStart?: boolean;
};

export interface EmailSMTP {
  SMTP: EmailAdapter;
  /** Opens a connection and authenticates against the SMTP server. */
  verify(): Promise<void>;
  /** Closes pooled connections. Call this during application shutdown. */
  close(): void;
}

export async function emailSmtp(options: emailSmtpOptions): Promise<EmailSMTP> {
  const {
    SMTP_FROM,
    BACKEND_URL,
    timeZone,
    resetTokenTtlMs,
    verifyOnStart = false,
    ...smtp
  } = options;

  const transporter = getTransporter(smtp);
  const SMTP = emailAdapter(transporter, {
    SMTP_FROM,
    BACKEND_URL,
    timeZone,
    resetTokenTtlMs
  });

  const verify = async (): Promise<void> => {
    try {
      await transporter.verify();
    } catch (error) {
      throw new Error(`${PREFIX}: SMTP connection verification failed`, { cause: error });
    }
  };

  if (verifyOnStart) {
    try {
      await verify();
    } catch (error) {
      // Do not leak the pooled sockets created for a transport that never
      // became usable.
      transporter.close();
      throw error;
    }
  }

  return {
    SMTP,
    verify,
    close: () => {
      transporter.close();
    }
  };
}
