import { describe, expect, it, vi } from 'vitest';
import type nodemailer from 'nodemailer';
import { emailAdapter, type emailAdapterOptions } from './email.helper.js';

type SentMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  disableFileAccess: boolean;
  disableUrlAccess: boolean;
};

const BACKEND_URL = 'https://api.example.com';
const SMTP_FROM = 'no-reply@example.com';

const createFakeTransporter = () => {
  const sent: SentMessage[] = [];
  const sendMail = vi.fn(async (message: SentMessage) => {
    sent.push(message);
    return { messageId: `message-${sent.length}` };
  });

  return {
    transporter: { sendMail } as unknown as nodemailer.Transporter,
    sent,
    sendMail
  };
};

const buildAdapter = (overrides: Partial<emailAdapterOptions> = {}) => {
  const fake = createFakeTransporter();
  const adapter = emailAdapter(fake.transporter, { BACKEND_URL, SMTP_FROM, ...overrides });

  return { ...fake, adapter };
};

describe('emailAdapter', () => {
  it('sends a verification email whose link points at the API', async () => {
    const { adapter, sent } = buildAdapter();

    await adapter.sendEmailVerification('user@example.com', 'raw-token');

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      from: SMTP_FROM,
      to: 'user@example.com',
      subject: 'Email Verification'
    });
    expect(sent[0].html).toContain(`${BACKEND_URL}/api/auth/verify-email/raw-token`);
  });

  it('hardens the message against remote and local resource loading', async () => {
    const { adapter, sent } = buildAdapter();

    await adapter.sendPasswordReset('user@example.com', 'raw-token');

    expect(sent[0].disableFileAccess).toBe(true);
    expect(sent[0].disableUrlAccess).toBe(true);
  });

  it('does not resolve before the SMTP server accepts the message', async () => {
    let release: (() => void) | undefined;
    const sendMail = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ messageId: 'pending' });
        })
    );
    const adapter = emailAdapter({ sendMail } as unknown as nodemailer.Transporter, {
      SMTP_FROM,
      BACKEND_URL
    });

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
    const transporter = {
      sendMail: vi.fn(async () => {
        throw new Error('connection refused');
      })
    } as unknown as nodemailer.Transporter;
    const adapter = emailAdapter(transporter, { SMTP_FROM, BACKEND_URL });

    await expect(
      adapter.sendEmailVerification('user@example.com', 'raw-token')
    ).rejects.toMatchObject({
      message: expect.stringContaining('failed to send "Email Verification"'),
      cause: expect.objectContaining({ message: 'connection refused' })
    });

    await expect(adapter.sendPasswordReset('user@example.com', 'raw-token')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'connection refused' })
    });
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
    const { transporter } = createFakeTransporter();

    expect(() => emailAdapter(transporter, { SMTP_FROM, BACKEND_URL: backendUrl })).toThrow(
      /BACKEND_URL/
    );
  });

  it('rejects a missing sender address', () => {
    const { transporter } = createFakeTransporter();

    expect(() => emailAdapter(transporter, { SMTP_FROM: '  ', BACKEND_URL })).toThrow(/SMTP_FROM/);
  });

  it('rejects an unknown time zone instead of silently using the server zone', () => {
    const { transporter } = createFakeTransporter();

    expect(() =>
      emailAdapter(transporter, { SMTP_FROM, BACKEND_URL, timeZone: 'Mars/Olympus' })
    ).toThrow(/timeZone/);
  });

  it('rejects a non positive reset token lifetime', () => {
    const { transporter } = createFakeTransporter();

    expect(() => emailAdapter(transporter, { SMTP_FROM, BACKEND_URL, resetTokenTtlMs: 0 })).toThrow(
      /resetTokenTtlMs/
    );
  });
});
