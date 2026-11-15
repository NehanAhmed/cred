import { describe, expect, it } from 'vitest';
import { emailService, resolveProvider, type EmailProvider } from './index.js';
import { EmailApiError } from './lib/http.js';
import { bodyOf, createFetchHarness, jsonResponse } from './__tests__/http-fakes.js';

const baseOptions = {
  EMAIL_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com'
};

describe('resolveProvider', () => {
  it('prefers an explicit provider', () => {
    expect(resolveProvider({ provider: 'smtp', RESEND_API_KEY: 're_key' })).toBe('smtp');
    expect(resolveProvider({ provider: 'resend' })).toBe('resend');
  });

  it('auto-detects Resend when an API key is configured', () => {
    expect(resolveProvider({ RESEND_API_KEY: 're_key' })).toBe('resend');
    expect(resolveProvider({ RESEND_API_KEY: '  ' })).toBe('smtp');
  });

  it('falls back to SMTP', () => {
    expect(resolveProvider({})).toBe('smtp');
  });

  it('rejects an unknown provider', () => {
    expect(() => resolveProvider({ provider: 'mailgun' as unknown as EmailProvider })).toThrow(
      /provider/
    );
  });
});

describe('emailService', () => {
  it('builds an SMTP-backed service without opening a connection', async () => {
    const service = await emailService({ ...baseOptions, SMTP_HOST: 'smtp.example.com' });

    expect(service.EMAIL.sendEmailVerification).toBeTypeOf('function');
    expect(service.EMAIL.sendPasswordReset).toBeTypeOf('function');
    expect(service.verify).toBeTypeOf('function');
    expect(service.close).toBeTypeOf('function');
    expect(() => service.close()).not.toThrow();
  });

  it('builds a Resend-backed service and sends through the API', async () => {
    const harness = createFetchHarness([jsonResponse({ id: 'message-1' })]);
    const service = await emailService({
      ...baseOptions,
      RESEND_API_KEY: 're_key',
      fetchImpl: harness.fetchImpl,
      sleep: harness.sleep
    });

    await service.EMAIL.sendEmailVerification('user@example.com', 'raw-token');

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].url).toBe('https://api.resend.com/emails');
    expect(bodyOf(harness.calls[0].init)).toMatchObject({
      from: baseOptions.EMAIL_FROM,
      to: 'user@example.com',
      subject: 'Email Verification'
    });
    expect((bodyOf(harness.calls[0].init) as { html: string }).html).toContain(
      `${baseOptions.BACKEND_URL}/api/auth/verify-email/raw-token`
    );
    expect(() => service.close()).not.toThrow();
  });

  it('honours an explicit SMTP provider even when a Resend key is present', async () => {
    await expect(
      emailService({ ...baseOptions, provider: 'smtp', RESEND_API_KEY: 're_key' })
    ).rejects.toThrow(/SMTP_HOST/);
  });

  it('requires the selected provider credentials', async () => {
    await expect(emailService({ ...baseOptions, provider: 'resend' })).rejects.toThrow(
      /RESEND_API_KEY/
    );
    await expect(emailService(baseOptions)).rejects.toThrow(/SMTP_HOST/);
  });

  it('does not contact the provider when verifyOnStart is disabled', async () => {
    const harness = createFetchHarness([jsonResponse({ data: [] })]);
    await emailService({
      ...baseOptions,
      RESEND_API_KEY: 're_key',
      fetchImpl: harness.fetchImpl,
      sleep: harness.sleep
    });

    expect(harness.calls).toHaveLength(0);
  });

  it('verifies the selected provider when verifyOnStart is enabled', async () => {
    const harness = createFetchHarness([jsonResponse({ data: [] })]);
    await emailService({
      ...baseOptions,
      RESEND_API_KEY: 're_key',
      verifyOnStart: true,
      fetchImpl: harness.fetchImpl,
      sleep: harness.sleep
    });

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0].url).toBe('https://api.resend.com/domains');
    expect(harness.calls[0].init.method).toBe('GET');
  });

  it('rejects when startup verification fails', async () => {
    const harness = createFetchHarness([
      jsonResponse({ message: 'invalid api key' }, { status: 401 })
    ]);

    await expect(
      emailService({
        ...baseOptions,
        RESEND_API_KEY: 're_key',
        verifyOnStart: true,
        fetchImpl: harness.fetchImpl,
        sleep: harness.sleep
      })
    ).rejects.toBeInstanceOf(EmailApiError);
  });

  it('propagates provider failures from the adapter with the cause preserved', async () => {
    const harness = createFetchHarness([
      jsonResponse({ message: 'invalid from address' }, { status: 422 })
    ]);
    const service = await emailService({
      ...baseOptions,
      RESEND_API_KEY: 're_key',
      fetchImpl: harness.fetchImpl,
      sleep: harness.sleep
    });

    const error = await service.EMAIL.sendPasswordReset('user@example.com', 'raw-token').catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('failed to send "Password Reset Link"');
    expect((error as Error).cause).toBeInstanceOf(EmailApiError);
    expect(((error as Error).cause as EmailApiError).status).toBe(422);
  });
});
