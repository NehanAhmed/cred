import type { Model } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  hasSchemaIndex,
  startTestDatabase,
  type TestDatabase
} from '../__tests__/helpers/mongo.js';
import { getAuditModel } from './audit-log.model.js';
import { AUDIT_ACTIONS } from '../types/audit.types.js';
import { getUserModel } from './user.model.js';

const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;

describe('getAuditModel', () => {
  let database: TestDatabase;
  let User: Model<any>;
  let AuditLog: Model<any>;

  beforeAll(async () => {
    database = await startTestDatabase();
    User = getUserModel(database.connection);
    AuditLog = getAuditModel(database.connection);
    await AuditLog.init();
  }, 120_000);

  afterEach(async () => {
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  it('registers an audit-log model distinct from the user model', () => {
    expect(AuditLog).not.toBe(User);
    expect(AuditLog.modelName).not.toBe(User.modelName);
    expect(AuditLog.collection.name).toBe('AuditLog');
  });

  it('reuses the registered model instead of compiling it twice', () => {
    expect(getAuditModel(database.connection)).toBe(AuditLog);
  });

  it('honours an explicit model name and collection', () => {
    const CustomAuditLog = getAuditModel(
      database.connection,
      'CustomCredAuditLog',
      'CustomAuditLogCollection'
    );

    expect(CustomAuditLog).not.toBe(AuditLog);
    expect(CustomAuditLog.modelName).toBe('CustomCredAuditLog');
    expect(CustomAuditLog.collection.name).toBe('CustomAuditLogCollection');
  });

  it('applies null defaults for optional audit context and timestamps', async () => {
    const log = await AuditLog.create({ action: 'login', status: 'success' });

    expect(log.user).toBeNull();
    expect(log.ip).toBeNull();
    expect(log.userAgent).toBeNull();
    expect(log.provider).toBeNull();
    expect(log.metadata).toBeNull();
    expect(log.createdAt).toBeInstanceOf(Date);
    expect(log.updatedAt).toBeInstanceOf(Date);
  });

  it('requires an action and a status', async () => {
    await expect(AuditLog.create({ status: 'success' })).rejects.toMatchObject({
      name: 'ValidationError'
    });
    await expect(AuditLog.create({ action: 'login' })).rejects.toMatchObject({
      name: 'ValidationError'
    });
  });

  it('accepts every canonical audit action', async () => {
    for (const action of AUDIT_ACTIONS) {
      const log = await AuditLog.create({ action, status: 'success' });
      expect(log.action).toBe(action);
    }
  });

  it('rejects an unknown audit action', async () => {
    await expect(AuditLog.create({ action: 'unknown_action', status: 'success' })).rejects.toThrow(
      /action/
    );
  });

  it.each(['success', 'failure'])('accepts the status %s', async (status) => {
    await expect(AuditLog.create({ action: 'login', status })).resolves.toMatchObject({ status });
  });

  it('rejects an unknown status', async () => {
    await expect(AuditLog.create({ action: 'login', status: 'pending' })).rejects.toThrow(/status/);
  });

  it.each(['local', 'google', 'github', null])(
    'accepts the provider value %s',
    async (provider) => {
      const log = await AuditLog.create({
        action: 'oauth_login',
        status: 'success',
        provider
      });

      expect(log.provider).toBe(provider);
    }
  );

  it('rejects an unknown provider', async () => {
    await expect(
      AuditLog.create({ action: 'login', status: 'success', provider: 'facebook' })
    ).rejects.toThrow(/provider/);
  });

  it('round-trips structured metadata', async () => {
    const metadata = {
      reason: 'Account locked',
      attempts: 5,
      nested: { ip: '203.0.113.10', tags: ['auth', 'lockout'] }
    };

    const log = await AuditLog.create({
      action: 'login',
      status: 'failure',
      metadata
    });

    expect(log.metadata).toEqual(metadata);
  });

  it('references the registered user model so populate resolves', async () => {
    const user = await User.create({
      username: 'audit-owner',
      email: 'audit-owner@example.com',
      password: 'hashed-password'
    });
    const log = await AuditLog.create({
      user: user._id,
      action: 'login',
      status: 'success'
    });

    const populated = await AuditLog.findById(log._id).populate('user').lean();

    expect(populated?.user).toMatchObject({
      username: 'audit-owner',
      email: 'audit-owner@example.com'
    });
  });

  it('declares the per-user lookup and 90-day retention indexes', () => {
    expect(hasSchemaIndex(AuditLog, { user: 1, createdAt: -1 })).toBe(true);
    expect(
      hasSchemaIndex(AuditLog, { createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS_IN_SECONDS })
    ).toBe(true);
  });
});
