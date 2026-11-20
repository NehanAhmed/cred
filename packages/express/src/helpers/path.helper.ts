import type { CredOAuthProvider } from '../types.js';

/**
 * Refresh-token and OAuth-state cookies are scoped to the auth subtree so they
 * are not sent on profile requests. `basePath` is normalized without a trailing
 * slash by config resolution (`'/'` becomes `''`).
 */
export const authCookiePath = (basePath: string): string => `${basePath}/auth`;

/** Public callback URL registered with the OAuth provider. */
export const oauthCallbackUrl = (
  backendUrl: string,
  basePath: string,
  provider: CredOAuthProvider,
): string => `${backendUrl}${basePath}/auth/${provider}/callback`;
