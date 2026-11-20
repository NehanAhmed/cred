import { AuthError, type JWTPayload } from '@cred-kit/core';
import type { Request, Response } from 'express';
import type { CredLocals, CredRequestContext } from '../types.js';

/** Extracts the audit context forwarded to every core service call. */
export const getRequestContext = (req: Request): CredRequestContext => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
});

/**
 * Reads a cookie as a string. `cookie-parser` types cookies as `any`, so this
 * normalizes missing, empty, and non-string values to `undefined` instead of
 * letting them reach core as malformed tokens.
 */
export const readCookie = (req: Request, name: string): string | undefined => {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];

  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * Express types a route parameter as `string | string[]`; `:token` routes are
 * always single-valued, but normalizing here keeps the controller free of the
 * framework's broad ParamsDictionary type.
 */
export const readRouteParam = (value: string | string[] | undefined): string => {
  if (typeof value === 'string') return value;

  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
};

export const setAuthenticatedUser = (res: Response, user: JWTPayload): void => {
  (res.locals as CredLocals).credUser = user;
};

/**
 * Returns the user attached by the auth middleware. Routes that use this are
 * always mounted behind `requireAuth`, so a missing user means the middleware
 * chain was assembled incorrectly.
 */
export const getAuthenticatedUser = (res: Response): JWTPayload => {
  const user = (res.locals as CredLocals).credUser;

  if (!user) {
    throw new AuthError('INVALID_TOKEN', 'Unauthorized', 401);
  }

  return user;
};
