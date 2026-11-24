import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.middleware.js';
import { createTestApp, TEST_USER } from './helpers.js';

const getSetCookies = (response: request.Response): string[] =>
  (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

const findCookie = (cookies: string[], name: string): string => {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`missing ${name} cookie`);
  return cookie;
};

const cookieValue = (cookie: string): string =>
  decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1).split(';')[0]);

const GOOGLE_OAUTH = {
  google: {
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret'
  }
};

describe('router mounts', () => {
  it('returns the standard envelope and sets a CSRF cookie', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/auth/csrf-token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data.csrfToken).toBe('string');

    const csrfCookie = findCookie(getSetCookies(response), CSRF_COOKIE_NAME);
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfCookie).toContain('SameSite=Strict');
    expect(csrfCookie).toContain('Path=/');
    expect(csrfCookie).not.toContain('Secure');
  });

  it('returns 404 for an unmounted path', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
  });

  it('returns the Zod issue shape for an invalid registration body', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/api/auth')
      .send({ username: 'a', email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body).not.toHaveProperty('success');
  });

  it('returns the auth limiter as plain text after its budget', async () => {
    const { app } = createTestApp({
      rateLimits: {
        auth: {
          windowMs: 60_000,
          max: 2,
          message: 'Too many authentication attempts, please try again later.'
        }
      }
    });

    await request(app).get('/api/auth/csrf-token').expect(200);
    await request(app).get('/api/auth/csrf-token').expect(200);

    const limited = await request(app).get('/api/auth/csrf-token');

    expect(limited.status).toBe(429);
    expect(limited.text).toBe('Too many authentication attempts, please try again later.');
    expect(limited.body).toEqual({});
  });
});

describe('OAuth routes', () => {
  it('redirects to Google and sets a matching oauth_state cookie', async () => {
    const { app } = createTestApp({ oauth: GOOGLE_OAUTH });

    const response = await request(app).get('/api/auth/google');

    expect(response.status).toBe(302);

    const location = new URL(response.headers.location);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('client_id')).toBe('google-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/auth/google/callback'
    );
    expect(location.searchParams.get('scope')).toBe('openid email profile');

    const stateCookie = findCookie(getSetCookies(response), 'oauth_state');
    expect(cookieValue(stateCookie)).toBe(location.searchParams.get('state'));
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('SameSite=Lax');
    expect(stateCookie).toContain('Path=/api/auth');
    expect(stateCookie).toContain('Max-Age=600');
  });

  it('redirects to the client when the provider is not configured', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/auth/google');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('http://localhost:3000/login?error=google_auth_failed');
    const cookies = getSetCookies(response);
    expect(cookies.some((cookie) => cookie.startsWith('oauth_state='))).toBe(false);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const { app } = createTestApp({ oauth: GOOGLE_OAUTH });

    const response = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'authorization-code', state: 'attacker-state' })
      .set('Cookie', 'oauth_state=expected-state');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'http://localhost:3000/login?error=oauth_state_mismatch'
    );
  });

  it('rejects a callback without a state cookie', async () => {
    const { app } = createTestApp({ oauth: GOOGLE_OAUTH });

    const response = await request(app)
      .get('/api/auth/google/callback')
      .query({ code: 'authorization-code', state: 'any-state' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      'http://localhost:3000/login?error=oauth_state_mismatch'
    );
  });
});

describe('profile mount', () => {
  it('requires an access token before reaching a profile handler', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/profile/me/audit-logs');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Unauthorized',
      error: 'Unauthorized'
    });
  });

  it('serves the authenticated profile for a registered user', async () => {
    const { app, fakes } = createTestApp();
    const agent = request.agent(app);

    await agent.post('/api/auth').send(TEST_USER).expect(201);
    const verification = fakes.email.verifications.at(-1);
    if (!verification) throw new Error('registration did not send an email');

    await agent.get(`/api/auth/verify-email/${verification.rawToken}`).expect(302);
    await agent
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    const profile = await agent.get('/api/profile/me');

    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({
      username: TEST_USER.username,
      email: TEST_USER.email
    });
    expect(profile.body.data).not.toHaveProperty('password');
  });
});
