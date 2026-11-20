import {
  AuthError,
  forgotPassword as forgotPasswordUser,
  login as loginUser,
  logout as logoutUser,
  refresh as refreshUser,
  register as registerUser,
  resetPassword as resetPasswordUser,
  verifyEmail as verifyEmailUser,
  type LoginRequest,
  type RegisterRequest,
} from '@cred-kit/core';
import type { RequestHandler } from 'express';
import {
  createCoreAuthConfig,
  type ResolvedCredExpressConfig,
} from '../config.js';
import { sendSuccess } from '../helpers/api.helper.js';
import {
  clearAuthCookies,
  readRefreshTokenCookie,
  setAuthCookies,
} from '../helpers/cookie.helper.js';
import {
  getAuthenticatedUser,
  getRequestContext,
  readRouteParam,
} from '../helpers/request.helper.js';
import type { CredCoreDeps } from '../types.js';

/**
 * Canonical forgot-password response. Every outcome — unknown email, social
 * account, email-send failure, or success — must return this exact message so
 * the endpoint cannot be used to enumerate accounts.
 */
const FORGOT_PASSWORD_MESSAGE =
  'If an account exists, a password reset link has been sent';

/**
 * Refresh failures that invalidate the current session. Other `AuthError`s
 * (for example a storage-side token creation failure) leave the cookies alone
 * so the client can retry without being forced to log in again.
 */
const SESSION_INVALIDATING_CODES: ReadonlySet<string> = new Set([
  'REFRESH_TOKEN_NOT_FOUND',
  'REFRESH_TOKEN_EXPIRED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'UNEXPECTED_ERROR_OCCURRED',
]);

export interface CredAuthController {
  register: RequestHandler;
  login: RequestHandler;
  logout: RequestHandler;
  refresh: RequestHandler;
  verifyEmail: RequestHandler;
  forgotPassword: RequestHandler;
  resetPassword: RequestHandler;
}

export const createAuthController = (
  config: ResolvedCredExpressConfig,
  deps: CredCoreDeps,
): CredAuthController => {
  const authConfig = createCoreAuthConfig(config);

  return {
    register: async (req, res) => {
      const input = req.body as RegisterRequest;

      await registerUser(input, deps, getRequestContext(req), config.core);

      sendSuccess(
        res,
        {},
        'User registered successfully. Verify your email first.',
        201,
      );
    },

    login: async (req, res) => {
      const input = req.body as LoginRequest;

      const result = await loginUser(
        input,
        deps,
        authConfig,
        getRequestContext(req),
      );

      setAuthCookies(res, result, config);

      sendSuccess(res, { user: result.user }, 'Logged in successfully');
    },

    logout: async (req, res) => {
      const user = getAuthenticatedUser(res);
      const rawToken = readRefreshTokenCookie(req, config);

      await logoutUser(
        {
          rawToken: rawToken ?? '',
          userId: user.id,
          ...getRequestContext(req),
        },
        deps,
      );

      clearAuthCookies(res, config);

      sendSuccess(res, null, 'Logged out successfully');
    },

    refresh: async (req, res) => {
      const rawToken = readRefreshTokenCookie(req, config) ?? '';

      try {
        const tokens = await refreshUser(
          { rawToken, ...getRequestContext(req) },
          deps,
          authConfig,
        );

        setAuthCookies(res, tokens, config);

        sendSuccess(res, null, 'Token refreshed successfully');
      } catch (error) {
        // An invalid, expired, or replayed refresh token invalidates the
        // session represented by the cookies. A missing cookie has nothing to
        // clear (and must match the shipped API's 401 response).
        if (
          rawToken &&
          error instanceof AuthError &&
          SESSION_INVALIDATING_CODES.has(error.code)
        ) {
          clearAuthCookies(res, config);
        }

        throw error;
      }
    },

    verifyEmail: async (req, res) => {
      try {
        await verifyEmailUser(
          readRouteParam(req.params.token),
          deps,
          getRequestContext(req),
        );
        res.redirect(`${config.clientUrl}/login?verified=true`);
      } catch {
        // Verification always redirects, even for malformed or expired tokens,
        // so the link works from an email client without exposing an error page.
        res.redirect(`${config.clientUrl}/login?verified=false`);
      }
    },

    forgotPassword: async (req, res) => {
      const input = req.body as { email: string };

      try {
        await forgotPasswordUser(
          input,
          deps,
          getRequestContext(req),
          config.core,
        );
      } catch (error) {
        // A failed send must not reveal that the account exists. Storage
        // failures still propagate to the error handler.
        if (!(error instanceof AuthError) || error.code !== 'EMAIL_SEND_FAILED') {
          throw error;
        }
      }

      sendSuccess(res, null, FORGOT_PASSWORD_MESSAGE);
    },

    resetPassword: async (req, res) => {
      const body = req.body as { password: string };

      await resetPasswordUser(
        {
          token: readRouteParam(req.params.token),
          newPassword: body.password,
        },
        deps,
        getRequestContext(req),
        config.core,
      );

      sendSuccess(res, null, 'Password reset successfully');
    },
  };
};
