import { createHttpClient, type FetchLike, type RetryOptions } from './http.js';
import type { EmailSender } from '../helpers/email.helper.js';

const PREFIX = '@cred-kit/smtp';

export const RESEND_DEFAULTS = {
  baseUrl: 'https://api.resend.com',
  requestTimeoutMs: 10_000
} as const;

/**
 * Resend API settings. Only used when the Resend provider is selected, so
 * everything is optional here and validated when the sender is built.
 */
export type resendOptions = {
  RESEND_API_KEY?: string;
  /** API base URL. Defaults to `https://api.resend.com`. */
  RESEND_BASE_URL?: string;
  /** Per-request timeout in milliseconds. Defaults to 10s. */
  requestTimeoutMs?: number;
  retry?: RetryOptions;
  /** Injection point for tests. */
  fetchImpl?: FetchLike;
  /** Injection point for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type ResendSender = {
  send: EmailSender;
  verify: () => Promise<void>;
};

const readApiKey = (value: string | undefined): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${PREFIX}: "RESEND_API_KEY" is required for the Resend provider`);
  }

  return value.trim();
};

/**
 * Builds a Resend sender on top of the shared HTTP client.
 *
 * Sending uses `POST /emails`; `verify()` performs a read-only `GET /domains`
 * so bad credentials or an unreachable API surface before the first real send.
 */
export const createResendSender = (options: resendOptions): ResendSender => {
  if (options === null || typeof options !== 'object') {
    throw new Error(`${PREFIX}: Resend options are required`);
  }

  const client = createHttpClient({
    provider: 'Resend',
    apiKey: readApiKey(options.RESEND_API_KEY),
    baseUrl: options.RESEND_BASE_URL?.trim() || RESEND_DEFAULTS.baseUrl,
    requestTimeoutMs: options.requestTimeoutMs ?? RESEND_DEFAULTS.requestTimeoutMs,
    retry: options.retry,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep
  });

  return {
    send: async (message) => {
      await client.request<{ id?: string }>({
        method: 'POST',
        path: '/emails',
        body: {
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html
        }
      });
    },
    verify: async () => {
      await client.request<unknown>({ method: 'GET', path: '/domains' });
    }
  };
};
