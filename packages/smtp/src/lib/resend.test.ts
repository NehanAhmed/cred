import { describe, expect, it } from 'vitest';
import { createResendSender } from './resend.js';
import { EmailApiError, type FetchLike } from './http.js';
import {
  bodyOf,
  createFetchHarness,
  headersOf,
  jsonResponse,
  type NextResponse
} from '../__tests__/http-fakes.js';

const API_KEY = 're_secret_key';

const message = {
  from: 'no-reply@example.com',
  to: 'user@example.com',
  subject: 'Email Verification',
  html: '<p>Hello</p>'
};

const createSender = (
  responses: Array<NextResponse | Error> = [jsonResponse({ id: 'message-1' })],
  overrides = {}
) => {
  const harness = createFetchHarness(responses);
  const sender = createResendSender({
    RESEND_API_KEY: API_KEY,
    fetchImpl: harness.fetchImpl,
    sleep: harness.sleep,
    ...overrides
  });

  return { sender, ...harness };
};

describe('createResendSender', () => {
  it('posts the message to the Resend emails endpoint', async () => {
    const { sender, calls } = createSender();

    await sender.send(message);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].init.method).toBe('POST');
    expect(headersOf(calls[0].init).Authorization).toBe(`Bearer ${API_KEY}`);
    expect(bodyOf(calls[0].init)).toEqual({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html
    });
  });

  it('honours a custom API base URL', async () => {
    const { sender, calls } = createSender(undefined, {
      RESEND_BASE_URL: 'http://127.0.0.1:4010/'
    });

    await sender.send(message);

    expect(calls[0].url).toBe('http://127.0.0.1:4010/emails');
  });

  it('verifies credentials with a read-only request', async () => {
    const { sender, calls } = createSender([jsonResponse({ data: [] })]);

    await sender.verify();

    expect(calls[0].url).toBe('https://api.resend.com/domains');
    expect(calls[0].init.method).toBe('GET');
    expect(headersOf(calls[0].init).Authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('does not retry rejected payloads', async () => {
    const { sender, calls } = createSender([
      jsonResponse({ message: 'invalid from address' }, { status: 422 })
    ]);

    const error = await sender.send(message).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailApiError);
    expect((error as EmailApiError).status).toBe(422);
    expect(calls).toHaveLength(1);
  });

  it('requires an API key', () => {
    expect(() => createResendSender({ RESEND_API_KEY: '  ' })).toThrow(/RESEND_API_KEY/);
    expect(() => createResendSender({})).toThrow(/RESEND_API_KEY/);
  });

  it('accepts an injected fetch implementation', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ id: 'message-9' }), { status: 200 });
    };

    const sender = createResendSender({ RESEND_API_KEY: API_KEY, fetchImpl });
    await sender.send(message);

    expect(calls).toEqual(['https://api.resend.com/emails']);
  });
});
