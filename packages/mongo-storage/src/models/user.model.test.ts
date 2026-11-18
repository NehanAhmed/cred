import type { Model } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  hasSchemaIndex,
  startTestDatabase,
  type TestDatabase
} from '../__tests__/helpers/mongo.js';
import { getUserModel } from './user.model.js';

describe('getUserModel', () => {
  let database: TestDatabase;
  let User: Model<any>;

  beforeAll(async () => {
    database = await startTestDatabase();
    User = getUserModel(database.connection);
    await User.init();
  }, 120_000);

  afterEach(async () => {
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  it('registers the user model under its default name and collection', () => {
    expect(User.modelName).toBe('CredUser');
    expect(User.collection.name).toBe('User');
  });

  it('reuses the registered model instead of compiling it twice', () => {
    expect(getUserModel(database.connection)).toBe(User);
  });

  it('honours an explicit model name and collection', () => {
    const CustomUser = getUserModel(database.connection, 'CustomCredUser', 'CustomUserCollection');

    expect(CustomUser).not.toBe(User);
    expect(CustomUser.modelName).toBe('CustomCredUser');
    expect(CustomUser.collection.name).toBe('CustomUserCollection');
  });

  it('applies the documented defaults for a local account', async () => {
    const user = await User.create({
      username: 'alice',
      email: 'alice@example.com',
      password: 'hashed-password'
    });

    expect(user.provider).toBe('local');
    expect(user.isVerified).toBe(false);
    expect(user.gender).toBeNull();
    expect(user.avatar).toBeNull();
    expect(user.verificationToken).toBeNull();
    expect(user.verificationTokenExpires).toBeNull();
    expect(user.verificationTokenLookup).toBeNull();
    expect(user.resetPasswordToken).toBeNull();
    expect(user.resetPasswordExpires).toBeNull();
    expect(user.resetPasswordTokenLookup).toBeNull();
    expect(user.loginAttempts).toBe(0);
    expect(user.lockoutUntil).toBeNull();
    expect(user.lastLogin).toBeNull();
    expect(user.lastIp).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('requires a username and an email at the schema level', async () => {
    await expect(
      User.create({ email: 'missing-username@example.com', password: 'hashed' })
    ).rejects.toMatchObject({ name: 'ValidationError' });

    await expect(
      User.create({ username: 'missing-email', password: 'hashed' })
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('requires a password for local accounts', async () => {
    await expect(
      User.create({ username: 'no-password', email: 'no-password@example.com' })
    ).rejects.toThrow('Password is required for local accounts');
  });

  it('allows a social account without a password', async () => {
    const user = await User.create({
      username: 'oauth-user',
      email: 'oauth@example.com',
      provider: 'google',
      googleId: 'google-1',
      isVerified: true
    });

    expect(user.provider).toBe('google');
    expect(user.password).toBeUndefined();
    expect(user.isVerified).toBe(true);
  });

  it.each(['male', 'female', 'other', null])('accepts the gender value %s', async (gender) => {
    const user = await User.create({
      username: `gender-${String(gender)}`,
      email: `gender-${String(gender)}@example.com`,
      password: 'hashed-password',
      gender
    });

    expect(user.gender).toBe(gender);
  });

  it('rejects an unsupported gender', async () => {
    await expect(
      User.create({
        username: 'invalid-gender',
        email: 'invalid-gender@example.com',
        password: 'hashed-password',
        gender: 'unknown'
      })
    ).rejects.toThrow(/gender/);
  });

  it.each(['local', 'google', 'github'])('accepts the provider %s', async (provider) => {
    await expect(
      User.create({
        username: `provider-${provider}`,
        email: `provider-${provider}@example.com`,
        password: provider === 'local' ? 'hashed-password' : undefined,
        provider
      })
    ).resolves.toMatchObject({ provider });
  });

  it('rejects an unsupported provider', async () => {
    await expect(
      User.create({
        username: 'invalid-provider',
        email: 'invalid-provider@example.com',
        password: 'hashed-password',
        provider: 'facebook'
      })
    ).rejects.toThrow(/provider/);
  });

  it('enforces unique usernames and emails', async () => {
    await User.create({
      username: 'unique-user',
      email: 'unique@example.com',
      password: 'hashed-password'
    });

    await expect(
      User.create({
        username: 'unique-user',
        email: 'another@example.com',
        password: 'hashed-password'
      })
    ).rejects.toThrow(/duplicate key/i);

    await expect(
      User.create({
        username: 'another-user',
        email: 'unique@example.com',
        password: 'hashed-password'
      })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('allows many accounts without an OAuth id but rejects duplicate OAuth ids', async () => {
    await User.create({
      username: 'local-one',
      email: 'local-one@example.com',
      password: 'hashed-password'
    });
    await User.create({
      username: 'local-two',
      email: 'local-two@example.com',
      password: 'hashed-password'
    });

    await User.create({
      username: 'google-one',
      email: 'google-one@example.com',
      provider: 'google',
      googleId: 'google-id-1',
      isVerified: true
    });

    await expect(
      User.create({
        username: 'google-two',
        email: 'google-two@example.com',
        provider: 'github',
        googleId: 'google-id-1',
        isVerified: true
      })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('declares the token lookup fields required by the core contract', () => {
    expect(User.schema.path('verificationTokenLookup')).toBeDefined();
    expect(User.schema.path('resetPasswordTokenLookup')).toBeDefined();
  });

  it('enforces unique token lookup values while allowing many unset values', async () => {
    const base = { password: 'hashed-password', isVerified: true };

    await User.create({
      ...base,
      username: 'lookup-one',
      email: 'lookup-one@example.com',
      verificationTokenLookup: 'verification-lookup',
      resetPasswordTokenLookup: 'reset-lookup'
    });

    // A null lookup never participates in the unique index, so accounts
    // without a pending token can coexist.
    await User.create({ ...base, username: 'lookup-two', email: 'lookup-two@example.com' });
    await User.create({ ...base, username: 'lookup-three', email: 'lookup-three@example.com' });

    await expect(
      User.create({
        ...base,
        username: 'lookup-four',
        email: 'lookup-four@example.com',
        verificationTokenLookup: 'verification-lookup'
      })
    ).rejects.toThrow(/duplicate key/i);

    await expect(
      User.create({
        ...base,
        username: 'lookup-five',
        email: 'lookup-five@example.com',
        resetPasswordTokenLookup: 'reset-lookup'
      })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('declares the indexes required for lookups and OAuth uniqueness', () => {
    expect(hasSchemaIndex(User, { username: 1 }, { unique: true })).toBe(true);
    expect(hasSchemaIndex(User, { email: 1 }, { unique: true })).toBe(true);
    expect(
      hasSchemaIndex(User, {
        verificationToken: 1,
        verificationTokenExpires: 1
      })
    ).toBe(true);
    expect(
      hasSchemaIndex(User, {
        resetPasswordToken: 1,
        resetPasswordExpires: 1
      })
    ).toBe(true);
    expect(
      hasSchemaIndex(
        User,
        { verificationTokenLookup: 1 },
        {
          unique: true,
          partialFilterExpression: { verificationTokenLookup: { $type: 'string' } }
        }
      )
    ).toBe(true);
    expect(
      hasSchemaIndex(
        User,
        { resetPasswordTokenLookup: 1 },
        {
          unique: true,
          partialFilterExpression: { resetPasswordTokenLookup: { $type: 'string' } }
        }
      )
    ).toBe(true);
    expect(hasSchemaIndex(User, { googleId: 1 }, { unique: true, sparse: true })).toBe(true);
    expect(hasSchemaIndex(User, { githubId: 1 }, { unique: true, sparse: true })).toBe(true);
  });
});
