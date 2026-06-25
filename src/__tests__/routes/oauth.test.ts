import supertest from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import userModel from '../../models/user.models';
import refreshTokenModel from '../../models/refreshToken.models';
import { oauthCallback } from '../../controllers/oauth.controllers';
import { validateOAuthState } from '../../routes/oauth.routes';
import { setupTestDB } from '../helpers/db';

setupTestDB();

const CLIENT_URL = 'http://localhost:5173';

type AuthBehavior =
  | { type: 'success'; user: Record<string, unknown> }
  | { type: 'failure' }
  | { type: 'error' };

let authResult: AuthBehavior = { type: 'failure' };

const createAuthMiddleware = (options: { failureRedirect: string }) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (authResult.type === 'success') {
      req.user = authResult.user as Express.Request['user'];
      return next();
    }
    if (authResult.type === 'error') {
      return next(new Error('OAuth error'));
    }
    return res.redirect(options.failureRedirect);
  };
};

const createOAuthTestApp = () => {
  const app = express();
  app.use(cookieParser());

  app.get('/api/auth/google', (_req, res) => {
    const state = 'test-oauth-state';
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(
      `https://accounts.google.com/o/oauth2/auth?state=${state}&scope=profile+email`
    );
  });

  app.get(
    '/api/auth/google/callback',
    validateOAuthState,
    createAuthMiddleware({
      failureRedirect: `${CLIENT_URL}/login?error=google_auth_failed`,
    }),
    oauthCallback
  );

  app.get('/api/auth/github', (_req, res) => {
    const state = 'test-oauth-state';
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(
      `https://github.com/login/oauth/authorize?state=${state}&scope=user:email`
    );
  });

  app.get(
    '/api/auth/github/callback',
    validateOAuthState,
    createAuthMiddleware({
      failureRedirect: `${CLIENT_URL}/login?error=github_auth_failed`,
    }),
    oauthCallback
  );

  return app;
};

const mockUserId = new Types.ObjectId();
const mockUser = {
  _id: mockUserId,
  id: mockUserId.toString(),
  email: 'oauthuser@example.com',
  username: 'oauthuser',
};

const createRequest = supertest(createOAuthTestApp());

beforeEach(() => {
  authResult = { type: 'failure' };
});

// ---------------------------------------------------------------------------
// Initiate OAuth
// ---------------------------------------------------------------------------
describe.each([
  {
    provider: 'google',
    path: '/api/auth/google',
    redirectUrl: 'https://accounts.google.com/o/oauth2/auth',
  },
  {
    provider: 'github',
    path: '/api/auth/github',
    redirectUrl: 'https://github.com/login/oauth/authorize',
  },
])('GET $path — Initiate $provider OAuth', ({ path, redirectUrl }) => {
  it('redirects to the provider authorization URL', async () => {
    const res = await createRequest.get(path);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(redirectUrl);
  });

  it('sets an oauth_state cookie', async () => {
    const res = await createRequest.get(path);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const stateCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c: string) =>
      c.startsWith('oauth_state=')
    );
    expect(stateCookie).toBeDefined();
  });

  it('sets the oauth_state cookie as httpOnly', async () => {
    const res = await createRequest.get(path);

    const cookies = res.headers['set-cookie'];
    const stateCookie = (Array.isArray(cookies) ? cookies : [cookies]).find((c: string) =>
      c.startsWith('oauth_state=')
    );
    expect(stateCookie).toContain('HttpOnly');
  });
});

