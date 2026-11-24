import { describe, expect, it } from 'vitest';
import { createEmailAdapter, type EmailSender, type OutboundEmail } from './email.helper.js';

const BACKEND_URL = 'https://api.example.com';
const EMAIL_FROM = 'no-reply@example.com';

const createCapturingSender = () => {
  const sent: OutboundEmail[] = [];
  const send: EmailSender = async (message) => {
    sent.push(message);
  };

  return { send, sent };
};

const buildAdapter = (overrides: Partial<Parameters<typeof createEmailAdapter>[1]> = {}) => {
  const fake = createCapturingSender();
  const adapter = createEmailAdapter(fake.send, { EMAIL_FROM, BACKEND_URL, ...overrides });

  return { ...fake, adapter };
};

describe('createEmailAdapter', () => {
  it('sends a verification email whose link points at the API', async () => {
    const { adapter, sent } = buildAdapter();

    await adapter.sendEmailVerification('user@example.com', 'raw-token');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: EMAIL_FROM,
      to: 'user@example.com',
      subject: 'Email Verification'
    });
    expect(sent[0].html).toContain(`${BACKEND_URL}/api/auth/verify-email/raw-token`);
  });

  it('does not resolve before the transport accepts the message', async () => {
    let release: (() => void) | undefined;
    const send: EmailSender = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const adapter = createEmailAdapter(send, { EMAIL_FROM, BACKEND_URL });

    let settled = false;
    const pending = adapter.sendEmailVerification('user@example.com', 'raw-token').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release?.();
    await pending;
    expect(settled).toBe(true);
  });

  it('propagates delivery failures with the transport error as cause', async () => {
    const transportError = new Error('connection refused');
    const failing: EmailSender = async () => {
      throw transportError;
    };
    const adapter = createEmailAdapter(failing, { EMAIL_FROM, BACKEND_URL });

    const error = await adapter
      .sendEmailVerification('user@example.com', 'raw-token')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('failed to send "Email Verification"');
    expect((error as Error).cause).toBe(transportError);
  });

  it('builds the reset link and states the expiry in UTC by default', async () => {
    const { adapter, sent } = buildAdapter();

    await adapter.sendPasswordReset('user@example.com', 'reset-token');

    expect(sent[0]).toMatchObject({
      to: 'user@example.com',
      subject: 'Password Reset Link'
    });
    expect(sent[0].html).toContain(`${BACKEND_URL}/api/auth/reset-password/reset-token`);
    expect(sent[0].html).toMatch(/expire at [A-Z][a-z]{2} \d{1,2}, \d{4}, .* UTC/);
  });

  it('tolerates a trailing slash on BACKEND_URL', async () => {
    const { adapter, sent } = buildAdapter({ BACKEND_URL: 'https://api.example.com/' });

    await adapter.sendEmailVerification('user@example.com', 'raw-token');

    expect(sent[0].html).toContain('https://api.example.com/api/auth/verify-email/raw-token');
    expect(sent[0].html).not.toContain('api.example.com//api');
  });

  it('URL-encodes tokens before embedding them in the link', async () => {
    const { adapter, sent } = buildAdapter();

    await adapter.sendEmailVerification('user@example.com', 'a/b+c d');

    expect(sent[0].html).toContain('/api/auth/verify-email/a%2Fb%2Bc%20d');
  });

  it('uses a custom auth path prefix for verification and reset links', async () => {
    const { adapter, sent } = buildAdapter({ authPathPrefix: '/auth' });

    await adapter.sendEmailVerification('user@example.com', 'raw-token');
    await adapter.sendPasswordReset('user@example.com', 'reset-token');

    expect(sent[0].html).toContain(`${BACKEND_URL}/auth/verify-email/raw-token`);
    expect(sent[0].html).not.toContain('/api/auth/');
    expect(sent[1].html).toContain(`${BACKEND_URL}/auth/reset-password/reset-token`);
    expect(sent[1].html).not.toContain('/api/auth/');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['missing leading slash', 'api/auth'],
    ['trailing slash', '/api/auth/'],
    ['root slash', '/'],
    ['query string', '/api/auth?tenant=cred'],
    ['fragment', '/api/auth#fragment'],
    ['inner whitespace', '/api auth']
  ])('rejects an invalid auth path prefix: %s', (_label, prefix) => {
    const { send } = createCapturingSender();

    expect(() =>
      createEmailAdapter(send, { EMAIL_FROM, BACKEND_URL, authPathPrefix: prefix })
    ).toThrow(/authPathPrefix/);
  });

  it('honours a custom time zone for the reset expiry', async () => {
    const { adapter, sent } = buildAdapter({ timeZone: 'Asia/Kolkata' });

    await adapter.sendPasswordReset('user@example.com', 'reset-token');

    expect(sent[0].html).toMatch(/GMT\+5:30/);
  });

  it.each([
    ['relative URL', 'api.example.com'],
    ['non http scheme', 'ftp://api.example.com'],
    ['query string', 'https://api.example.com/?tenant=cred']
  ])('rejects an invalid BACKEND_URL: %s', (_label, backendUrl) => {
    const { send } = createCapturingSender();

    expect(() => createEmailAdapter(send, { EMAIL_FROM, BACKEND_URL: backendUrl })).toThrow(
      /BACKEND_URL/
    );
  });

  it('rejects a missing sender address', () => {
    const { send } = createCapturingSender();

    expect(() => createEmailAdapter(send, { EMAIL_FROM: '  ', BACKEND_URL })).toThrow(/EMAIL_FROM/);
  });

  it('rejects an unknown time zone instead of silently using the server zone', () => {
    const { send } = createCapturingSender();

    expect(() =>
      createEmailAdapter(send, { EMAIL_FROM, BACKEND_URL, timeZone: 'Mars/Olympus' })
    ).toThrow(/timeZone/);
  });

  it.each([0, -1, 1.5])('rejects a non positive reset token lifetime: %s', (ttl) => {
    const { send } = createCapturingSender();

    expect(() =>
      createEmailAdapter(send, { EMAIL_FROM, BACKEND_URL, resetTokenTtlMs: ttl })
    ).toThrow(/resetTokenTtlMs/);
  });
});
