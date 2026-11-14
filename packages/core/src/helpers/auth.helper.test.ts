import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  hashToken,
  verifyAccessToken,
  generateAccessToken,
  generateRefreshTokenData,
} from './auth.helper.js';
import { AuthError } from '../errors/auth-error.js';
import { TEST_JWT_SECRET } from '../__tests__/fakes.js';
import type { JWTPayload } from '../types/auth.types.js';

const expectAuthError = (fn: () => unknown, expected: { code: string; statusCode: number }) => {
  let error: unknown;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(AuthError);
  expect(error).toMatchObject(expected);
};

describe('hashToken', () => {
  it('returns the SHA-256 hex digest of the input', () => {
    const token = 'some-raw-token';
    const expected = crypto.createHash('sha256').update(token).digest('hex');

    expect(hashToken(token)).toBe(expected);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic and input-sensitive', () => {
    expect(hashToken('a')).toBe(hashToken('a'));
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('generateRefreshTokenData', () => {
  it('produces a raw token whose stored hash is its SHA-256 digest', () => {
    const data = generateRefreshTokenData();

    expect(data.rawToken).toMatch(/^[a-f0-9]{80}$/);
    expect(data.hashedToken).toBe(hashToken(data.rawToken));
    expect(data.family).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('expires in about 7 days', () => {
    const before = Date.now();
    const data = generateRefreshTokenData();
    const after = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;

    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + week);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(after + week);
  });

  it('produces unique tokens and families', () => {
    const a = generateRefreshTokenData();
    const b = generateRefreshTokenData();

    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.family).not.toBe(b.family);
  });
});

describe('generateAccessToken + verifyAccessToken round trip', () => {
  it('verifies a token it generated and returns the payload', () => {
    const token = generateAccessToken(
      { id: 'user-1', email: 'user@example.com', username: 'user' },
      TEST_JWT_SECRET,
    );
    const payload = verifyAccessToken(token, TEST_JWT_SECRET);

    expect(payload).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      tokenType: 'access',
    });
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('throws INVALID_TOKEN for a missing token', () => {
    expect(() => verifyAccessToken('', TEST_JWT_SECRET)).toThrow(AuthError);
    expectAuthError(() => verifyAccessToken('', TEST_JWT_SECRET), { code: 'INVALID_TOKEN', statusCode: 401 });
  });

  it('throws INVALID_TOKEN for a malformed token', () => {
    expectAuthError(() => verifyAccessToken('this-is-not-a-valid-jwt', TEST_JWT_SECRET), {
      code: 'INVALID_TOKEN',
      statusCode: 401,
    });
  });

  it('throws INVALID_TOKEN when signed with a different secret', () => {
    const token = generateAccessToken(
      { id: 'user-1', email: 'user@example.com', username: 'user' },
      'another-secret',
    );

    expectAuthError(() => verifyAccessToken(token, TEST_JWT_SECRET), { code: 'INVALID_TOKEN', statusCode: 401 });
  });

  it('throws INVALID_TOKEN for an expired token', () => {
    const token = jwt.sign(
      { id: 'user-1', email: 'user@example.com', username: 'user', tokenType: 'access' },
      TEST_JWT_SECRET,
      { expiresIn: -10 },
    );

    expectAuthError(() => verifyAccessToken(token, TEST_JWT_SECRET), { code: 'INVALID_TOKEN', statusCode: 401 });
  });

  it('rejects a refresh token used as an access token', () => {
    const token = jwt.sign(
      { id: 'user-1', email: 'user@example.com', username: 'user', tokenType: 'refresh' },
      TEST_JWT_SECRET,
    );

    expectAuthError(() => verifyAccessToken(token, TEST_JWT_SECRET), { code: 'INVALID_TOKEN', statusCode: 401 });
  });

  it('rejects an access token missing required payload fields', () => {
    const token = jwt.sign({ tokenType: 'access' }, TEST_JWT_SECRET);

    expectAuthError(() => verifyAccessToken(token, TEST_JWT_SECRET), { code: 'INVALID_TOKEN', statusCode: 401 });
  });
});
