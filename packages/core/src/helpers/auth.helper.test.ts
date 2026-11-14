import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  hashToken,
  verifyToken,
  verifyRawToken,
  generateToken,
  parseToken,
  parseTokenLookupId,
  verifyAccessToken,
  generateAccessToken,
  generateRefreshTokenData,
} from './auth.helper.js';
import { AuthError } from '../errors/auth-error.js';
import { TEST_JWT_SECRET } from '../__tests__/fakes.js';

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
  it('returns a bcrypt hash that verifies the input', async () => {
    const token = 'some-raw-token';
    const hashed = await hashToken(token);

    expect(hashed).not.toBe(token);
    expect(hashed).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(token, hashed)).toBe(true);
  });

  it('is salted and input-sensitive', async () => {
    const first = await hashToken('a');
    const second = await hashToken('a');

    expect(first).not.toBe(second);
    expect(await verifyToken('a', first)).toBe(true);
    expect(await verifyToken('b', first)).toBe(false);
  });
});

describe('token lookup helpers', () => {
  it('generates a token whose lookup id is embedded in the raw value', async () => {
    const token = await generateToken(32);

    expect(token.rawToken).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{64}$/);
    expect(token.lookupId).toMatch(/^[a-f0-9]{32}$/);
    expect(parseTokenLookupId(token.rawToken)).toBe(token.lookupId);
    expect(parseToken(token.rawToken)?.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifyRawToken(token.rawToken, token.hashedToken)).toBe(true);
    // bcrypt hashes only the secret, not the public lookup id.
    expect(await verifyToken(token.rawToken, token.hashedToken)).toBe(false);
  });

  it('rejects malformed tokens when extracting the lookup id', () => {
    expect(parseTokenLookupId('')).toBeNull();
    expect(parseTokenLookupId('no-separator')).toBeNull();
    expect(parseTokenLookupId('.secret')).toBeNull();
    expect(parseTokenLookupId('lookup.')).toBeNull();
  });
});

describe('generateRefreshTokenData', () => {
  it('produces a raw token whose stored hash is verifiable', async () => {
    const data = await generateRefreshTokenData();

    expect(data.rawToken).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{64}$/);
    expect(data.lookupId).toMatch(/^[a-f0-9]{32}$/);
    expect(parseTokenLookupId(data.rawToken)).toBe(data.lookupId);
    expect(data.hashedToken).not.toBe(data.rawToken);
    expect(await verifyRawToken(data.rawToken, data.hashedToken)).toBe(true);
    expect(data.family).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('expires in about 7 days', async () => {
    const before = Date.now();
    const data = await generateRefreshTokenData();
    const after = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;

    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + week);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(after + week);
  });

  it('produces unique tokens and families', async () => {
    const a = await generateRefreshTokenData();
    const b = await generateRefreshTokenData();

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
