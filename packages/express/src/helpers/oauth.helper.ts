import type { CredOAuthProviderConfig } from '../config.js';
import type { CredOAuthProvider } from '../types.js';
import { oauthCallbackUrl } from './path.helper.js';

const OAUTH_REQUEST_TIMEOUT_MS = 10_000;

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

export interface OAuthProfile {
  provider: CredOAuthProvider;
  profileId: string;
  email?: string;
  displayName: string;
  avatar?: string;
  /** True only when the provider has verified ownership of `email`. */
  isEmailVerified: boolean;
}

/** Raised for provider-side failures (network, token exchange, profile fetch). */
export class OAuthProviderError extends Error {
  constructor(
    public readonly provider: CredOAuthProvider,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(`@cred-kit/express: ${provider} OAuth ${message}`, options);
    this.name = 'OAuthProviderError';
  }
}

const request = async (
  provider: CredOAuthProvider,
  url: string,
  init: RequestInit,
): Promise<Response> => {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OAuthProviderError(provider, 'request failed', { cause: error });
  }
};

const readJson = async <T>(
  provider: CredOAuthProvider,
  label: string,
  response: Response,
): Promise<T> => {
  if (!response.ok) {
    throw new OAuthProviderError(provider, `${label} failed with status ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new OAuthProviderError(provider, `${label} returned invalid JSON`, { cause: error });
  }
};

export const buildGoogleAuthorizationUrl = (
  credentials: CredOAuthProviderConfig,
  options: { backendUrl: string; basePath: string },
  state: string,
): string => {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: oauthCallbackUrl(options.backendUrl, options.basePath, 'google'),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  }).toString();

  return url.toString();
};

export const buildGitHubAuthorizationUrl = (
  credentials: CredOAuthProviderConfig,
  options: { backendUrl: string; basePath: string },
  state: string,
): string => {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: oauthCallbackUrl(options.backendUrl, options.basePath, 'github'),
    scope: 'user:email',
    state,
  }).toString();

  return url.toString();
};

const exchangeGoogleCode = async (
  credentials: CredOAuthProviderConfig,
  options: { backendUrl: string; basePath: string },
  code: string,
): Promise<string> => {
  const response = await request('google', GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: oauthCallbackUrl(options.backendUrl, options.basePath, 'google'),
      grant_type: 'authorization_code',
      code,
    }).toString(),
  });

  const data = await readJson<{ access_token?: unknown; error?: unknown }>(
    'google',
    'token exchange',
    response,
  );

  if (typeof data.access_token !== 'string' || data.access_token === '') {
    const detail = typeof data.error === 'string' ? `: ${data.error}` : '';
    throw new OAuthProviderError('google', `token exchange failed${detail}`);
  }

  return data.access_token;
};

export const fetchGoogleProfile = async (
  credentials: CredOAuthProviderConfig,
  options: { backendUrl: string; basePath: string },
  code: string,
): Promise<OAuthProfile> => {
  const accessToken = await exchangeGoogleCode(credentials, options, code);

  const response = await request('google', GOOGLE_USERINFO_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await readJson<{
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    picture?: unknown;
  }>('google', 'user profile request', response);

  if (typeof data.sub !== 'string' || data.sub === '') {
    throw new OAuthProviderError('google', 'profile response did not contain a subject id');
  }

  const email =
    typeof data.email === 'string' && data.email.trim() !== '' ? data.email.trim() : undefined;
  const displayName =
    typeof data.name === 'string' && data.name.trim() !== ''
      ? data.name.trim()
      : (email?.split('@')[0] ?? 'user');
  const avatar =
    typeof data.picture === 'string' && data.picture.trim() !== ''
      ? data.picture.trim()
      : undefined;

  return {
    provider: 'google',
    profileId: data.sub,
    email,
    displayName,
    avatar,
    isEmailVerified: email !== undefined && data.email_verified === true,
  };
};

const exchangeGitHubCode = async (
  credentials: CredOAuthProviderConfig,
  options: { backendUrl: string; basePath: string },
  code: string,
): Promise<string> => {
  const response = await request('github', GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: oauthCallbackUrl(options.backendUrl, options.basePath, 'github'),
      code,
    }).toString(),
  });

  const data = await readJson<{ access_token?: unknown; error?: unknown }>(
    'github',
    'token exchange',
    response,
  );

  if (typeof data.access_token !== 'string' || data.access_token === '') {
    const detail = typeof data.error === 'string' ? `: ${data.error}` : '';
    throw new OAuthProviderError('github', `token exchange failed${detail}`);
  }

  return data.access_token;
};

const githubHeaders = (accessToken: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${accessToken}`,
  'User-Agent': 'cred-kit-express',
  'X-GitHub-Api-Version': '2022-11-28',
});

interface GitHubUserResponse {
  id?: unknown;
  login?: unknown;
  name?: unknown;
  avatar_url?: unknown;
}

interface GitHubEmailResponse {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

/**
 * Reads the verified primary email, falling back to any verified address.
 * GitHub's `/user` endpoint may expose an unverified public email, so it is
 * deliberately ignored for account linking.
 */
const fetchGitHubVerifiedEmail = async (accessToken: string): Promise<string | undefined> => {
  try {
    const response = await request('github', `${GITHUB_API_URL}/user/emails`, {
      headers: githubHeaders(accessToken),
    });

    if (!response.ok) return undefined;

    const emails = (await response.json()) as unknown;
    if (!Array.isArray(emails)) return undefined;

    const entries = emails.filter(
      (entry): entry is GitHubEmailResponse => typeof entry === 'object' && entry !== null,
    );
    const selected =
      entries.find((entry) => entry.primary === true && entry.verified === true) ??
      entries.find((entry) => entry.verified === true);

    return typeof selected?.email === 'string' && selected.email.trim() !== ''
      ? selected.email.trim()
      : undefined;
  } catch {
    // A failed email lookup must never grant an unverified email; the login can
    // still proceed by provider id (or create a placeholder-email account).
    return undefined;
  }
};

export const fetchGitHubProfile = async (
  credentials: CredOAuthProviderConfig,
  options: { backendUrl: string; basePath: string },
  code: string,
): Promise<OAuthProfile> => {
  const accessToken = await exchangeGitHubCode(credentials, options, code);

  const response = await request('github', `${GITHUB_API_URL}/user`, {
    headers: githubHeaders(accessToken),
  });

  const data = await readJson<GitHubUserResponse>('github', 'user profile request', response);

  if (typeof data.id !== 'number' && typeof data.id !== 'string') {
    throw new OAuthProviderError('github', 'profile response did not contain a user id');
  }

  const profileId = String(data.id);
  const email = await fetchGitHubVerifiedEmail(accessToken);
  const login = typeof data.login === 'string' && data.login.trim() !== '' ? data.login.trim() : undefined;
  const displayName =
    typeof data.name === 'string' && data.name.trim() !== ''
      ? data.name.trim()
      : (login ?? email?.split('@')[0] ?? 'user');
  const avatar =
    typeof data.avatar_url === 'string' && data.avatar_url.trim() !== ''
      ? data.avatar_url.trim()
      : undefined;

  return {
    provider: 'github',
    profileId,
    email,
    displayName,
    avatar,
    isEmailVerified: email !== undefined,
  };
};
