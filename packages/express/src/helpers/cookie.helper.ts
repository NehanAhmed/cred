import crypto from 'crypto';
import type { CookieOptions, Response, Request } from 'express';
import type { CredSameSite, ResolvedCredExpressConfig } from '../config.js';
import { authCookiePath } from './path.helper.js';

/** OAuth state cookie lifetime (matches the shipped API). */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_STATE_COOKIE = 'oauth_state';

const REFRESH_TOKEN_ENC_ALGO = 'aes-256-gcm';
const REFRESH_TOKEN_IV_BYTES = 12;

const deriveRefreshCookieKey = (config: ResolvedCredExpressConfig): Buffer => {
  return crypto.createHash('sha256').update(config.core.jwtSecret, 'utf8').digest();
};

const encryptRefreshTokenForCookie = (
  rawToken: string,
  config: ResolvedCredExpressConfig,
): string => {
  const iv = crypto.randomBytes(REFRESH_TOKEN_IV_BYTES);
  const key = deriveRefreshCookieKey(config);
  const cipher = crypto.createCipheriv(REFRESH_TOKEN_ENC_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
};

const decryptRefreshTokenFromCookie = (
  encodedValue: string,
  config: ResolvedCredExpressConfig,
): string | null => {
  const parts = encodedValue.split('.');
  if (parts.length !== 3) return null;
  try {
    const [ivB64, tagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');
    const key = deriveRefreshCookieKey(config);
    const decipher = crypto.createDecipheriv(REFRESH_TOKEN_ENC_ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
};

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

  res.cookie(
    config.cookies.refreshTokenName,
    encryptRefreshTokenForCookie(tokens.refreshToken, config),
    {
      ...commonOptions(config, sameSite),
      path: authCookiePath(config.basePath),
      maxAge: config.cookies.refreshTokenMaxAgeMs,
    },
  );
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
    secure: true,
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
    secure: true,
    path: authCookiePath(config.basePath),
  });
};

export const readRefreshTokenCookie = (
  req: Request,
  config: ResolvedCredExpressConfig,
): string | null => {
  const encoded = req.cookies?.[config.cookies.refreshTokenName];
  if (typeof encoded !== 'string' || encoded.length === 0) return null;
  return decryptRefreshTokenFromCookie(encoded, config);
};