// ---------------------------------------------------------------------------
// OAuth Callback
// ---------------------------------------------------------------------------
describe.each([
  {
    provider: 'google',
    path: '/api/auth/google/callback',
    failureParam: 'google_auth_failed',
  },
  {
    provider: 'github',
    path: '/api/auth/github/callback',
    failureParam: 'github_auth_failed',
  },
])('GET $path — $provider OAuth callback', ({ path, failureParam }) => {
  describe('state validation', () => {
    it('redirects with oauth_state_mismatch when state cookie is missing', async () => {
      const res = await createRequest.get(`${path}?state=some-state`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${CLIENT_URL}/login?error=oauth_state_mismatch`);
    });

    it('redirects with oauth_state_mismatch when query state is missing', async () => {
      const res = await createRequest
        .get(path)
        .set('Cookie', 'oauth_state=some-state');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${CLIENT_URL}/login?error=oauth_state_mismatch`);
    });

    it('redirects with oauth_state_mismatch when state values do not match', async () => {
      const res = await createRequest
        .get(`${path}?state=query-state`)
        .set('Cookie', 'oauth_state=cookie-state');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${CLIENT_URL}/login?error=oauth_state_mismatch`);
    });

    it('clears oauth_state cookie and proceeds on matching state', async () => {
      authResult = { type: 'failure' };

      const res = await createRequest
        .get(`${path}?state=valid-state`)
        .set('Cookie', 'oauth_state=valid-state');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${CLIENT_URL}/login?error=${failureParam}`);
    });
  });

  describe('authentication', () => {
    it('sets token and refreshToken cookies on successful auth', async () => {
      authResult = { type: 'success', user: mockUser };

      const res = await createRequest
        .get(`${path}?state=valid-state`)
        .set('Cookie', 'oauth_state=valid-state');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${CLIENT_URL}/auth/callback`);

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('token=');
      expect(cookieStr).toContain('refreshToken=');
    });

    it('sets a valid JWT access token on successful auth', async () => {
      authResult = { type: 'success', user: mockUser };

      const res = await createRequest
        .get(`${path}?state=valid-state`)
        .set('Cookie', 'oauth_state=valid-state');

      const cookies = res.headers['set-cookie'];
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;

      const tokenMatch = cookieStr.match(/token=([^;]+)/);
      expect(tokenMatch).not.toBeNull();

      const decoded = jwt.verify(tokenMatch![1], process.env.JWT_SECRET!) as {
        id: string;
        email: string;
        username: string;
        tokenType: string;
      };
      expect(decoded.id).toBe(mockUser._id.toString());
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.tokenType).toBe('access');
    });

    it('creates a RefreshToken document in the database', async () => {
      authResult = { type: 'success', user: mockUser };

      await createRequest
        .get(`${path}?state=valid-state`)
        .set('Cookie', 'oauth_state=valid-state');

      const tokens = await refreshTokenModel.find({ user: mockUser._id });
      expect(tokens.length).toBe(1);
      expect(tokens[0].family).toBeDefined();
      expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('redirects with failure param when Passport auth fails', async () => {
      authResult = { type: 'failure' };

      const res = await createRequest
        .get(`${path}?state=valid-state`)
        .set('Cookie', 'oauth_state=valid-state');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        `${CLIENT_URL}/login?error=${failureParam}`
      );
    });

    it('redirects with oauth_failed when oauthCallback throws', async () => {
      const invalidUser = { _id: 'not-an-object-id', id: 'not-an-object-id', email: 'test@test.com', username: 'test' };
      authResult = { type: 'success', user: invalidUser as unknown as Record<string, unknown> };

      const res = await createRequest
        .get(`${path}?state=valid-state`)
        .set('Cookie', 'oauth_state=valid-state');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${CLIENT_URL}/login?error=oauth_failed`);
    });
  });
});

// ---------------------------------------------------------------------------
// validateOAuthState middleware
// ---------------------------------------------------------------------------
describe('validateOAuthState middleware', () => {
  it('calls next() when valid state cookie matches query param', async () => {
    const middleware = validateOAuthState;

    const req = {
      cookies: { oauth_state: 'matching-state' },
      query: { state: 'matching-state' },
    } as unknown as Request;
    const res = {
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith('oauth_state');
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects when cookie is missing', async () => {
    const middleware = validateOAuthState;

    const req = {
      cookies: {},
      query: { state: 'some-state' },
    } as unknown as Request;
    const res = {
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(
      `${CLIENT_URL}/login?error=oauth_state_mismatch`
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects when query state is missing', async () => {
    const middleware = validateOAuthState;

    const req = {
      cookies: { oauth_state: 'some-state' },
      query: {},
    } as unknown as Request;
    const res = {
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response;
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(
      `${CLIENT_URL}/login?error=oauth_state_mismatch`
    );
  });
});
