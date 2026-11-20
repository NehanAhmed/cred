import {
  findOrCreateOAuthUser,
  oauthCallback as completeOAuthCallback,
} from '@cred/core';
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import {
  createCoreAuthConfig,
  type CredOAuthProviderConfig,
  type ResolvedCredExpressConfig,
} from '../config.js';
import {
  clearOAuthStateCookie,
  OAUTH_STATE_COOKIE,
  setAuthCookies,
  setOAuthStateCookie,
} from '../helpers/cookie.helper.js';
import {
  buildGitHubAuthorizationUrl,
  buildGoogleAuthorizationUrl,
  fetchGitHubProfile,
  fetchGoogleProfile,
  type OAuthProfile,
} from '../helpers/oauth.helper.js';
import { getRequestContext, readCookie } from '../helpers/request.helper.js';
import type { CredCoreDeps, CredOAuthProvider } from '../types.js';

export interface CredOAuthController {
  startGoogle: RequestHandler;
  callbackGoogle: RequestHandler;
  startGitHub: RequestHandler;
  callbackGitHub: RequestHandler;
}

const readQueryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export const createOAuthController = (
  config: ResolvedCredExpressConfig,
  deps: CredCoreDeps,
): CredOAuthController => {
  const authConfig = createCoreAuthConfig(config);
  const providerOptions = {
    backendUrl: config.backendUrl,
    basePath: config.basePath,
  };

  const loginRedirect = (error: string): string =>
    `${config.clientUrl}/login?error=${error}`;

  const start =
    (provider: CredOAuthProvider): RequestHandler =>
    (_req, res) => {
      const credentials = config.oauth[provider];

      if (!credentials) {
        res.redirect(loginRedirect(`${provider}_auth_failed`));
        return;
      }

      const state = randomBytes(32).toString('hex');
      setOAuthStateCookie(res, state, config);

      const authorizationUrl =
        provider === 'google'
          ? buildGoogleAuthorizationUrl(credentials, providerOptions, state)
          : buildGitHubAuthorizationUrl(credentials, providerOptions, state);

      res.redirect(authorizationUrl);
    };

  const fetchProfile = (
    provider: CredOAuthProvider,
    credentials: CredOAuthProviderConfig,
    code: string,
  ): Promise<OAuthProfile> =>
    provider === 'google'
      ? fetchGoogleProfile(credentials, providerOptions, code)
      : fetchGitHubProfile(credentials, providerOptions, code);

  const callback =
    (provider: CredOAuthProvider): RequestHandler =>
    async (req, res) => {
      const cookieState = readCookie(req, OAUTH_STATE_COOKIE);
      const queryState = readQueryString(req.query.state);

      if (!cookieState || !queryState || cookieState !== queryState) {
        res.redirect(loginRedirect('oauth_state_mismatch'));
        return;
      }

      clearOAuthStateCookie(res, config);

      const credentials = config.oauth[provider];
      if (!credentials) {
        res.redirect(loginRedirect(`${provider}_auth_failed`));
        return;
      }

      // The user cancelled or the provider rejected the request.
      if (readQueryString(req.query.error) !== undefined) {
        res.redirect(loginRedirect(`${provider}_auth_failed`));
        return;
      }

      const code = readQueryString(req.query.code);
      if (!code) {
        res.redirect(loginRedirect(`${provider}_auth_failed`));
        return;
      }

      let profile: OAuthProfile;
      try {
        profile = await fetchProfile(provider, credentials, code);
      } catch (error) {
        config.logger.error(
          `@cred/express: ${provider} OAuth authentication failed`,
          error,
        );
        res.redirect(loginRedirect(`${provider}_auth_failed`));
        return;
      }

      try {
        const user = await findOrCreateOAuthUser(
          {
            provider,
            profileId: profile.profileId,
            email: profile.email,
            displayName: profile.displayName,
            avatar: profile.avatar,
            isEmailVerified: profile.isEmailVerified,
          },
          deps,
          config.core,
        );

        const result = await completeOAuthCallback(
          {
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              provider: user.provider,
            },
            provider,
          },
          deps,
          authConfig,
          getRequestContext(req),
        );

        // A callback is reached through a cross-site redirect, so the auth
        // cookies must use `lax` rather than the standard `strict` policy.
        setAuthCookies(res, result, config, 'lax');

        res.redirect(`${config.clientUrl}/auth/callback`);
      } catch (error) {
        config.logger.error(
          `@cred/express: ${provider} OAuth callback failed`,
          error,
        );
        res.redirect(loginRedirect('oauth_failed'));
      }
    };

  return {
    startGoogle: start('google'),
    callbackGoogle: callback('google'),
    startGitHub: start('github'),
    callbackGitHub: callback('github'),
  };
};
