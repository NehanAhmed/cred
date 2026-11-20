import type { CreateUserInput } from '@cred-kit/core';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDatabase, type TestDatabase } from './__tests__/helpers/mongo.js';
import { mongooseStorage, type MongooseStorageOptions } from './index.js';

const userInput = (overrides: Partial<CreateUserInput> = {}): CreateUserInput => ({
  username: 'alice',
  email: 'alice@example.com',
  password: 'hashed-password',
  ...overrides
});

const refreshTokenInput = (userId: string, overrides: Record<string, unknown> = {}) => ({
  lookupId: 'lookup-1',
  token: 'hashed-refresh-token',
  user: userId,
  family: 'family-1',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  consumed: false,
  ...overrides
});

describe('mongooseStorage', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 120_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  const rawDatabase = () => {
    const raw = database.connection.db;
    if (!raw) {
      throw new Error('Test database connection is not ready');
    }
    return raw;
  };

  describe('options', () => {
    it('requires either a uri or an existing connection', () => {
      expect(() => mongooseStorage({} as MongooseStorageOptions)).toThrow(
        'mongooseStorage: "uri" or "connection" is required'
      );
      expect(() => mongooseStorage({ uri: '' })).toThrow(
        'mongooseStorage: "uri" or "connection" is required'
      );
      expect(() => mongooseStorage({ uri: 123 as unknown as string })).toThrow(
        'mongooseStorage: "uri" or "connection" is required'
      );
    });

    it('returns the complete storage surface', () => {
      const storage = mongooseStorage({ connection: database.connection });

      expect(storage.user.findOne).toBeTypeOf('function');
      expect(storage.user.create).toBeTypeOf('function');
      expect(storage.user.delete).toBeTypeOf('function');
      expect(storage.user.update).toBeTypeOf('function');
      expect(storage.user.findOneByTwoConditions).toBeTypeOf('function');
      expect(storage.user.incrementLoginAttempts).toBeTypeOf('function');
      expect(storage.user.findOneAndUpdate).toBeTypeOf('function');

      expect(storage.refreshToken.findOne).toBeTypeOf('function');
      expect(storage.refreshToken.create).toBeTypeOf('function');
      expect(storage.refreshToken.delete).toBeTypeOf('function');
      expect(storage.refreshToken.update).toBeTypeOf('function');
      expect(storage.refreshToken.findOneAndUpdate).toBeTypeOf('function');
      expect(storage.refreshToken.deleteMany).toBeTypeOf('function');

      expect(storage.auditLogs.create).toBeTypeOf('function');
      expect(storage.auditLogs.find).toBeTypeOf('function');
      expect(storage.auditLogs.count).toBeTypeOf('function');

      expect(storage.ready).toBeTypeOf('function');
      expect(storage.close).toBeTypeOf('function');
    });
  });

  describe('with a supplied connection', () => {
    it('waits for the existing connection without replacing it', async () => {
      const storage = mongooseStorage({ connection: database.connection });

      await expect(storage.ready()).resolves.toBeUndefined();
      expect(database.connection.readyState).toBe(1);
    });

    it('does not close a connection it does not own', async () => {
      const storage = mongooseStorage({ connection: database.connection });
      const closeSpy = vi.spyOn(database.connection, 'close');

      await storage.close();

      expect(closeSpy).not.toHaveBeenCalled();
      expect(database.connection.readyState).toBe(1);
      await expect(storage.user.findOne({ email: 'nobody@example.com' })).resolves.toBeNull();
    });

    it('binds every adapter to its own collection', async () => {
      const storage = mongooseStorage({ connection: database.connection });
      const raw = rawDatabase();

      const user = await storage.user.create(userInput());
      expect(await raw.collection('User').countDocuments()).toBe(1);
      expect(await raw.collection('RefreshToken').countDocuments()).toBe(0);
      expect(await raw.collection('AuditLog').countDocuments()).toBe(0);

      await storage.refreshToken.create(refreshTokenInput(user.id));
      expect(await raw.collection('User').countDocuments()).toBe(1);
      expect(await raw.collection('RefreshToken').countDocuments()).toBe(1);
      expect(await raw.collection('AuditLog').countDocuments()).toBe(0);

      await storage.auditLogs.create({
        user: user.id,
        action: 'login',
        status: 'success'
      });
      expect(await raw.collection('User').countDocuments()).toBe(1);
      expect(await raw.collection('RefreshToken').countDocuments()).toBe(1);
      expect(await raw.collection('AuditLog').countDocuments()).toBe(1);
    });

    it('round-trips user, refresh-token and audit data through the adapters', async () => {
      const storage = mongooseStorage({ connection: database.connection });

      const user = await storage.user.create(
        userInput({ verificationTokenLookup: 'verification-lookup' })
      );
      await expect(
        storage.user.findOne({ verificationTokenLookup: 'verification-lookup' })
      ).resolves.toMatchObject({ id: user.id });

      await storage.refreshToken.create(refreshTokenInput(user.id));
      await expect(storage.refreshToken.findOne({ lookupId: 'lookup-1' })).resolves.toMatchObject({
        user: user.id,
        consumed: false
      });

      const claimed = await storage.refreshToken.findOneAndUpdate(
        { lookupId: 'lookup-1', consumed: false },
        { consumed: true }
      );
      expect(claimed).toMatchObject({ consumed: true });

      await storage.auditLogs.create({
        user: user.id,
        action: 'token_refresh',
        status: 'success'
      });
      await expect(storage.auditLogs.count({ user: user.id })).resolves.toBe(1);
    });
  });

  describe('with a uri', () => {
    it('creates, waits for and closes its own connection', async () => {
      const ownedConnection = mongoose.createConnection(database.uri);
      const closeSpy = vi.spyOn(ownedConnection, 'close');
      const createSpy = vi
        .spyOn(mongoose, 'createConnection')
        .mockReturnValue(ownedConnection as never);

      const storage = mongooseStorage({ uri: database.uri });

      await expect(storage.ready()).resolves.toBeUndefined();
      expect(ownedConnection.readyState).toBe(1);

      await storage.close();

      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(ownedConnection.readyState).toBe(0);

      createSpy.mockRestore();
    });

    it('persists data across storage instances', async () => {
      const first = mongooseStorage({ uri: database.uri });
      await first.ready();
      const created = await first.user.create(userInput());
      await first.close();

      const second = mongooseStorage({ uri: database.uri });
      await second.ready();
      await expect(second.user.findOne({ email: 'alice@example.com' })).resolves.toMatchObject({
        id: created.id
      });
      await second.close();
    });
  });
});
