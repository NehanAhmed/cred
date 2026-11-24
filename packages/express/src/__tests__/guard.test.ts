import { generateAccessToken } from '@cred-kit/core';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthGuard } from '../middleware/auth.middleware.js';
import { TEST_JWT_SECRET } from './fakes.js';

const USER = {
  id: 'user-1',
  email: 'johndoe@example.com',
  username: 'johndoe'
};

/** Signs an HS256 token without pulling a JWT library into this package. */
const signTestToken = (payload: Record<string, unknown>): string => {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const signature = crypto
    .createHmac('sha256', TEST_JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
};

const buildGuardApp = (options: { cookieParser?: boolean } = {}): Express => {
  const app = express();

  if (options.cookieParser) app.use(cookieParser());

  app.get('/protected', createAuthGuard({ jwtSecret: TEST_JWT_SECRET }), (req, res) => {
    res.json({ user: req.user });
  });

  return app;
};

const accessToken = (): string => generateAccessToken(USER, TEST_JWT_SECRET);

describe('createAuthGuard', () => {
  it('attaches the verified payload to req.user without cookie-parser', async () => {
    const app = buildGuardApp();

    const response = await request(app).get('/protected').set('Cookie', `token=${accessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      ...USER,
      tokenType: 'access'
    });
  });

  it('attaches the verified payload when cookie-parser is mounted', async () => {
    const app = buildGuardApp({ cookieParser: true });

    const response = await request(app).get('/protected').set('Cookie', `token=${accessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ ...USER, tokenType: 'access' });
  });

  it('returns the standard 401 envelope when the cookie is missing', async () => {
    const app = buildGuardApp();

    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized'
    });
  });

  it('returns 401 Invalid token for a malformed token', async () => {
    const app = buildGuardApp();

    const response = await request(app).get('/protected').set('Cookie', 'token=not-a-jwt');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Invalid token',
      error: 'Invalid token'
    });
  });

  it('returns 401 Invalid token for a refresh-type token', async () => {
    const app = buildGuardApp();
    const refreshToken = signTestToken({
      ...USER,
      tokenType: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 60
    });

    const response = await request(app).get('/protected').set('Cookie', `token=${refreshToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid token');
  });

  it('returns 401 Invalid token for an expired token', async () => {
    const app = buildGuardApp();
    const expired = signTestToken({
      ...USER,
      tokenType: 'access',
      exp: Math.floor(Date.now() / 1000) - 60
    });

    const response = await request(app).get('/protected').set('Cookie', `token=${expired}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid token');
  });

  it('honours a custom cookie name', async () => {
    const app = express();
    app.get(
      '/protected',
      createAuthGuard({ jwtSecret: TEST_JWT_SECRET, cookieName: 'access' }),
      (req, res) => {
        res.json({ user: req.user });
      }
    );

    await request(app).get('/protected').set('Cookie', `access=${accessToken()}`).expect(200);

    const wrongCookie = await request(app)
      .get('/protected')
      .set('Cookie', `token=${accessToken()}`);

    expect(wrongCookie.status).toBe(401);
  });

  it('rejects a missing or short secret at creation time', () => {
    expect(() => createAuthGuard({ jwtSecret: 'short' })).toThrow(
      /jwtSecret must be at least 32 characters/
    );
  });

  it('rejects an empty cookie name', () => {
    expect(() => createAuthGuard({ jwtSecret: TEST_JWT_SECRET, cookieName: '  ' })).toThrow(
      /cookieName/
    );
  });
});
