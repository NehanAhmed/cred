import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { CredRateLimitRule, CredRateLimits, ResolvedCredHealthConfig } from '../config.js';
import type { CredRateLimitStoreFactory } from '../config.js';

export type CredRateLimiters = {
  [K in keyof CredRateLimits]: RateLimitRequestHandler;
};

const createLimiter = (
  rule: CredRateLimitRule,
  storeFactory?: CredRateLimitStoreFactory
): RateLimitRequestHandler =>
  rateLimit({
    windowMs: rule.windowMs,
    limit: rule.max,
    message: rule.message,
    standardHeaders: true,
    legacyHeaders: false,
    ...(storeFactory === undefined ? {} : { store: storeFactory() })
  });

/**
 * Builds one limiter per route group. The table mirrors the shipped API: a
 * broad `auth`/`profile` limiter is mounted on the subtree and each sensitive
 * route adds a tighter rule on top, so the stricter budget always wins.
 *
 * `storeFactory` is called once per limiter; `express-rate-limit` rejects
 * sharing a single store instance between limiters.
 */
export const createRateLimiters = (
  rules: CredRateLimits,
  storeFactory?: CredRateLimitStoreFactory
): CredRateLimiters => ({
  auth: createLimiter(rules.auth, storeFactory),
  login: createLimiter(rules.login, storeFactory),
  register: createLimiter(rules.register, storeFactory),
  forgotPassword: createLimiter(rules.forgotPassword, storeFactory),
  refresh: createLimiter(rules.refresh, storeFactory),
  verifyEmail: createLimiter(rules.verifyEmail, storeFactory),
  resetPassword: createLimiter(rules.resetPassword, storeFactory),
  logout: createLimiter(rules.logout, storeFactory),
  oauth: createLimiter(rules.oauth, storeFactory),
  profile: createLimiter(rules.profile, storeFactory),
  profileUpdate: createLimiter(rules.profileUpdate, storeFactory)
});

/** Creates the dedicated health-check limiter. Defaults are 60 seconds / 30 requests. */
export const createHealthLimiter = (
  health: ResolvedCredHealthConfig,
  storeFactory?: CredRateLimitStoreFactory
): RateLimitRequestHandler => createLimiter(health.rateLimit, storeFactory);
