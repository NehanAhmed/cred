import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { CredRateLimitRule, CredRateLimits } from '../config.js';

export type CredRateLimiters = {
  [K in keyof CredRateLimits]: RateLimitRequestHandler;
};

const createLimiter = (rule: CredRateLimitRule): RateLimitRequestHandler =>
  rateLimit({
    windowMs: rule.windowMs,
    limit: rule.max,
    message: rule.message,
    standardHeaders: true,
    legacyHeaders: false,
  });

/**
 * Builds one limiter per route group. The table mirrors the shipped API: a
 * broad `auth`/`profile` limiter is mounted on the subtree and each sensitive
 * route adds a tighter rule on top, so the stricter budget always wins.
 */
export const createRateLimiters = (rules: CredRateLimits): CredRateLimiters => ({
  auth: createLimiter(rules.auth),
  login: createLimiter(rules.login),
  register: createLimiter(rules.register),
  forgotPassword: createLimiter(rules.forgotPassword),
  refresh: createLimiter(rules.refresh),
  verifyEmail: createLimiter(rules.verifyEmail),
  resetPassword: createLimiter(rules.resetPassword),
  logout: createLimiter(rules.logout),
  oauth: createLimiter(rules.oauth),
  profile: createLimiter(rules.profile),
  profileUpdate: createLimiter(rules.profileUpdate),
});
