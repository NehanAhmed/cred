import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount,
} from './profile.service.js';
import { makeDeps } from '../__tests__/fakes.js';

const CURRENT_PASSWORD = 'CurrentPass1';
let deps = makeDeps();
let userId: string;

beforeEach(async () => {
  deps = makeDeps();
  const user = await deps.users.create({
    username: 'profileuser',
    email: 'profile@example.com',
    password: await bcrypt.hash(CURRENT_PASSWORD, 10),
    bio: 'Original bio',
    phoneNumber: '1234567890',
    gender: 'male',
    isVerified: true,
  });
  userId = user.id;
});

// ---------------------------------------------------------------------------
// getProfile
// ---------------------------------------------------------------------------
describe('getProfile', () => {
  it('returns the user without the password', async () => {
    const result = await getProfile({ userId }, { userDatabase: deps.users });

    expect(result).toMatchObject({ id: userId, username: 'profileuser', email: 'profile@example.com' });
    expect('password' in result).toBe(false);
  });

  it('throws USER_NOT_FOUND when the user no longer exists', async () => {
    await deps.users.delete(userId);

    await expect(getProfile({ userId }, { userDatabase: deps.users })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------
describe('updateProfile', () => {
  it('updates all provided fields and audits the success', async () => {
    const result = await updateProfile(
      { username: 'updateduser', bio: 'Updated bio text', phoneNumber: '0987654321', gender: 'female' },
      { userId, ip: '127.0.0.1', userAgent: 'test-agent' },
      { userDatabase: deps.users, auditDatabase: deps.audit },
    );

    expect(result).toMatchObject({
      username: 'updateduser',
      bio: 'Updated bio text',
      phoneNumber: '0987654321',
      gender: 'female',
    });
    expect('password' in result).toBe(false);

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'profile_update', status: 'success' }),
    ]);
  });

  it('partially updates a single field and leaves the others untouched', async () => {
    const result = await updateProfile(
      { username: 'newname' },
      { userId },
      { userDatabase: deps.users },
    );

    expect(result.username).toBe('newname');
    expect(result.bio).toBe('Original bio');
    expect(result.gender).toBe('male');
  });

  it('throws USER_NOT_FOUND and audits the failure when the user is gone', async () => {
    await deps.users.delete(userId);

    await expect(
      updateProfile({ username: 'test' }, { userId, ip: '127.0.0.1' }, { userDatabase: deps.users, auditDatabase: deps.audit }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'profile_update',
        status: 'failure',
        metadata: { reason: 'User not found' },
      }),
    ]);
  });

  it('maps a duplicate-key database error to a field-specific AuthError and audits it', async () => {
    const duplicateError = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { username: 1 },
    });
    const updateSpy = vi.spyOn(deps.users, 'update').mockRejectedValue(duplicateError);

    try {
      await expect(
        updateProfile({ username: 'taken' }, { userId }, { userDatabase: deps.users, auditDatabase: deps.audit }),
      ).rejects.toMatchObject({
        code: 'DUPLICATE_KEY',
        statusCode: 400,
        message: 'username is already taken',
      });

      expect(deps.audit.logs).toEqual([
        expect.objectContaining({
          user: userId,
          action: 'profile_update',
          status: 'failure',
          metadata: { reason: 'username is already taken' },
        }),
      ]);
    } finally {
      updateSpy.mockRestore();
    }
  });

  it('rethrows unknown database errors without auditing', async () => {
    const updateSpy = vi.spyOn(deps.users, 'update').mockRejectedValue(new Error('boom'));

    try {
      await expect(
        updateProfile({ username: 'test' }, { userId }, { userDatabase: deps.users, auditDatabase: deps.audit }),
      ).rejects.toThrow('boom');

      expect(deps.audit.logs).toHaveLength(0);
    } finally {
      updateSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// updatePassword
// ---------------------------------------------------------------------------
describe('updatePassword', () => {
  const newPassword = 'NewPassword1';
  const passwordDeps = () => ({
    userDatabase: deps.users,
    refreshTokenDatabase: deps.tokens,
    auditDatabase: deps.audit,
  });

  it('changes the password, revokes refresh tokens, and audits the success', async () => {
    await deps.tokens.create({
      token: 'stored-hash',
      user: userId,
      family: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      consumed: false,
    });

    const result = await updatePassword(
      { currentPassword: CURRENT_PASSWORD, newPassword },
      { userId, ip: '127.0.0.1', userAgent: 'test-agent' },
      passwordDeps(),
    );

    expect('password' in result).toBe(false);
    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(await bcrypt.compare(newPassword, user.password)).toBe(true);
    expect(user.loginAttempts).toBe(0);
    expect(user.lockoutUntil).toBeNull();
    expect(deps.tokens.tokens).toHaveLength(0);

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'password_change', status: 'success' }),
    ]);
  });

  it('throws INVALID_CURRENT_PASSWORD and audits the failure for a wrong current password', async () => {
    await expect(
      updatePassword(
        { currentPassword: 'WrongPass1', newPassword },
        { userId, ip: '127.0.0.1' },
        passwordDeps(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD', statusCode: 400 });

    const user = deps.users.users.find((u) => u.id === userId)!;
    expect(await bcrypt.compare(CURRENT_PASSWORD, user.password)).toBe(true);

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'password_change',
        status: 'failure',
        metadata: { reason: 'Incorrect current password' },
      }),
    ]);
  });

  it('throws SOCIAL_LOGIN_ACCOUNT and audits the failure for a social account', async () => {
    const user = deps.users.users.find((u) => u.id === userId)!;
    user.provider = 'google';
    user.googleId = 'google-1';

    await expect(
      updatePassword(
        { currentPassword: CURRENT_PASSWORD, newPassword },
        { userId, ip: '127.0.0.1' },
        passwordDeps(),
      ),
    ).rejects.toMatchObject({ code: 'SOCIAL_LOGIN_ACCOUNT', statusCode: 400 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'password_change',
        status: 'failure',
        metadata: { reason: 'Social login account', provider: 'google' },
      }),
    ]);
  });

  it('throws USER_NOT_FOUND and audits the failure when the user is gone', async () => {
    await deps.users.delete(userId);

    await expect(
      updatePassword(
        { currentPassword: CURRENT_PASSWORD, newPassword },
        { userId, ip: '127.0.0.1' },
        passwordDeps(),
      ),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });

    expect(deps.audit.logs).toEqual([
      expect.objectContaining({
        user: userId,
        action: 'password_change',
        status: 'failure',
        metadata: { reason: 'User not found' },
      }),
    ]);
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------
describe('deleteAccount', () => {
  it('revokes refresh tokens, deletes the user, and audits the success', async () => {
    await deps.tokens.create({
      token: 'stored-hash',
      user: userId,
      family: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      consumed: false,
    });

    await deleteAccount(
      { userId, ip: '127.0.0.1', userAgent: 'test-agent' },
      { userDatabase: deps.users, refreshTokenDatabase: deps.tokens, auditDatabase: deps.audit },
    );

    expect(deps.users.users).toHaveLength(0);
    expect(deps.tokens.tokens).toHaveLength(0);
    expect(deps.audit.logs).toEqual([
      expect.objectContaining({ user: userId, action: 'account_deletion', status: 'success' }),
    ]);
  });

  it('throws USER_NOT_FOUND without auditing when the user is gone', async () => {
    await deps.users.delete(userId);

    await expect(
      deleteAccount(
        { userId },
        { userDatabase: deps.users, refreshTokenDatabase: deps.tokens, auditDatabase: deps.audit },
      ),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });

    expect(deps.audit.logs).toHaveLength(0);
  });
});
