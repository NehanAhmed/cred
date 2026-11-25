import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { CredRateLimitRule, CredRateLimits, ResolvedCredHealthConfig } from '../config.js';
import type { CredRateLimitStoreFactory } from '../config.js';

export type CredRateLimiters = {
  [K in keyof CredRateLimits]: RateLimitRequestHandler;
};

const createLimiter = (
  rule: CredRateLimitRule,
  storeFactory?: CredRateLimitStoreFactory,
  keyPrefix?: string
): RateLimitRequestHandler =>
  rateLimit({
    windowMs: rule.windowMs,
    limit: rule.max,
    message: rule.message,
    standardHeaders: true,
    legacyHeaders: false,
    ...(storeFactory === undefined ? {} : { store: storeFactory(keyPrefix ?? rule.message) })
  });

/**
 * Builds one limiter per route group. The table mirrors the shipped API: a
 * broad `auth`/`profile` limiter is mounted on the subtree and each sensitive
 * route adds a tighter rule on top, so the stricter budget always wins.
 *
 * `storeFactory` is called once per limiter; `express-rate-limit` rejects
 * sharing a single store instance between limiters. Each call receives a
 * unique `keyPrefix` so that a shared backend store can namespace counters by
 * limiter (for example `auth-login`, `profile-update`) rather than collapsing
 * all requests into the same bucket.
 */
export const createRateLimiters = (
  rules: CredRateLimits,
  storeFactory?: CredRateLimitStoreFactory
): CredRateLimiters => ({
  auth: createLimiter(rules.auth, storeFactory, 'auth'),
  login: createLimiter(rules.login, storeFactory, 'login'),
  register: createLimiter(rules.register, storeFactory, 'register'),
  forgotPassword: createLimiter(rules.forgotPassword, storeFactory, 'forgot-password'),
  refresh: createLimiter(rules.refresh, storeFactory, 'refresh'),
  verifyEmail: createLimiter(rules.verifyEmail, storeFactory, 'verify-email'),
  resetPassword: createLimiter(rules.resetPassword, storeFactory, 'reset-password'),
  logout: createLimiter(rules.logout, storeFactory, 'logout'),
  oauth: createLimiter(rules.oauth, storeFactory, 'oauth'),
  profile: createLimiter(rules.profile, storeFactory, 'profile'),
  profileUpdate: createLimiter(rules.profileUpdate, storeFactory, 'profile-update')
});

/** Creates the dedicated health-check limiter. Defaults are 60 seconds / 30 requests. */
export const createHealthLimiter = (
  health: ResolvedCredHealthConfig,
  storeFactory?: CredRateLimitStoreFactory
): RateLimitRequestHandler => createLimiter(health.rateLimit, storeFactory, 'health');
