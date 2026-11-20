import { verifyAccessToken } from '@cred-kit/core';
import type { RequestHandler } from 'express';
import type { ResolvedCredExpressConfig } from '../config.js';
import { sendError } from '../helpers/api.helper.js';
import { readCookie, setAuthenticatedUser } from '../helpers/request.helper.js';

/**
 * Reads the access-token cookie, verifies it with core's HS256 verifier, and
 * stores the payload for the controller. A missing cookie is `401 Unauthorized`;
 * an invalid, expired, or refresh-type token is `401 Invalid token` — the same
 * split the shipped API uses.
 */
export const createRequireAuth = (config: ResolvedCredExpressConfig): RequestHandler => {
  return (req, res, next) => {
    const token = readCookie(req, config.cookies.accessTokenName);

    if (!token) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    try {
      const user = verifyAccessToken(token, config.jwtSecret);
      setAuthenticatedUser(res, user);
      next();
    } catch {
      sendError(res, 'Invalid token', 401);
    }
  };
};
