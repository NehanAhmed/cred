import { describe, expect, it } from 'vitest';
import { emailSmtp, type emailSmtpOptions } from './index.js';

const options = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_FROM: 'no-reply@example.com',
  BACKEND_URL: 'https://api.example.com'
};

describe('emailSmtp', () => {
  it('exposes the core adapter contract plus operational controls', async () => {
    const email = await emailSmtp(options);

    expect(email.SMTP.sendEmailVerification).toBeTypeOf('function');
    expect(email.SMTP.sendPasswordReset).toBeTypeOf('function');
    expect(email.verify).toBeTypeOf('function');
    expect(email.close).toBeTypeOf('function');
    expect(() => email.close()).not.toThrow();
  });

  it('does not open a connection unless verifyOnStart is enabled', async () => {
    await expect(emailSmtp({ ...options, verifyOnStart: false })).resolves.toBeDefined();
  });

  it('validates the configuration before building the transport', async () => {
    const missingSender = {
      SMTP_HOST: 'smtp.example.com',
      BACKEND_URL: 'https://api.example.com'
    } as unknown as emailSmtpOptions;

    await expect(emailSmtp(missingSender)).rejects.toThrow(/SMTP_FROM/);
    await expect(emailSmtp({ ...options, SMTP_HOST: '' })).rejects.toThrow(/SMTP_HOST/);
  });
});
