import type { Router } from 'express';
import {
  createCoreDeps,
  resolveCredConfig,
  type CredExpressConfig,
} from './config.js';
import { createRouter } from './router.js';

/**
 * Creates the Cred Express router.
 *
 * ```ts
 * app.use('/api', credExpress({ ...config }));
 * ```
 *
 * The path passed to `app.use` must match the configured `basePath` (default
 * `/api`): it scopes the refresh-token cookie and builds the OAuth callback
 * URLs registered with the providers.
 */
export const credExpress = (userConfig: CredExpressConfig): Router => {
  const config = resolveCredConfig(userConfig);
  const deps = createCoreDeps(config);

  return createRouter(config, deps);
};

export {
  createCoreAuthConfig,
  createCoreDeps,
  defaultCredRateLimits,
  resolveCredConfig,
  resolveCredRateLimits,
} from './config.js';

export type {
  CredCookieConfig,
  CredDatabaseConfig,
  CredErrorLogger,
  CredExpressConfig,
  CredOAuthConfig,
  CredOAuthProviderConfig,
  CredRateLimitRule,
  CredRateLimits,
  CredRateLimitsInput,
  CredSameSite,
  ResolvedCredCookieConfig,
  ResolvedCredExpressConfig,
} from './config.js';

export type {
  CredCoreDeps,
  CredLocals,
  CredOAuthProvider,
  CredRequestContext,
} from './types.js';
