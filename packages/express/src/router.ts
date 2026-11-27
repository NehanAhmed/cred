import {
  loginSchema,
  passwordChangeSchema,
  passwordForgotSchema,
  passwordResetSchema,
  profileSchema,
  registerSchema
} from '@cred-kit/core';
import cookieParser from 'cookie-parser';
import express, { type Router } from 'express';
import type { ResolvedCredExpressConfig } from './config.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createOAuthController } from './controllers/oauth.controller.js';
import { createProfileController } from './controllers/profile.controller.js';
import { sendError, sendSuccess } from './helpers/api.helper.js';
import { createRequireAuth } from './middleware/auth.middleware.js';
import { createCsrfProtection } from './middleware/csrf.middleware.js';
import { createErrorHandler } from './middleware/error.middleware.js';
import { createHealthLimiter, createRateLimiters } from './middleware/rate-limit.middleware.js';
import { validate } from './middleware/validate.middleware.js';
import type { CredCoreDeps, CredLocals } from './types.js';

/**
 * Builds the complete cred-kit router. The router owns JSON/cookie parsing so the
 * host does not need to mount those globally, and so parsing stays scoped to
 * cred-kit's own routes.
 */
export const createRouter = (config: ResolvedCredExpressConfig, deps: CredCoreDeps): Router => {
  const auth = createAuthController(config, deps);
  const profile = createProfileController(config, deps);
  const oauth = createOAuthController(config, deps);

  const limiters = createRateLimiters(config.rateLimits, config.rateLimitStoreFactory);
  const requireAuth = createRequireAuth(config);

  const authRouter = express.Router();

  // Every auth route (including OAuth) passes through the broad limiter, then
  // the route-specific limiter where one exists.
  authRouter.use(limiters.auth);

  authRouter.get('/csrf-token', (_req, res) => {
    sendSuccess(res, { csrfToken: (res.locals as CredLocals).credCsrfToken });
  });

  authRouter.post('/', limiters.register, validate(registerSchema), auth.register);
  authRouter.post('/login', limiters.login, validate(loginSchema), auth.login);
  authRouter.post('/logout', limiters.logout, requireAuth, auth.logout);
  authRouter.post('/refresh', limiters.refresh, auth.refresh);
  authRouter.get('/verify-email/:token', limiters.verifyEmail, auth.verifyEmail);
  authRouter.post(
    '/forgot-password',
    limiters.forgotPassword,
    validate(passwordForgotSchema),
    auth.forgotPassword
  );
  authRouter.post(
    '/reset-password/:token',
    limiters.resetPassword,
    validate(passwordResetSchema),
    auth.resetPassword
  );
  authRouter.get('/reset-password/:token', limiters.resetPassword, auth.resetPasswordRedirect);

  authRouter.get('/google', limiters.oauth, oauth.startGoogle);
  authRouter.get('/google/callback', limiters.oauth, oauth.callbackGoogle);
  authRouter.get('/github', limiters.oauth, oauth.startGitHub);
  authRouter.get('/github/callback', limiters.oauth, oauth.callbackGitHub);

  const profileRouter = express.Router();

  profileRouter.use(limiters.profile, requireAuth);
  profileRouter.get('/me', profile.getProfile);
  profileRouter.put('/me', limiters.profileUpdate, validate(profileSchema), profile.updateProfile);
  profileRouter.delete('/me', profile.deleteAccount);
  profileRouter.post(
    '/me/change-password',
    limiters.profileUpdate,
    validate(passwordChangeSchema),
    profile.updatePassword
  );
  profileRouter.get('/me/audit-logs', profile.getAuditLogs);

  const router = express.Router();

  router.use(express.json({ limit: config.jsonBodyLimit }));
  router.use(cookieParser());

  if (config.health.enabled) {
    const healthLimiter = createHealthLimiter(config.health, config.rateLimitStoreFactory);
    router.get('/health', healthLimiter, async (req, res) => {
      try {
        await config.health.check();
        sendSuccess(res, { status: 'ok' }, 'Service is healthy');
      } catch (error) {
        config.logger.error(error);
        sendError(res, 'Service Unavailable', 503, { status: 'unavailable' });
      }
    });
  }

  router.use(createCsrfProtection(config));
  router.use('/auth', authRouter);
  router.use('/profile', profileRouter);
  router.use(createErrorHandler(config));

  return router;
};
