import { describe, expect, it } from 'vitest';
import { createHttpClient, EmailApiError, type FetchLike, type HttpClientOptions } from './http.js';
import {
  bodyOf,
  createFetchHarness,
  headersOf,
  jsonResponse,
  type NextResponse
} from '../__tests__/http-fakes.js';

const API_KEY = 're_secret_key';

const createClient = (
  responses: Array<NextResponse | Error>,
  overrides: Partial<HttpClientOptions> = {}
) => {
  const harness = createFetchHarness(responses);
  const client = createHttpClient({
    provider: 'Resend',
    apiKey: API_KEY,
    baseUrl: 'https://api.example.com/',
    retry: { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 1000 },
    fetchImpl: harness.fetchImpl,
    sleep: harness.sleep,
    ...overrides
  });

  return { client, ...harness };
};

describe('createHttpClient', () => {
  it('posts JSON with bearer auth and returns the parsed body', async () => {
    const { client, calls } = createClient([jsonResponse({ id: 'message-1' })]);

    const result = await client.request<{ id: string }>({
      method: 'POST',
      path: '/emails',
      body: { from: 'no-reply@example.com' }
    });

    expect(result).toEqual({ id: 'message-1' });
    expect(calls[0].url).toBe('https://api.example.com/emails');
    expect(headersOf(calls[0].init).Authorization).toBe(`Bearer ${API_KEY}`);
    expect(headersOf(calls[0].init)['Content-Type']).toBe('application/json');
    expect(headersOf(calls[0].init)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodyOf(calls[0].init)).toEqual({ from: 'no-reply@example.com' });
  });

  it('omits the body and idempotency key for GET requests', async () => {
    const { client, calls } = createClient([jsonResponse({ data: [] })]);

    await client.request({ method: 'GET', path: '/domains' });

    expect(calls[0].init.body).toBeUndefined();
    expect(headersOf(calls[0].init)['Idempotency-Key']).toBeUndefined();
  });

  it('retries 429 responses and honours Retry-After', async () => {
    const { client, calls, sleeps } = createClient([
      jsonResponse({ message: 'rate limited' }, { status: 429, headers: { 'retry-after': '2' } }),
      jsonResponse({ id: 'message-2' })
    ]);

    const result = await client.request<{ id: string }>({
      method: 'POST',
      path: '/emails',
      body: {}
    });

    expect(result).toEqual({ id: 'message-2' });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it('retries 5xx responses and reuses the idempotency key', async () => {
    const { client, calls } = createClient([
      jsonResponse({ message: 'unavailable' }, { status: 503 }),
      jsonResponse({ id: 'message-3' })
    ]);

    await client.request({ method: 'POST', path: '/emails', body: {} });

    expect(calls).toHaveLength(2);
    expect(headersOf(calls[0].init)['Idempotency-Key']).toBe(
      headersOf(calls[1].init)['Idempotency-Key']
    );
  });

  it('backs off with jitter when the provider sends no Retry-After', async () => {
    const { client, sleeps } = createClient([
      jsonResponse({}, { status: 500 }),
      jsonResponse({ id: 'message-4' })
    ]);

    await client.request({ method: 'POST', path: '/emails', body: {} });

    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(50);
    expect(sleeps[0]).toBeLessThanOrEqual(100);
  });

  it.each([400, 401, 403, 404, 422])('does not retry %s responses', async (status) => {
    const { client, calls } = createClient([
      jsonResponse({ message: 'request rejected' }, { status })
    ]);

    const error = await client
      .request({ method: 'POST', path: '/emails', body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailApiError);
    expect((error as EmailApiError).status).toBe(status);
    expect(calls).toHaveLength(1);
  });

  it('surfaces the provider message without leaking the API key', async () => {
    const { client } = createClient([
      jsonResponse({ message: `invalid api key ${API_KEY}` }, { status: 401 })
    ]);

    const error = await client
      .request({ method: 'POST', path: '/emails', body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailApiError);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).toContain('[redacted]');
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it('retries network errors and preserves the cause', async () => {
    const networkError = new Error('ECONNRESET');
    const { client, calls, sleeps } = createClient([networkError]);

    const error = await client
      .request({ method: 'POST', path: '/emails', body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailApiError);
    expect((error as Error).cause).toBe(networkError);
    expect((error as Error).message).toContain('network error');
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
  });

  it('aborts hanging requests and reports a timeout', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    const client = createHttpClient({
      provider: 'Resend',
      apiKey: API_KEY,
      baseUrl: 'https://api.example.com',
      requestTimeoutMs: 5,
      retry: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 2 },
      fetchImpl: hanging,
      sleep: async () => {}
    });

    const error = await client
      .request({ method: 'GET', path: '/domains' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailApiError);
    expect((error as Error).message).toContain('timed out after 5ms');
  });

  it('treats a non-JSON success body as an error without retrying', async () => {
    const { client, calls } = createClient([() => new Response('not json', { status: 200 })]);

    await expect(client.request({ method: 'GET', path: '/domains' })).rejects.toThrow(/non-JSON/);
    expect(calls).toHaveLength(1);
  });

  it('returns undefined for an empty success body', async () => {
    const { client } = createClient([() => new Response(null, { status: 204 })]);

    await expect(client.request({ method: 'GET', path: '/domains' })).resolves.toBeUndefined();
  });

  it.each([
    ['blank API key', { apiKey: '   ' }, /API key/],
    ['relative base URL', { baseUrl: 'api.example.com' }, /base URL/],
    ['non http base URL', { baseUrl: 'ftp://api.example.com' }, /http or https/],
    ['base URL with query', { baseUrl: 'https://api.example.com/?tenant=cred' }, /query string/],
    ['invalid attempt count', { retry: { maxAttempts: 0 } }, /maxAttempts/],
    ['invalid initial delay', { retry: { initialDelayMs: -1 } }, /initialDelayMs/]
  ])('rejects an invalid configuration: %s', (_label, overrides, expected) => {
    expect(() =>
      createHttpClient({
        provider: 'Resend',
        apiKey: API_KEY,
        baseUrl: 'https://api.example.com',
        ...(overrides as Partial<HttpClientOptions>)
      })
    ).toThrow(expected);
  });
});
