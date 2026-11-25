import crypto from 'node:crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import type { ResolvedCredExpressConfig } from '../config.js';
import { sendError } from '../helpers/api.helper.js';
import { readCookie } from '../helpers/request.helper.js';
import type { CredLocals } from '../types.js';

/** Cookie that carries the double-submit CSRF token (readable by browser JS). */
export const CSRF_COOKIE_NAME = 'csrfToken';
/** Header that must echo the token on state-changing requests. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_BYTES = 32;

/**
 * Requests that create or recover a session run before a CSRF token can be
 * expected. They are still rate-limited; once a session exists every unsafe
 * route requires the token.
 */
const CSRF_EXEMPT_PATHS = new Set(['/auth', '/auth/login', '/auth/forgot-password']);
const CSRF_EXEMPT_PREFIXES = ['/auth/reset-password/'];

const createToken = (): string => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

const normalizePath = (path: string): string => {
  if (path.length <= 1) return path;

  return path.replace(/\/+$/, '');
};

const isCsrfExempt = (path: string): boolean => {
  const normalized = normalizePath(path);

  return (
    CSRF_EXEMPT_PATHS.has(normalized) ||
    CSRF_EXEMPT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
};

const tokensMatch = (submitted: unknown, expected: unknown): boolean => {
  if (typeof submitted !== 'string' || typeof expected !== 'string') return false;

  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);

  return (
    submittedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(submittedBuffer, expectedBuffer)
  );
};

const csrfCookieOptions = (config: ResolvedCredExpressConfig): CookieOptions => ({
  // Browser clients must read the token to echo it in the header.
  httpOnly: false,
  secure: config.cookies.secure,
  sameSite: config.cookies.sameSite,
  path: '/',
  maxAge: config.cookies.refreshTokenMaxAgeMs,
  ...(config.cookies.domain === undefined ? {} : { domain: config.cookies.domain }),
});

/**
 * Double-submit CSRF protection.
 *
 * A random token is stored in a non-httpOnly cookie. Unsafe requests must echo
 * it in `X-CSRF-Token`; a forged cross-site request cannot read the cookie and
 * therefore cannot set the header. Sessions are created and recovered without
 * a token (login, registration, password reset), then every authenticated
 * state-changing route is protected.
 */
export const createCsrfProtection = (config: ResolvedCredExpressConfig) => {
  const cookieOptions = csrfCookieOptions(config);

  return (req: Request, res: Response, next: NextFunction): void => {
    let token = readCookie(req, CSRF_COOKIE_NAME);

    if (token === undefined) {
      token = createToken();
      // Keep the literal cookie name so CodeQL's CSRF model recognizes this
      // middleware as token validation (it matches on the `res.cookie` name).
      res.cookie('csrfToken', token, cookieOptions);
    }

    (res.locals as CredLocals).credCsrfToken = token;

    if (SAFE_METHODS.has(req.method) || isCsrfExempt(req.path)) {
      next();
      return;
    }

    if (!tokensMatch(req.get(CSRF_HEADER_NAME), token)) {
      sendError(res, 'Invalid CSRF token', 403);
      return;
    }

    next();
  };
};
