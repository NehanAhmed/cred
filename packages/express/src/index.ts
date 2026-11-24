import type { Router } from 'express';
import { resolveCredConfig, type CredExpressConfig } from './config.js';
import { createRouter } from './router.js';
import { createCoreRuntime } from './runtime.js';

/**
 * Router returned by {@link credExpress}. It behaves like any Express router,
 * with one addition: `close()` releases the MongoDB connection and mail
 * transport when the adapter built them.
 */
export interface CredExpressRouter extends Router {
  close(): Promise<void>;
}

/**
 * Builds the Cred router and the concrete adapters it needs.
 *
 * ```ts
 * const cred = await credExpress({
 *   database: { uri: process.env.MONGO_URI! },
 *   email: {
 *     EMAIL_FROM: 'no-reply@example.com',
 *     BACKEND_URL: 'https://api.example.com',
 *   },
 *   jwtSecret: process.env.JWT_SECRET!,
 *   clientUrl: 'https://app.example.com',
 *   backendUrl: 'https://api.example.com',
 * });
 *
 * app.use('/api', cred);
 * // during shutdown
 * await cred.close();
 * ```
 *
 * The path passed to `app.use` must match the configured `basePath` (default
 * `/api`): it scopes the refresh-token cookie and builds the OAuth callback
 * URLs registered with the providers.
 *
 * The factory is asynchronous because building the email service is
 * asynchronous. It awaits the MongoDB connection before returning, so the
 * first request never races adapter initialization.
 */
export const credExpress = async (userConfig: CredExpressConfig): Promise<CredExpressRouter> => {
  const config = resolveCredConfig(userConfig);
  const runtime = await createCoreRuntime(config);

  try {
    const router = createRouter(config, runtime.deps) as CredExpressRouter;
    router.close = runtime.close;

    return router;
  } catch (error) {
    try {
      await runtime.close();
    } catch (closeError) {
      config.logger.error(
        '@cred-kit/express: failed to release adapters after router construction failed',
        closeError
      );
    }

    throw error;
  }
};

export {
  createCoreAuthConfig,
  defaultCredRateLimits,
  resolveCredConfig,
  resolveCredRateLimits
} from './config.js';

export { createCoreRuntime } from './runtime.js';

export type { CredCoreRuntime } from './runtime.js';

export { createAuthGuard } from './middleware/auth.middleware.js';

export type { CredAuthGuardOptions } from './middleware/auth.middleware.js';

export type {
  CredCookieConfig,
  CredDatabaseConfig,
  CredDatabaseInput,
  CredEmailInput,
  CredEmailServiceOptions,
  CredErrorLogger,
  CredExpressConfig,
  CredMongoStorageOptions,
  CredOAuthConfig,
  CredOAuthProviderConfig,
  CredRateLimitRule,
  CredRateLimits,
  CredRateLimitsInput,
  CredRateLimitStoreFactory,
  CredSameSite,
  ResolvedCredCookieConfig,
  ResolvedCredDatabase,
  ResolvedCredEmail,
  ResolvedCredExpressConfig
} from './config.js';

export type { CredCoreDeps, CredLocals, CredOAuthProvider, CredRequestContext } from './types.js';
