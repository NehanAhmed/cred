import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { oauthCallback, findOrCreateOAuthUser } from './oauth.service.js';
import { generateAccessToken } from '../helpers/auth.helper.js';
import { makeDeps, TEST_JWT_SECRET, buildUser } from '../__tests__/fakes.js';

// ---------------------------------------------------------------------------
// oauthCallback
// ---------------------------------------------------------------------------
describe('oauthCallback', () => {
  const oauthUser = {
    id: 'user-1',
    email: 'oauthuser@example.com',
    username: 'oauthuser',
    provider: 'google' as const,
  };
  let deps = makeDeps();

  beforeEach(() => {
    deps = makeDeps();
  });

  const callbackDeps = () => ({
    userDatabase: deps.users,
    refreshTokenDatabase: deps.tokens,
    auditDatabase: deps.audit,
  });

  it('returns tokens, creates a refresh token, and updates login metadata on success', async () => {
    deps.users.users.push(
      buildUser(
        { username: 'oauthuser', email: 'oauthuser@example.com', password: 'hashed-password', isVerified: true },
        'user-1',
      ),
    );

    const result = await oauthCallback(
      { user: oauthUser },
      callbackDeps(),
      { jwtSecret: TEST_JWT_SECRET },
      { ip: '127.0.0.1', userAgent: 'test-agent' },
    );

    expect(result.user).toEqual(oauthUser);
    expect(result.refreshToken).toMatch(/^[a-f0-9]{80}$/);

    const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as {
      id: string;
      email: string;
      username: string;
      tokenType: string;
    };
    expect(decoded).toMatchObject({
      id: 'user-1',
      email: 'oauthuser@example.com',
      username: 'oauthuser',
      tokenType: 'access',
    });

    expect(deps.tokens.tokens).toHaveLength(1);
    expect(deps.tokens.tokens[0].user).toBe('user-1');
    expect(deps.tokens.tokens[0].consumed).toBe(false);
    expect(deps.tokens.tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    const user = deps.users.users[0];
    expect(user.lastLogin).toBeInstanceOf(Date);
    expect(user.lastIp).toBe('127.0.0.1');
  });

  it('audits a successful oauth login with the provider', async () => {
    await oauthCallback(
      { user: oauthUser },
      callbackDeps(),
      { jwtSecret: TEST_JWT_SECRET },
      { ip: '127.0.0.1' },
    );

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: 'user-1',
        action: 'oauth_login',
        status: 'success',
        provider: 'google',
      }),
    ]);
  });

  it('throws OAUTH_FAILED and audits the failure when no user is returned', async () => {
    await expect(
      oauthCallback({ user: null }, callbackDeps(), { jwtSecret: TEST_JWT_SECRET }, { ip: '127.0.0.1' }),
    ).rejects.toMatchObject({ code: 'OAUTH_FAILED', statusCode: 401 });

    expect(deps.tokens.tokens).toHaveLength(0);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'oauth_login',
        status: 'failure',
        metadata: { reason: 'No user returned from OAuth provider' },
      }),
    ]);
  });

  it('throws OAUTH_INVALID_USER and audits the failure when fields are missing', async () => {
    await expect(
      oauthCallback(
        { user: { id: 'user-1', email: undefined, username: 'oauthuser' } },
        callbackDeps(),
        { jwtSecret: TEST_JWT_SECRET },
        {},
      ),
    ).rejects.toMatchObject({ code: 'OAUTH_INVALID_USER', statusCode: 401 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'oauth_login',
        status: 'failure',
        metadata: {
          reason: 'Invalid user object from OAuth provider',
          fields: { userId: true, email: false, username: true },
        },
      }),
    ]);
  });

  it('throws REFRESH_TOKEN_CREATION_FAILED when the token cannot be created', async () => {
    deps.tokens.createFails = true;

    await expect(
      oauthCallback({ user: oauthUser }, callbackDeps(), { jwtSecret: TEST_JWT_SECRET }, {}),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_CREATION_FAILED', statusCode: 500 });
  });
});

