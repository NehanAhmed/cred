import {
  loginSchema,
  passwordChangeSchema,
  passwordForgotSchema,
  passwordResetSchema,
  profileSchema,
  registerSchema,
} from '@cred/core';
import cookieParser from 'cookie-parser';
import express, { type Router } from 'express';
import type { ResolvedCredExpressConfig } from './config.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createOAuthController } from './controllers/oauth.controller.js';
import { createProfileController } from './controllers/profile.controller.js';
import { createRequireAuth } from './middleware/auth.middleware.js';
import { createErrorHandler } from './middleware/error.middleware.js';
import { createRateLimiters } from './middleware/rate-limit.middleware.js';
import { validate } from './middleware/validate.middleware.js';
import type { CredCoreDeps } from './types.js';

/**
 * Builds the complete Cred router. The router owns JSON/cookie parsing so the
 * host does not need to mount those globally, and so parsing stays scoped to
 * Cred's own routes.
 */
export const createRouter = (
  config: ResolvedCredExpressConfig,
  deps: CredCoreDeps,
): Router => {
  const auth = createAuthController(config, deps);
  const profile = createProfileController(config, deps);
  const oauth = createOAuthController(config, deps);

  const limiters = createRateLimiters(config.rateLimits);
  const requireAuth = createRequireAuth(config);

  const authRouter = express.Router();

  // Every auth route (including OAuth) passes through the broad limiter, then
  // the route-specific limiter where one exists.
  authRouter.use(limiters.auth);

  authRouter.post('/', limiters.register, validate(registerSchema), auth.register);
  authRouter.post('/login', limiters.login, validate(loginSchema), auth.login);
  authRouter.post('/logout', limiters.logout, requireAuth, auth.logout);
  authRouter.post('/refresh', limiters.refresh, auth.refresh);
  authRouter.get('/verify-email/:token', limiters.verifyEmail, auth.verifyEmail);
  authRouter.post(
    '/forgot-password',
    limiters.forgotPassword,
    validate(passwordForgotSchema),
    auth.forgotPassword,
  );
  authRouter.post(
    '/reset-password/:token',
    limiters.resetPassword,
    validate(passwordResetSchema),
    auth.resetPassword,
  );

  authRouter.get('/google', limiters.oauth, oauth.startGoogle);
  authRouter.get('/google/callback', limiters.oauth, oauth.callbackGoogle);
  authRouter.get('/github', limiters.oauth, oauth.startGitHub);
  authRouter.get('/github/callback', limiters.oauth, oauth.callbackGitHub);

  const profileRouter = express.Router();

  profileRouter.use(limiters.profile, requireAuth);
  profileRouter.get('/me', profile.getProfile);
  profileRouter.put(
    '/me',
    limiters.profileUpdate,
    validate(profileSchema),
    profile.updateProfile,
  );
  profileRouter.delete('/me', profile.deleteAccount);
  profileRouter.post(
    '/me/change-password',
    limiters.profileUpdate,
    validate(passwordChangeSchema),
    profile.updatePassword,
  );
  profileRouter.get('/me/audit-logs', profile.getAuditLogs);

  const router = express.Router();

  router.use(express.json({ limit: config.jsonBodyLimit }));
  router.use(cookieParser());
  router.use('/auth', authRouter);
  router.use('/profile', profileRouter);
  router.use(createErrorHandler(config));

  return router;
};
