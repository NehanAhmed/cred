import { assertJwtSecret, verifyAccessToken, type JWTPayload } from '@cred-kit/core';
import type { RequestHandler } from 'express';
import type { ResolvedCredExpressConfig } from '../config.js';
import { sendError } from '../helpers/api.helper.js';
import { readCookie, setAuthenticatedUser } from '../helpers/request.helper.js';

/** Options for {@link createAuthGuard}. */
export interface CredAuthGuardOptions {
  /** HS256 signing secret used to verify the access token. Must be at least 32 characters. */
  jwtSecret: string;
  /** Access-token cookie name. Defaults to `token`. */
  cookieName?: string;
}

/**
 * Reads the access-token cookie, verifies it with core's HS256 verifier, and
 * attaches the payload to `req.user` (and `res.locals.credUser` for the
 * router's own controllers).
 *
 * A missing cookie is `401 Unauthorized`; an invalid, expired, or refresh-type
 * token is `401 Invalid token` — the same split the shipped API uses.
 */
const createAuthMiddleware = (jwtSecret: string, accessTokenCookieName: string): RequestHandler => {
  return (req, res, next) => {
    const token = readCookie(req, accessTokenCookieName);

    if (!token) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    try {
      const user: JWTPayload = verifyAccessToken(token, jwtSecret);
      req.user = user;
      setAuthenticatedUser(res, user);
      next();
    } catch {
      sendError(res, 'Invalid token', 401);
    }
  };
};

/** Builds the auth middleware used by the router's protected routes. */
export const createRequireAuth = (config: ResolvedCredExpressConfig): RequestHandler =>
  createAuthMiddleware(config.jwtSecret, config.cookies.accessTokenName);

/**
 * Exported auth guard for host routes outside the cred-kit router.
 *
 * ```ts
 * app.get('/dashboard', createAuthGuard({ jwtSecret: process.env.JWT_SECRET! }), (req, res) => {
 *   res.json({ user: req.user });
 * });
 * ```
 *
 * The guard reads the access-token cookie itself, so the host does not need to
 * mount `cookie-parser` first. It sets `req.user` to the verified JWT payload.
 */
export const createAuthGuard = (options: CredAuthGuardOptions): RequestHandler => {
  if (options === null || typeof options !== 'object') {
    throw new Error('@cred-kit/express: "createAuthGuard" options are required');
  }

  assertJwtSecret(options.jwtSecret);

  const cookieName = options.cookieName ?? 'token';

  if (typeof cookieName !== 'string' || cookieName.trim() === '') {
    throw new Error('@cred-kit/express: "cookieName" must be a non-empty string');
  }

  return createAuthMiddleware(options.jwtSecret, cookieName);
};
