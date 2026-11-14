import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from './auth.service.js';
import { AuthError } from '../errors/auth-error.js';
import { generateAccessToken, hashToken } from '../helpers/auth.helper.js';
import { makeDeps, TEST_JWT_SECRET } from '../__tests__/fakes.js';
import type { RegisterRequest } from '../types/auth.types.js';

const validInput: RegisterRequest = {
  username: 'johndoe',
  email: 'john@example.com',
  password: 'SecurePass1',
};

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
describe('register', () => {
  let deps = makeDeps();

  beforeEach(() => {
    deps = makeDeps();
  });

  it('creates a user and sends a verification email', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email });

    expect(deps.users.users).toHaveLength(1);
    expect(deps.users.users[0].username).toBe('johndoe');
    expect(deps.email.verifications).toHaveLength(1);
    expect(deps.email.verifications[0].to).toBe('john@example.com');
  });

  it('lowercases and trims the email before lookup and storage', async () => {
    await register({ ...validInput, email: '  John@Example.COM ' }, { userDatabase: deps.users, email: deps.email });

    const emailLookup = deps.users.findOneCalls.find((filter) => filter.email !== undefined);
    expect(emailLookup?.email).toBe('john@example.com');
    expect(deps.users.users[0].email).toBe('john@example.com');
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email });

    const stored = deps.users.users[0].password;
    expect(stored).not.toBe(validInput.password);
    expect(await bcrypt.compare(validInput.password, stored)).toBe(true);
  });

  it('emails the raw token and stores only its SHA-256 hash', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email });

    const { rawToken } = deps.email.verifications[0];
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(deps.users.users[0].verificationToken).toBe(expectedHash);
    expect(deps.users.users[0].verificationToken).not.toBe(rawToken);
  });

  it('sets the verification token to expire in about 24 hours', async () => {
    const before = Date.now();
    await register(validInput, { userDatabase: deps.users, email: deps.email });
    const after = Date.now();

    const expires = deps.users.users[0].verificationTokenExpires!.getTime();
    const day = 24 * 60 * 60 * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + day);
    expect(expires).toBeLessThanOrEqual(after + day);
  });

  it('passes optional profile fields through', async () => {
    await register(
      { ...validInput, bio: 'Full-stack dev', phoneNumber: '1234567890', gender: 'male' },
      { userDatabase: deps.users, email: deps.email },
    );

    expect(deps.users.users[0]).toMatchObject({
      bio: 'Full-stack dev',
      phoneNumber: '1234567890',
      gender: 'male',
    });
  });

  it('throws USER_EXISTS and does nothing else when the user already exists', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email });
    deps.email.verifications.length = 0;

    await expect(
      register(validInput, { userDatabase: deps.users, email: deps.email, auditDatabase: deps.audit }),
    ).rejects.toMatchObject({
      code: 'USER_EXISTS',
      statusCode: 400,
    });

    expect(deps.users.users).toHaveLength(1);
    expect(deps.email.verifications).toHaveLength(0);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'register',
        status: 'failure',
        metadata: { reason: 'User already exists', email: 'john@example.com', username: 'johndoe' },
      }),
    ]);
  });

  it('treats a duplicate username with a different email as existing', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email });

    await expect(
      register({ ...validInput, email: 'other@example.com' }, { userDatabase: deps.users, email: deps.email }),
    ).rejects.toMatchObject({ code: 'USER_EXISTS' });
  });

  it('throws an AuthError instance', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email });
    await expect(
      register(validInput, { userDatabase: deps.users, email: deps.email }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('throws USER_CREATION_FAILED when the adapter returns nothing', async () => {
    deps.users.createFails = true;

    await expect(
      register(validInput, { userDatabase: deps.users, email: deps.email }),
    ).rejects.toMatchObject({
      code: 'USER_CREATION_FAILED',
      statusCode: 500,
    });
    expect(deps.email.verifications).toHaveLength(0);
  });

  it('rolls back the user and throws EMAIL_SEND_FAILED when the email fails', async () => {
    deps.email.verificationFails = true;

    await expect(
      register(validInput, { userDatabase: deps.users, email: deps.email, auditDatabase: deps.audit }),
    ).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      statusCode: 500,
    });

    expect(deps.users.deletedCalls).toEqual(['1']); // deleted the user that was just created
    expect(deps.users.users).toHaveLength(0);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'register',
        status: 'failure',
        metadata: { reason: 'Failed to send verification email', email: 'john@example.com' },
      }),
    ]);
  });

  it('logs a successful registration audit event', async () => {
    await register(validInput, { userDatabase: deps.users, email: deps.email, auditDatabase: deps.audit });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: '1',
        action: 'register',
        status: 'success',
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
describe('login', () => {
  let deps = makeDeps();
  let userId: string;
  const password = 'Password123';

  beforeEach(async () => {
    deps = makeDeps();
    const user = await deps.users.create({
      username: 'testuser',
      email: 'test@example.com',
      password: await bcrypt.hash(password, 10),
      bio: 'A short bio',
      phoneNumber: '1234567890',
      gender: 'male',
      isVerified: true,
    });
    userId = user.id;
  });

  const loginDeps = () => ({
    userDatabase: deps.users,
    refreshTokenDatabase: deps.tokens,
    auditDatabase: deps.audit,
  });

  it('logs in with email and returns tokens plus the user without a password', async () => {
    const result = await login({ email: 'test@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET });

    expect(result.user).toMatchObject({ id: userId, username: 'testuser', email: 'test@example.com' });
    expect('password' in result.user).toBe(false);
    expect(result.refreshToken).toMatch(/^[a-f0-9]{80}$/);

    const decoded = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64').toString());
    expect(decoded).toMatchObject({ id: userId, email: 'test@example.com', username: 'testuser', tokenType: 'access' });
  });

  it('stores the refresh token hashed and marks it unconsumed', async () => {
    const result = await login({ email: 'test@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET });

    expect(deps.tokens.tokens).toHaveLength(1);
    expect(deps.tokens.tokens[0].token).toBe(hashToken(result.refreshToken));
    expect(deps.tokens.tokens[0].token).not.toBe(result.refreshToken);
    expect(deps.tokens.tokens[0].consumed).toBe(false);
    expect(deps.tokens.tokens[0].user).toBe(userId);
    expect(deps.tokens.tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('logs in with username', async () => {
    const result = await login({ username: 'testuser', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET });
    expect(result.user.username).toBe('testuser');
  });

  it('matches the email case-insensitively and trimmed', async () => {
    const result = await login({ email: '  TEST@Example.COM ', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET });
    expect(result.user.email).toBe('test@example.com');
  });

  it('throws INVALID_CREDENTIALS for an unknown user and audits the failure', async () => {
    await expect(
      login({ email: 'ghost@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 400 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'login',
        status: 'failure',
        user: null,
        metadata: { reason: 'Invalid credentials' },
      }),
    ]);
  });

  it('throws EMAIL_NOT_VERIFIED for an unverified account and audits the failure', async () => {
    await deps.users.create({
      username: 'unverified',
      email: 'unverified@example.com',
      password: await bcrypt.hash(password, 10),
      isVerified: false,
    });

    await expect(
      login({ email: 'unverified@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED', statusCode: 401 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'login',
        status: 'failure',
        metadata: { reason: 'Email not verified' },
      }),
    ]);
  });

  it('throws INVALID_LOGIN_METHOD for a non-local account and audits the failure', async () => {
    await deps.users.create({
      username: 'googleuser',
      email: 'google@example.com',
      password: await bcrypt.hash(password, 10),
      isVerified: true,
      provider: 'google',
      googleId: 'google123',
    });

    await expect(
      login({ email: 'google@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'INVALID_LOGIN_METHOD', statusCode: 400 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'login',
        status: 'failure',
        metadata: { reason: 'Account uses google login', provider: 'google' },
      }),
    ]);
  });

  it('increments loginAttempts on a wrong password and audits the failure', async () => {
    await expect(
      login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

    expect(deps.users.users.find((u) => u.id === userId)!.loginAttempts).toBe(1);
    expect(deps.tokens.tokens).toHaveLength(0);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'login',
        status: 'failure',
        metadata: { reason: 'Invalid credentials', loginAttempts: 1 },
      }),
    ]);
  });

  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(user.loginAttempts).toBe(5);
    expect(user.lockoutUntil).not.toBeNull();
    expect(user.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws ACCOUNT_LOCKED for a locked account and audits the failure', async () => {
    for (let i = 0; i < 5; i++) {
      await login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }).catch(() => {});
    }

    await expect(
      login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_LOCKED', statusCode: 401 });

    expect(deps.audit.logs.at(-1)).toEqual(
      expect.objectContaining({
        action: 'login',
        status: 'failure',
        metadata: { reason: 'Account locked' },
      }),
    );
  });

  it('allows login after the lock duration expires', async () => {
    for (let i = 0; i < 5; i++) {
      await login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }).catch(() => {});
    }
    const user = deps.users.users.find((u) => u.id === userId)!;
    user.lockoutUntil = new Date(Date.now() - 1000);

    const result = await login({ email: 'test@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET });
    expect(result.user.id).toBe(userId);
  });

  it('resets loginAttempts and lockout on a successful login', async () => {
    await login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }).catch(() => {});
    await login({ email: 'test@example.com', password: 'WrongPass1' }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }).catch(() => {});

    await login(
      { email: 'test@example.com', password },
      loginDeps(),
      { jwtSecret: TEST_JWT_SECRET },
      { ip: '127.0.0.1' },
    );

    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(user.loginAttempts).toBe(0);
    expect(user.lockoutUntil).toBeNull();
    expect(user.lastLogin).toBeInstanceOf(Date);
    expect(user.lastIp).toBe('127.0.0.1');
  });

  it('audits a successful login', async () => {
    await login({ email: 'test@example.com', password }, { ...loginDeps(), auditDatabase: deps.audit }, { jwtSecret: TEST_JWT_SECRET });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'login', status: 'success' }),
    ]);
  });

  it('throws REFRESH_TOKEN_CREATION_FAILED when the token cannot be created', async () => {
    deps.tokens.createFails = true;

    await expect(
      login({ email: 'test@example.com', password }, loginDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_CREATION_FAILED', statusCode: 500 });
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
describe('logout', () => {
  it('deletes the presented refresh token and audits the success', async () => {
    const deps = makeDeps();
    const rawToken = crypto.randomBytes(40).toString('hex');
    await deps.tokens.create({
      token: hashToken(rawToken),
      user: 'user-1',
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      consumed: false,
    });

    await logout(
      { rawToken, userId: 'user-1', ip: '127.0.0.1', userAgent: 'test-agent' },
      { refreshTokenDatabase: deps.tokens, auditDatabase: deps.audit },
    );

    expect(deps.tokens.tokens).toHaveLength(0);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: 'user-1', action: 'logout', status: 'success' }),
    ]);
  });

  it('throws MISSING_TOKEN when no token is present', async () => {
    const deps = makeDeps();

    await expect(
      logout({ rawToken: '', userId: 'user-1' }, { refreshTokenDatabase: deps.tokens }),
    ).rejects.toMatchObject({ code: 'MISSING_TOKEN' });

    expect(deps.tokens.tokens).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------
describe('refresh', () => {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const family = crypto.randomUUID();
  let deps = makeDeps();
  let userId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const user = await deps.users.create({
      username: 'refreshuser',
      email: 'refresh@example.com',
      password: 'hashed-password',
      isVerified: true,
    });
    userId = user.id;
  });

  const refreshDeps = () => ({
    refreshTokenDatabase: deps.tokens,
    userDatabase: deps.users,
    auditDatabase: deps.audit,
  });

  const seedToken = async (overrides: Partial<{ expiresAt: Date; consumed: boolean }> = {}) => {
    await deps.tokens.create({
      token: hashToken(rawToken),
      user: userId,
      family,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
      consumed: overrides.consumed ?? false,
    });
  };

  it('throws MISSING_TOKEN and audits the failure when no token is given', async () => {
    await expect(
      refresh({ rawToken: '' }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'MISSING_TOKEN' });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'token_refresh',
        status: 'failure',
        metadata: { reason: 'Refresh token not found' },
      }),
    ]);
  });

  it('throws REFRESH_TOKEN_NOT_FOUND for an unknown token and audits the failure', async () => {
    await expect(
      refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_NOT_FOUND', statusCode: 401 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'token_refresh',
        status: 'failure',
        metadata: { reason: 'Invalid or already consumed refresh token' },
      }),
    ]);
  });

  it('rotates the refresh token: consumes the old one and issues a successor in the same family', async () => {
    await seedToken();

    const result = await refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET });

    expect(result.refreshToken).not.toBe(rawToken);
    const active = deps.tokens.tokens.filter((t) => !t.consumed);
    expect(active).toHaveLength(1);
    expect(active[0].token).toBe(hashToken(result.refreshToken));
    expect(active[0].family).toBe(family);
    expect(active[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(deps.tokens.tokens.find((t) => t.token === hashToken(rawToken))!.consumed).toBe(true);

    const decoded = JSON.parse(Buffer.from(result.accessToken.split('.')[1], 'base64').toString());
    expect(decoded).toMatchObject({ id: userId, tokenType: 'access' });
  });

  it('audits a successful refresh', async () => {
    await seedToken();

    await refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'token_refresh', status: 'success' }),
    ]);
  });

  it('detects reuse of a consumed token and revokes the whole family', async () => {
    await seedToken();
    await refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET });
    expect(deps.tokens.tokens).toHaveLength(2); // consumed predecessor + successor

    await expect(
      refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSE_DETECTED', statusCode: 401 });

    expect(deps.tokens.tokens).toHaveLength(0);
    expect(deps.audit.logs.at(-1)).toEqual(
      expect.objectContaining({
        user: userId,
        action: 'token_refresh',
        status: 'failure',
        metadata: { reason: 'Refresh token reuse detected' },
      }),
    );
  });

  it('throws REFRESH_TOKEN_EXPIRED and audits the failure', async () => {
    await seedToken({ expiresAt: new Date(Date.now() - 1000) });

    await expect(
      refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED', statusCode: 401 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'token_refresh',
        status: 'failure',
        metadata: { reason: 'Refresh token expired' },
      }),
    ]);
  });

  it('throws UNEXPECTED_ERROR_OCCURED and audits the failure when the user is gone', async () => {
    await seedToken();
    await deps.users.delete(userId);

    await expect(
      refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET }),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_ERROR_OCCURED' });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'token_refresh',
        status: 'failure',
        user: null,
        metadata: { reason: 'User not found' },
      }),
    ]);
  });

  it('detects a concurrent replay that removed the family after the successor was issued', async () => {
    await seedToken();

    const originalFindOne = deps.tokens.findOne.bind(deps.tokens);
    const findOneSpy = vi
      .spyOn(deps.tokens, 'findOne')
      .mockImplementation(async (filter) => {
        const found = await originalFindOne(filter);
        // Simulate a concurrent replay deleting the family between the
        // successor being issued and the predecessor re-check.
        if (found) {
          const index = deps.tokens.tokens.findIndex((t) => t.token === found.token);
          if (index !== -1) deps.tokens.tokens.splice(index, 1);
          return null;
        }
        return found;
      });

    try {
      await expect(
        refresh({ rawToken }, refreshDeps(), { jwtSecret: TEST_JWT_SECRET }),
      ).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSE_DETECTED' });

      // The successor issued into the revoked family must be gone as well.
      expect(deps.tokens.tokens).toHaveLength(0);
    } finally {
      findOneSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------
describe('verifyEmail', () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  let deps = makeDeps();

  beforeEach(() => {
    deps = makeDeps();
  });

  const seed = async (expiresAt: Date) => {
    await deps.users.create({
      username: 'verifyuser',
      email: 'verify@example.com',
      password: 'hashed-password',
      verificationToken: hashedToken,
      verificationTokenExpires: expiresAt,
    });
  };

  it('verifies the email with a valid non-expired token and audits the success', async () => {
    await seed(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const result = await verifyEmail(rawToken, { userDatabase: deps.users, auditDatabase: deps.audit }, { ip: '127.0.0.1' });

    expect(result.isVerified).toBe(true);
    const user = deps.users.users[0];
    expect(user.isVerified).toBe(true);
    expect(user.verificationToken).toBeNull();
    expect(user.verificationTokenExpires).toBeNull();

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: user.id, action: 'email_verification', status: 'success' }),
    ]);
  });

  it('throws INVALID_TOKEN and audits the failure for an unknown token', async () => {
    await expect(
      verifyEmail('nonexistent-token', { userDatabase: deps.users, auditDatabase: deps.audit }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN', statusCode: 400 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'email_verification',
        status: 'failure',
        metadata: { reason: 'Invalid or expired token' },
      }),
    ]);
  });

  it('throws INVALID_TOKEN and audits the failure for an expired token', async () => {
    await seed(new Date(Date.now() - 60 * 1000));

    await expect(
      verifyEmail(rawToken, { userDatabase: deps.users, auditDatabase: deps.audit }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    expect(deps.users.users[0].isVerified).toBe(false);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ action: 'email_verification', status: 'failure' }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// forgotPassword
// ---------------------------------------------------------------------------
describe('forgotPassword', () => {
  let deps = makeDeps();
  let userId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const user = await deps.users.create({
      username: 'existinguser',
      email: 'existing@example.com',
      password: await bcrypt.hash('OldPass123', 10),
      isVerified: true,
    });
    userId = user.id;
  });

  const forgotDeps = () => ({
    userDatabase: deps.users,
    email: deps.email,
    auditDatabase: deps.audit,
  });

  it('stores a reset token, emails the raw token, and audits the success', async () => {
    const result = await forgotPassword({ email: 'existing@example.com' }, forgotDeps(), { ip: '127.0.0.1' });

    expect(result.message).toBe('If an account exists, a password reset link has been sent.');

    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(user.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
    expect(user.resetPasswordExpires).not.toBeNull();

    expect(deps.email.passwordResets).toHaveLength(1);
    expect(deps.email.passwordResets[0].to).toBe('existing@example.com');
    expect(hashToken(deps.email.passwordResets[0].rawToken)).toBe(user.resetPasswordToken);

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'password_reset_request', status: 'success' }),
    ]);
  });

  it('audits the failure for an unknown email', async () => {
    await expect(
      forgotPassword({ email: 'ghost@example.com' }, forgotDeps(), {}),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'password_reset_request',
        status: 'failure',
        user: null,
        metadata: { reason: 'User not found', email: 'ghost@example.com' },
      }),
    ]);
  });

  it('audits the failure for a social login account', async () => {
    await deps.users.create({
      username: 'googleuser',
      email: 'google@example.com',
      password: 'hashed-password',
      isVerified: true,
      provider: 'google',
      googleId: 'google123',
    });

    await expect(
      forgotPassword({ email: 'google@example.com' }, forgotDeps(), {}),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_ERROR_OCCURED' });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: expect.any(String),
        action: 'password_reset_request',
        status: 'failure',
        metadata: { reason: 'Social login account', provider: 'google' },
      }),
    ]);
  });

  it('rolls back the reset token and throws EMAIL_SEND_FAILED when the email fails', async () => {
    deps.email.passwordResetFails = true;

    await expect(
      forgotPassword({ email: 'existing@example.com' }, forgotDeps(), {}),
    ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED', statusCode: 500 });

    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(user.resetPasswordToken).toBeNull();
    expect(user.resetPasswordExpires).toBeNull();
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'password_reset_request',
        status: 'failure',
        metadata: { reason: 'Failed to send password reset email' },
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------
describe('resetPassword', () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const newPassword = 'NewPass123';
  let deps = makeDeps();
  let userId: string;

  beforeEach(async () => {
    deps = makeDeps();
    const user = await deps.users.create({
      username: 'resetuser',
      email: 'reset@example.com',
      password: await bcrypt.hash('OldPass123', 10),
      isVerified: true,
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + 3600_000),
      loginAttempts: 3,
      lockoutUntil: new Date(Date.now() + 60_000),
    });
    userId = user.id;
  });

  const resetDeps = () => ({
    userDatabase: deps.users,
    refreshTokenDatabase: deps.tokens,
    auditDatabase: deps.audit,
  });

  it('resets the password with a valid non-expired token and audits the success', async () => {
    const result = await resetPassword({ token: rawToken, newPassword }, resetDeps(), { ip: '127.0.0.1' });

    expect(result.message).toBe('Password Updated.');

    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(await bcrypt.compare(newPassword, user.password)).toBe(true);
    expect(user.resetPasswordToken).toBeNull();
    expect(user.resetPasswordExpires).toBeNull();
    expect(user.loginAttempts).toBe(0);
    expect(user.lockoutUntil).toBeNull();

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'password_reset', status: 'success' }),
    ]);
  });

  it('revokes all refresh tokens for the user', async () => {
    await deps.tokens.create({
      token: hashToken('some-raw-token'),
      user: userId,
      family: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      consumed: false,
    });

    await resetPassword({ token: rawToken, newPassword }, resetDeps(), {});

    expect(deps.tokens.tokens).toHaveLength(0);
  });

  it('throws INVALID_TOKEN and audits the failure for an invalid token', async () => {
    await expect(
      resetPassword({ token: 'invalid-token', newPassword }, resetDeps(), {}),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN', statusCode: 400 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        action: 'password_reset',
        status: 'failure',
        metadata: { reason: 'Invalid or expired token' },
      }),
    ]);
  });

  it('throws INVALID_TOKEN for an expired token', async () => {
    const user = deps.users.users.find((u) => u.id === userId)!;
    user.resetPasswordExpires = new Date(Date.now() - 60_000);

    await expect(
      resetPassword({ token: rawToken, newPassword }, resetDeps(), {}),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });

    expect(await bcrypt.compare('OldPass123', user.password)).toBe(true);
  });
});
