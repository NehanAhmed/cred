import { generateAccessToken } from '@cred-kit/core';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { buildUser } from './fakes.js';
import { createTestApp, registerVerifiedUser, TEST_USER } from './helpers.js';

const getSetCookies = (response: request.Response): string[] =>
  (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

const findCookie = (cookies: string[], name: string): string => {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`missing ${name} cookie`);
  return cookie;
};

describe('auth routes', () => {
  it('registers a user, sends a verification email, and verifies the token', async () => {
    const { app, fakes } = createTestApp();

    const register = await request(app).post('/api/auth').send(TEST_USER);

    expect(register.status).toBe(201);
    expect(register.body).toEqual({
      success: true,
      message: 'User registered successfully. Verify your email first.',
      data: {}
    });
    expect(fakes.users.users).toHaveLength(1);
    expect(fakes.users.users[0].isVerified).toBe(false);

    const verification = fakes.email.verifications[0];
    expect(verification.to).toBe(TEST_USER.email);

    const verify = await request(app).get(`/api/auth/verify-email/${verification.rawToken}`);

    expect(verify.status).toBe(302);
    expect(verify.headers.location).toBe('http://localhost:3000/login?verified=true');
    expect(fakes.users.users[0].isVerified).toBe(true);
  });

  it('redirects password-reset email links to the client reset page', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/auth/reset-password/reset-token-123');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'http://localhost:3000/reset-password?token=reset-token-123'
    );
  });

  it('redirects to verified=false for an invalid verification token', async () => {
    const { app } = createTestApp();

    const verify = await request(app).get('/api/auth/verify-email/not-a-real-token');

    expect(verify.status).toBe(302);
    expect(verify.headers.location).toBe('http://localhost:3000/login?verified=false');
  });

  it('logs in with email, sets auth cookies, and omits the password', async () => {
    const { app, fakes } = createTestApp();
    const agent = await registerVerifiedUser(app, fakes);

    const login = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(login.status).toBe(200);
    expect(login.body.success).toBe(true);
    expect(login.body.message).toBe('Logged in successfully');
    expect(login.body.data.user).toMatchObject({
      email: TEST_USER.email,
      username: TEST_USER.username
    });
    expect(login.body.data.user).not.toHaveProperty('password');

    const cookies = getSetCookies(login);
    const accessCookie = findCookie(cookies, 'token');
    const refreshCookie = findCookie(cookies, 'refreshToken');

    expect(accessCookie).toContain('HttpOnly');
    expect(accessCookie).toContain('SameSite=Strict');
    expect(accessCookie).toContain('Path=/');
    expect(accessCookie).not.toContain('Secure');

    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Strict');
    expect(refreshCookie).toContain('Path=/api/auth');
    expect(refreshCookie).not.toContain('Secure');
  });

  it('returns a generic 401 for invalid credentials', async () => {
    const { app, fakes } = createTestApp();
    await registerVerifiedUser(app, fakes);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass1' });

    expect(login.status).toBe(401);
    expect(login.body).toMatchObject({
      success: false,
      message: 'Invalid Credentials',
      error: 'Invalid Credentials'
    });
  });

  it('returns the Zod issue shape for an invalid login body', async () => {
    const { app } = createTestApp();

    const login = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    expect(login.status).toBe(400);
    expect(login.body).not.toHaveProperty('success');
    expect(Array.isArray(login.body.errors)).toBe(true);
    expect(login.body.errors.length).toBeGreaterThan(0);
  });

  it('returns 401 for a protected route without an access cookie', async () => {
    const { app } = createTestApp();

    const profile = await request(app).get('/api/profile/me');

    expect(profile.status).toBe(401);
    expect(profile.body).toEqual({
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized'
    });
  });

  it('protects state-changing routes with the CSRF header', async () => {
    const { app, fakes } = createTestApp();
    const agent = await registerVerifiedUser(app, fakes);

    await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    const csrf = await agent.get('/api/auth/csrf-token').expect(200);
    expect(typeof csrf.body.data.csrfToken).toBe('string');

    const missingHeader = await agent.put('/api/profile/me').send({ bio: 'Updated bio' });

    expect(missingHeader.status).toBe(403);
    expect(missingHeader.body.message).toBe('Invalid CSRF token');

    const updated = await agent
      .put('/api/profile/me')
      .set('x-csrf-token', csrf.body.data.csrfToken)
      .send({ bio: 'Updated bio' });

    expect(updated.status).toBe(200);
    expect(updated.body.data.bio).toBe('Updated bio');
  });

  it('refreshes the session and rotates the refresh cookie', async () => {
    const { app, fakes } = createTestApp();
    const agent = await registerVerifiedUser(app, fakes);

    const login = await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    const csrf = await agent.get('/api/auth/csrf-token').expect(200);
    const beforeRefresh = findCookie(getSetCookies(login), 'refreshToken');

    const refresh = await agent
      .post('/api/auth/refresh')
      .set('x-csrf-token', csrf.body.data.csrfToken);

    expect(refresh.status).toBe(200);
    expect(refresh.body.message).toBe('Token refreshed successfully');

    const afterRefresh = findCookie(getSetCookies(refresh), 'refreshToken');
    expect(afterRefresh).not.toBe(beforeRefresh);

    await agent.get('/api/profile/me').expect(200);
  });

  it('logs out, clears cookies, and rejects the old access cookie', async () => {
    const { app, fakes } = createTestApp();
    const agent = await registerVerifiedUser(app, fakes);

    await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    const csrf = await agent.get('/api/auth/csrf-token').expect(200);

    const logout = await agent
      .post('/api/auth/logout')
      .set('x-csrf-token', csrf.body.data.csrfToken);

    expect(logout.status).toBe(200);
    expect(logout.body.message).toBe('Logged out successfully');

    await agent.get('/api/profile/me').expect(401);
  });

  it('returns 413 for a body over the configured JSON limit', async () => {
    const { app } = createTestApp({ jsonBodyLimit: '1kb' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a'.repeat(2048), password: 'SecurePass1' });

    expect(login.status).toBe(413);
    expect(login.body.message).toBe('Request body too large');
  });

  it('maps an AuthError to its status and message', async () => {
    const { app } = createTestApp();
    const token = generateAccessToken(
      { id: 'missing-user', email: 'missing@example.com', username: 'missing' },
      (await import('./fakes.js')).TEST_JWT_SECRET
    );

    const profile = await request(app).get('/api/profile/me').set('Cookie', `token=${token}`);

    expect(profile.status).toBe(404);
    expect(profile.body).toMatchObject({
      success: false,
      error: 'User not found'
    });
  });

  it('reduces unknown errors to a generic 500 and logs them', async () => {
    const logger = { error: vi.fn() };
    const { app, fakes } = createTestApp({ logger });
    const user = buildUser(
      {
        email: 'known@example.com',
        username: 'known',
        isVerified: true
      },
      '1'
    );
    fakes.users.users.push(user);

    const token = generateAccessToken(user, (await import('./fakes.js')).TEST_JWT_SECRET);
    vi.spyOn(fakes.users, 'findOne').mockRejectedValue(new Error('storage down'));

    const profile = await request(app).get('/api/profile/me').set('Cookie', `token=${token}`);

    expect(profile.status).toBe(500);
    expect(profile.body).toEqual({
      success: false,
      message: 'Internal server error',
      error: 'Internal server error'
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
