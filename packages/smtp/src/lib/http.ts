import { randomUUID } from 'node:crypto';

const PREFIX = '@cred-kit/smtp';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Bounded retry policy for transient transport failures. */
export type RetryOptions = {
  /** Total attempts, including the first. Defaults to 3. */
  maxAttempts?: number;
  /** Base delay before the first retry. Defaults to 500ms. */
  initialDelayMs?: number;
  /** Upper bound for any single delay. Defaults to 5000ms. */
  maxDelayMs?: number;
};

export type HttpClientOptions = {
  /** Human readable provider name used in error messages. */
  provider: string;
  apiKey: string;
  /** Absolute base URL, for example `https://api.resend.com`. */
  baseUrl: string;
  /** Per-attempt timeout in milliseconds. Defaults to 10s. */
  requestTimeoutMs?: number;
  retry?: RetryOptions;
  /** Injection point for tests. */
  fetchImpl?: FetchLike;
  /** Injection point for tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type HttpRequest = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
};

export type HttpClient = {
  request<T>(request: HttpRequest): Promise<T>;
};

/**
 * Raised for every provider failure. The message never contains the API key or
 * the raw response body past the provider's own message.
 */
export class EmailApiError extends Error {
  readonly provider: string;
  readonly status?: number;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(
      `${PREFIX}: ${message}`,
      options.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = 'EmailApiError';
    this.provider = provider;
    this.status = options.status;
  }
}

const HTTP_DEFAULTS = {
  requestTimeoutMs: 10_000,
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 5_000
} as const;

/** Statuses that guarantee the provider did not accept the message. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const MAX_ERROR_DETAIL_LENGTH = 300;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const readPositiveInteger = (
  provider: string,
  name: string,
  value: number | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
): number => {
  if (value === undefined || value === null) return fallback;

  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new EmailApiError(
      provider,
      `"${name}" must be an integer between 1 and ${max}, received "${String(value)}"`
    );
  }

  return value;
};

const normalizeBaseUrl = (provider: string, value: string): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new EmailApiError(provider, `base URL must be an absolute URL, received "${value}"`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EmailApiError(
      provider,
      `base URL must use http or https, received "${url.protocol}"`
    );
  }

  if (url.search !== '' || url.hash !== '') {
    throw new EmailApiError(provider, 'base URL must not contain a query string or fragment');
  }

  return url.href.replace(/\/+$/, '');
};

const backoffDelay = (attempt: number, initialDelayMs: number, maxDelayMs: number): number => {
  const exponential = Math.min(initialDelayMs * 2 ** (attempt - 1), maxDelayMs);

  // Equal jitter keeps retries from stampeding the provider.
  return Math.round(exponential / 2 + (Math.random() * exponential) / 2);
};

const parseRetryAfter = (value: string | null, maxDelayMs: number): number | undefined => {
  if (isBlank(value)) return undefined;

  const seconds = Number((value as string).trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxDelayMs);
  }

  const timestamp = Date.parse(value as string);
  if (Number.isNaN(timestamp)) return undefined;

  return Math.min(Math.max(timestamp - Date.now(), 0), maxDelayMs);
};

const redact = (message: string, apiKey: string): string =>
  apiKey === '' ? message : message.split(apiKey).join('[redacted]');

const truncate = (value: string): string =>
  value.length > MAX_ERROR_DETAIL_LENGTH ? `${value.slice(0, MAX_ERROR_DETAIL_LENGTH)}...` : value;

const readProviderMessage = async (response: Response): Promise<string | undefined> => {
  let body: string;

  try {
    body = await response.text();
  } catch {
    return undefined;
  }

  if (body.trim() === '') return undefined;

  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown; name?: unknown };

    if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
      return truncate(parsed.message.trim());
    }

    if (typeof parsed.error === 'string' && parsed.error.trim() !== '') {
      return truncate(parsed.error.trim());
    }

    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
      return truncate(parsed.name.trim());
    }
  } catch {
    // Not JSON: fall through to the raw body.
  }

  return truncate(body.trim());
};

const createResponseError = async (
  provider: string,
  request: HttpRequest,
  response: Response,
  apiKey: string
): Promise<EmailApiError> => {
  const detail = await readProviderMessage(response);
  const summary = `${request.method} ${request.path} failed with ${response.status}${
    response.statusText ? ` ${response.statusText}` : ''
  }${detail ? `: ${detail}` : ''}`;

  return new EmailApiError(provider, redact(summary, apiKey), { status: response.status });
};

const parseSuccessBody = async <T>(
  provider: string,
  request: HttpRequest,
  response: Response
): Promise<T> => {
  const body = await response.text();
  if (body.trim() === '') return undefined as T;

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new EmailApiError(
      provider,
      `${request.method} ${request.path} returned a non-JSON response`,
      { status: response.status, cause: error }
    );
  }
};

/**
 * Minimal JSON-over-HTTP client for email providers.
 *
 * - Bounds every attempt with an `AbortController` timeout.
 * - Retries only failures that cannot have accepted the message (`408`, `429`,
 *   `5xx`) plus network errors/timeouts, with exponential backoff, jitter and
 *   `Retry-After` support. Other `4xx` responses fail immediately.
 * - Sends a stable `Idempotency-Key` across attempts so providers that support
 *   it can de-duplicate retried sends.
 * - Never logs or embeds the API key in an error.
 */
export const createHttpClient = (options: HttpClientOptions): HttpClient => {
  if (options === null || typeof options !== 'object') {
    throw new Error(`${PREFIX}: HTTP client options are required`);
  }

  const provider = isBlank(options.provider) ? 'Email provider' : options.provider.trim();
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';

  if (apiKey === '') {
    throw new EmailApiError(provider, `API key is required for the ${provider} provider`);
  }

  const baseUrl = normalizeBaseUrl(provider, options.baseUrl);
  const requestTimeoutMs = readPositiveInteger(
    provider,
    'requestTimeoutMs',
    options.requestTimeoutMs,
    HTTP_DEFAULTS.requestTimeoutMs,
    120_000
  );
  const maxAttempts = readPositiveInteger(
    provider,
    'retry.maxAttempts',
    options.retry?.maxAttempts,
    HTTP_DEFAULTS.maxAttempts,
    10
  );
  const initialDelayMs = readPositiveInteger(
    provider,
    'retry.initialDelayMs',
    options.retry?.initialDelayMs,
    HTTP_DEFAULTS.initialDelayMs,
    60_000
  );
  const maxDelayMs = readPositiveInteger(
    provider,
    'retry.maxDelayMs',
    options.retry?.maxDelayMs,
    HTTP_DEFAULTS.maxDelayMs,
    60_000
  );

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  if (typeof fetchImpl !== 'function') {
    throw new EmailApiError(provider, 'global fetch is unavailable; Node 18 or newer is required');
  }

  const sleep = options.sleep ?? defaultSleep;

  const request = async <T>(payload: HttpRequest): Promise<T> => {
    const url = `${baseUrl}${payload.path}`;
    const idempotencyKey = randomUUID();

    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: payload.method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            ...(payload.body === undefined
              ? {}
              : { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey })
          },
          body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
          signal: controller.signal
        });

        if (response.ok) {
          return await parseSuccessBody<T>(provider, payload, response);
        }

        const error = await createResponseError(provider, payload, response, apiKey);

        if (attempt < maxAttempts && RETRYABLE_STATUSES.has(response.status)) {
          const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), maxDelayMs);
          await sleep(retryAfterMs ?? backoffDelay(attempt, initialDelayMs, maxDelayMs));
          continue;
        }

        throw error;
      } catch (error) {
        if (error instanceof EmailApiError) throw error;

        const timedOut = controller.signal.aborted;
        const failure = new EmailApiError(
          provider,
          timedOut
            ? `${payload.method} ${payload.path} timed out after ${requestTimeoutMs}ms`
            : `${payload.method} ${payload.path} failed with a network error: ${
                error instanceof Error ? error.message : String(error)
              }`,
          { cause: error }
        );

        if (attempt < maxAttempts) {
          await sleep(backoffDelay(attempt, initialDelayMs, maxDelayMs));
          continue;
        }

        throw failure;
      } finally {
        clearTimeout(timeout);
      }
    }
  };

  return { request };
};
