import { describe, expect, it, vi } from 'vitest';
import type nodemailer from 'nodemailer';
import { getTransporter, smtpSend, type smtpOptions } from './transporter.js';

const baseOptions: smtpOptions = {
  SMTP_HOST: 'smtp.example.com'
};

type TransportInternals = {
  options: Record<string, unknown>;
};

const readInternals = (transporter: ReturnType<typeof getTransporter>): TransportInternals =>
  transporter as unknown as TransportInternals;

describe('getTransporter', () => {
  it('applies safe defaults for port, TLS and pooling', () => {
    const internals = readInternals(getTransporter(baseOptions));

    expect(internals.options.host).toBe('smtp.example.com');
    expect(internals.options.port).toBe(587);
    expect(internals.options.secure).toBe(false);
    expect(internals.options.requireTLS).toBe(true);
    expect(internals.options.pool).toBe(true);
    expect(internals.options.maxConnections).toBe(5);
    expect(internals.options.maxMessages).toBe(100);
    expect(internals.options.connectionTimeout).toBe(10_000);
    expect(internals.options.greetingTimeout).toBe(10_000);
    expect(internals.options.socketTimeout).toBe(30_000);
    expect(internals.options.auth).toBeUndefined();
  });

  it('enables implicit TLS for port 465 unless told otherwise', () => {
    const internals = readInternals(getTransporter({ ...baseOptions, SMTP_PORT: '465' }));

    expect(internals.options.secure).toBe(true);
    expect(internals.options.requireTLS).toBeUndefined();
  });

  it('parses environment-style booleans instead of trusting truthiness', () => {
    const disabled = readInternals(
      getTransporter({ ...baseOptions, SMTP_PORT: '465', SMTP_SECURE: 'false' })
    );
    const enabled = readInternals(getTransporter({ ...baseOptions, SMTP_SECURE: 'TRUE' }));

    expect(disabled.options.secure).toBe(false);
    expect(enabled.options.secure).toBe(true);
  });

  it('passes credentials only when both halves are present', () => {
    const internals = readInternals(
      getTransporter({ ...baseOptions, SMTP_USER: 'user', SMTP_PASS: 'secret' })
    );

    expect(internals.options.auth).toEqual({ user: 'user', pass: 'secret' });
    expect(() => getTransporter({ ...baseOptions, SMTP_USER: 'user' })).toThrow(
      /SMTP_USER.*SMTP_PASS/
    );
    expect(() => getTransporter({ ...baseOptions, SMTP_PASS: 'secret' })).toThrow(
      /SMTP_USER.*SMTP_PASS/
    );
  });

  it('accepts timeout overrides', () => {
    const internals = readInternals(
      getTransporter({ ...baseOptions, timeouts: { connection: 2_000, socket: 5_000 } })
    );

    expect(internals.options.connectionTimeout).toBe(2_000);
    expect(internals.options.socketTimeout).toBe(5_000);
    expect(internals.options.greetingTimeout).toBe(10_000);
  });

  it.each([
    ['missing host', { SMTP_HOST: undefined }, /SMTP_HOST/],
    ['blank host', { SMTP_HOST: '   ' }, /SMTP_HOST/],
    ['non numeric port', { ...baseOptions, SMTP_PORT: 'not-a-port' }, /SMTP_PORT/],
    ['out of range port', { ...baseOptions, SMTP_PORT: 70_000 }, /SMTP_PORT/],
    ['unknown secure flag', { ...baseOptions, SMTP_SECURE: 'maybe' }, /SMTP_SECURE/]
  ])('rejects an invalid configuration: %s', (_label, options, expected) => {
    expect(() => getTransporter(options as smtpOptions)).toThrow(expected);
  });
});

describe('smtpSend', () => {
  it('maps the transport-neutral message onto Nodemailer', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'message-1' }));
    const send = smtpSend({ sendMail } as unknown as nodemailer.Transporter);

    await send({
      from: 'no-reply@example.com',
      to: 'user@example.com',
      subject: 'Email Verification',
      html: '<p>Hello</p>'
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@example.com',
      to: 'user@example.com',
      subject: 'Email Verification',
      html: '<p>Hello</p>',
      disableFileAccess: true,
      disableUrlAccess: true
    });
  });
});
