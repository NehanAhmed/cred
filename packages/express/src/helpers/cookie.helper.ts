import type { CookieOptions, Response } from 'express';
import type { CredSameSite, ResolvedCredExpressConfig } from '../config.js';
import { authCookiePath } from './path.helper.js';

/** OAuth state cookie lifetime (matches the shipped API). */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_COOKIE = 'oauth_state';

const commonOptions = (
  config: ResolvedCredExpressConfig,
  sameSite: CredSameSite,
): CookieOptions => ({
  httpOnly: true,
  secure: config.cookies.secure,
  sameSite,
  ...(config.cookies.domain === undefined ? {} : { domain: config.cookies.domain }),
});

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Sets the access and refresh cookies. OAuth callbacks pass `'lax'` because the
 * cookies are written during a cross-site redirect.
 */
export const setAuthCookies = (
  res: Response,
  tokens: AuthTokens,
  config: ResolvedCredExpressConfig,
  sameSite: CredSameSite = config.cookies.sameSite,
): void => {
  res.cookie(config.cookies.accessTokenName, tokens.accessToken, {
    ...commonOptions(config, sameSite),
    path: config.cookies.accessTokenPath,
    maxAge: config.cookies.accessTokenMaxAgeMs,
  });

  res.cookie(config.cookies.refreshTokenName, tokens.refreshToken, {
    ...commonOptions(config, sameSite),
    path: authCookiePath(config.basePath),
    maxAge: config.cookies.refreshTokenMaxAgeMs,
  });
};

/** Clears both auth cookies using the same paths/domain used when setting them. */
export const clearAuthCookies = (
  res: Response,
  config: ResolvedCredExpressConfig,
): void => {
  const options = commonOptions(config, config.cookies.sameSite);

  res.clearCookie(config.cookies.accessTokenName, {
    ...options,
    path: config.cookies.accessTokenPath,
  });

  res.clearCookie(config.cookies.refreshTokenName, {
    ...options,
    path: authCookiePath(config.basePath),
  });
};

export const setOAuthStateCookie = (
  res: Response,
  state: string,
  config: ResolvedCredExpressConfig,
): void => {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...commonOptions(config, 'lax'),
    path: authCookiePath(config.basePath),
    maxAge: OAUTH_STATE_TTL_MS,
  });
};

export const clearOAuthStateCookie = (
  res: Response,
  config: ResolvedCredExpressConfig,
): void => {
  res.clearCookie(OAUTH_STATE_COOKIE, {
    ...commonOptions(config, 'lax'),
    path: authCookiePath(config.basePath),
  });
};