// ---------------------------------------------------------------------------
// findOrCreateOAuthUser
// ---------------------------------------------------------------------------
describe('findOrCreateOAuthUser', () => {
  let deps = makeDeps();

  beforeEach(() => {
    deps = makeDeps();
  });

  const depsWithAudit = () => ({ userDatabase: deps.users, auditDatabase: deps.audit });

  it('returns the existing user matched by provider id without creating anything', async () => {
    await deps.users.create({
      username: 'linked',
      email: 'linked@example.com',
      password: 'hashed-password',
      isVerified: true,
      provider: 'google',
      googleId: 'google-123',
    });

    const result = await findOrCreateOAuthUser(
      { provider: 'google', profileId: 'google-123', email: 'new@example.com', displayName: 'New' },
      depsWithAudit(),
    );

    expect(result.id).toBe('1');
    expect(deps.users.users).toHaveLength(1);
    expect(deps.email.verifications).toHaveLength(0);
  });

  it('links an existing local account by email and audits the link', async () => {
    await deps.users.create({
      username: 'localuser',
      email: 'local@example.com',
      password: 'hashed-password',
      isVerified: true,
    });

    const result = await findOrCreateOAuthUser(
      { provider: 'google', profileId: 'google-123', email: 'local@example.com', avatar: 'https://avatar' },
      depsWithAudit(),
    );

    expect(result.provider).toBe('google');
    expect(result.googleId).toBe('google-123');
    expect(result.avatar).toBe('https://avatar');
    expect(deps.users.users).toHaveLength(1);

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: result.id,
        action: 'oauth_login',
        status: 'success',
        provider: 'google',
        metadata: { reason: 'Account linked to existing local user by email' },
      }),
    ]);
  });

  it('links an existing social account by email without flipping the provider and without an audit', async () => {
    await deps.users.create({
      username: 'githubuser',
      email: 'github@example.com',
      password: 'hashed-password',
      isVerified: true,
      provider: 'github',
      githubId: 'github-1',
    });

    const result = await findOrCreateOAuthUser(
      { provider: 'google', profileId: 'google-123', email: 'github@example.com' },
      depsWithAudit(),
    );

    expect(result.provider).toBe('github');
    expect(result.googleId).toBe('google-123');
    expect(deps.users.users).toHaveLength(1);
    expect(deps.audit.logs).toHaveLength(0);
  });

  it('creates a new user with a sanitized username and a fallback email', async () => {
    const result = await findOrCreateOAuthUser(
      { provider: 'github', profileId: 'github-9', displayName: 'Display Name!', avatar: 'https://avatar' },
      depsWithAudit(),
    );

    expect(result.username).toBe('displayname');
    expect(result.email).toBe('github-9@github.oauth');
    expect(result.provider).toBe('github');
    expect(result.githubId).toBe('github-9');
    expect(result.isVerified).toBe(true);
    expect(result.avatar).toBe('https://avatar');
    expect(result.password).not.toBe('');
    expect(deps.audit.logs).toHaveLength(0);
  });

  it('appends a random suffix when the sanitized username is taken', async () => {
    await deps.users.create({
      username: 'displayname',
      email: 'taken@example.com',
      password: 'hashed-password',
      isVerified: true,
    });

    const result = await findOrCreateOAuthUser(
      { provider: 'github', profileId: 'github-9', displayName: 'Display Name!' },
      depsWithAudit(),
    );

    expect(result.username).toMatch(/^displayname_[a-f0-9]{6}$/);
    expect(deps.users.users).toHaveLength(2);
  });

  it('falls back to a random username when nothing sanitizable remains', async () => {
    const result = await findOrCreateOAuthUser(
      { provider: 'github', profileId: 'github-9', displayName: '@@@###' },
      depsWithAudit(),
    );

    expect(result.username).toMatch(/^user_[a-f0-9]{8}$/);
  });
});
