import {
  deleteAccount as deleteAccountUser,
  getAuditLogs as getAuditLogsUser,
  getProfile as getProfileUser,
  updatePassword as updatePasswordUser,
  updateProfile as updateProfileUser,
  type PasswordChangeRequest,
  type ProfileUpdateRequest,
} from '@cred-kit/core';
import type { RequestHandler } from 'express';
import type { ResolvedCredExpressConfig } from '../config.js';
import { sendError, sendSuccess } from '../helpers/api.helper.js';
import { clearAuthCookies } from '../helpers/cookie.helper.js';
import {
  getAuthenticatedUser,
  getRequestContext,
} from '../helpers/request.helper.js';
import type { CredCoreDeps } from '../types.js';

export interface CredProfileController {
  getProfile: RequestHandler;
  updateProfile: RequestHandler;
  updatePassword: RequestHandler;
  deleteAccount: RequestHandler;
  getAuditLogs: RequestHandler;
}

/**
 * Reads a pagination query value. Non-numeric input becomes `undefined` so core
 * applies its configured default; core clamps the range (1–100 by default).
 */
const readPageQuery = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const createProfileController = (
  config: ResolvedCredExpressConfig,
  deps: CredCoreDeps,
): CredProfileController => {
  return {
    getProfile: async (_req, res) => {
      const user = getAuthenticatedUser(res);

      const profile = await getProfileUser(
        { userId: user.id },
        { userDatabase: deps.userDatabase },
      );

      sendSuccess(res, profile, 'Profile fetched successfully');
    },

    updateProfile: async (req, res) => {
      const user = getAuthenticatedUser(res);
      const input = req.body as ProfileUpdateRequest;

      const profile = await updateProfileUser(
        input,
        { userId: user.id, ...getRequestContext(req) },
        deps,
      );

      sendSuccess(res, profile, 'Profile updated successfully');
    },

    updatePassword: async (req, res) => {
      const user = getAuthenticatedUser(res);
      const input = req.body as PasswordChangeRequest;

      const profile = await updatePasswordUser(
        input,
        { userId: user.id, ...getRequestContext(req) },
        deps,
        config.core,
      );

      sendSuccess(res, profile, 'Password updated successfully');
    },

    deleteAccount: async (req, res) => {
      const user = getAuthenticatedUser(res);

      await deleteAccountUser(
        { userId: user.id, ...getRequestContext(req) },
        deps,
      );

      clearAuthCookies(res, config);

      sendSuccess(res, null, 'Account deleted successfully');
    },

    getAuditLogs: async (req, res) => {
      if (!deps.auditDatabase) {
        sendError(res, 'Audit logging is not configured', 503);
        return;
      }

      const user = getAuthenticatedUser(res);

      const result = await getAuditLogsUser(
        {
          userId: user.id,
          page: readPageQuery(req.query.page),
          limit: readPageQuery(req.query.limit),
        },
        { auditDatabase: deps.auditDatabase },
        config.core,
      );

      sendSuccess(res, result, 'Audit logs fetched successfully');
    },
  };
};
