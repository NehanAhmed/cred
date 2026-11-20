import type { AuditLogInterface } from '@cred/core';
import mongoose, { type Model } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../__tests__/helpers/mongo.js';
import { getAuditModel } from '../models/audit-log.model.js';
import { createAuditAdapter } from './auditLog.adapter.js';

const userOne = new mongoose.Types.ObjectId().toString();
const userTwo = new mongoose.Types.ObjectId().toString();

const auditInput = (overrides: Partial<AuditLogInterface> = {}): Partial<AuditLogInterface> => ({
  action: 'login',
  status: 'success',
  ...overrides
});

describe('createAuditAdapter', () => {
  let database: TestDatabase;
  let AuditLogModel: Model<any>;
  let adapter: ReturnType<typeof createAuditAdapter>;

  beforeAll(async () => {
    database = await startTestDatabase();
    AuditLogModel = getAuditModel(database.connection);
    await AuditLogModel.init();
    adapter = createAuditAdapter(AuditLogModel);
  }, 120_000);

  afterEach(async () => {
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  const insertLog = async (
    overrides: Record<string, unknown> = {}
  ): Promise<mongoose.Types.ObjectId> => {
    const _id = new mongoose.Types.ObjectId();
    const now = new Date();

    await AuditLogModel.collection.insertOne({
      _id,
      user: null,
      action: 'login',
      status: 'success',
      ip: null,
      userAgent: null,
      provider: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      ...overrides
    });

    return _id;
  };

  describe('create', () => {
    it('applies null defaults for optional context and returns timestamps', async () => {
      const created = await adapter.create(auditInput());

      expect(created).toMatchObject({
        user: null,
        action: 'login',
        status: 'success',
        ip: null,
        userAgent: null,
        provider: null,
        metadata: null
      });
      expect((created as AuditLogInterface & { createdAt?: Date }).createdAt).toBeInstanceOf(Date);
    });

    it('persists the full audit context and maps the user to a string', async () => {
      const metadata = { reason: 'Account locked', attempts: 5 };

      const created = await adapter.create(
        auditInput({
          user: userOne,
          action: 'login',
          status: 'failure',
          ip: '203.0.113.10',
          userAgent: 'Mozilla/5.0',
          provider: 'local',
          metadata
        })
      );

      expect(created).toMatchObject({
        user: userOne,
        action: 'login',
        status: 'failure',
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        provider: 'local',
        metadata
      });
    });

    it('round-trips nested metadata through MongoDB', async () => {
      const metadata = { nested: { attempts: [1, 2, 3], ok: true } };

      await adapter.create(auditInput({ metadata }));

      const [stored] = await adapter.find({}, { skip: 0, limit: 10 });

      expect(stored.metadata).toEqual(metadata);
    });

    it('rejects an unknown action', async () => {
      await expect(
        adapter.create(auditInput({ action: 'unknown_action' as never }))
      ).rejects.toThrow(/action/);
    });

    it('rejects an unknown status', async () => {
      await expect(adapter.create(auditInput({ status: 'pending' as never }))).rejects.toThrow(
        /status/
      );
    });

    it('requires an action and a status', async () => {
      await expect(adapter.create({})).rejects.toMatchObject({
        name: 'ValidationError'
      });
    });
  });

  describe('find', () => {
    it('returns an empty array when no log matches', async () => {
      await expect(adapter.find({}, { skip: 0, limit: 10 })).resolves.toEqual([]);
      await expect(adapter.find({ user: userOne }, { skip: 0, limit: 10 })).resolves.toEqual([]);
    });

    it('returns logs newest first', async () => {
      const now = Date.now();
      await insertLog({ createdAt: new Date(now - 2_000), action: 'register' });
      await insertLog({ createdAt: new Date(now - 1_000), action: 'login' });
      await insertLog({ createdAt: new Date(now), action: 'logout' });

      const logs = await adapter.find({}, { skip: 0, limit: 10 });

      expect(logs.map((log) => log.action)).toEqual(['logout', 'login', 'register']);
    });

    it('uses _id as a deterministic tie-breaker for identical timestamps', async () => {
      const createdAt = new Date();
      await insertLog({
        _id: new mongoose.Types.ObjectId('64b000000000000000000001'),
        action: 'login',
        createdAt
      });
      await insertLog({
        _id: new mongoose.Types.ObjectId('64b000000000000000000002'),
        action: 'logout',
        createdAt
      });

      const logs = await adapter.find({}, { skip: 0, limit: 10 });

      expect(logs.map((log) => log.action)).toEqual(['logout', 'login']);
    });

    it('filters by user and maps ObjectIds to strings', async () => {
      await insertLog({ user: new mongoose.Types.ObjectId(userOne) });
      await insertLog({ user: new mongoose.Types.ObjectId(userTwo) });
      await insertLog({ user: null, action: 'register' });

      const logs = await adapter.find({ user: userOne }, { skip: 0, limit: 10 });

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ user: userOne });
      expect(typeof logs[0].user).toBe('string');
    });

    it('filters system events with user null', async () => {
      await insertLog({ user: new mongoose.Types.ObjectId(userOne) });
      await insertLog({ user: null, action: 'register' });

      const logs = await adapter.find({ user: null }, { skip: 0, limit: 10 });

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ user: null, action: 'register' });
    });

    it('returns every log when the user filter is undefined', async () => {
      await insertLog({ user: new mongoose.Types.ObjectId(userOne) });
      await insertLog({ user: new mongoose.Types.ObjectId(userTwo) });

      await expect(adapter.find({ user: undefined }, { skip: 0, limit: 10 })).resolves.toHaveLength(
        2
      );
    });

    it('paginates with skip and limit', async () => {
      const now = Date.now();
      for (let index = 0; index < 5; index += 1) {
        await insertLog({
          action: index % 2 === 0 ? 'login' : 'logout',
          createdAt: new Date(now + index)
        });
      }

      const firstPage = await adapter.find({}, { skip: 0, limit: 2 });
      const secondPage = await adapter.find({}, { skip: 2, limit: 2 });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage.map((log) => log.action)).toEqual(['login', 'logout']);
      expect(secondPage.map((log) => log.action)).toEqual(['login', 'logout']);
    });

    it('never turns a zero limit into an unbounded query', async () => {
      await insertLog();
      await insertLog();

      await expect(adapter.find({}, { skip: 0, limit: 0 })).resolves.toHaveLength(1);
    });

    it('clamps negative limits to one document', async () => {
      await insertLog();
      await insertLog();

      await expect(adapter.find({}, { skip: 0, limit: -5 })).resolves.toHaveLength(1);
    });

    it('falls back to the default page size for non-finite limits', async () => {
      await AuditLogModel.collection.insertMany(
        Array.from({ length: 21 }, (_, index) => ({
          user: null,
          action: 'login',
          status: 'success',
          ip: null,
          userAgent: null,
          provider: null,
          metadata: null,
          createdAt: new Date(Date.now() + index),
          updatedAt: new Date()
        }))
      );

      await expect(adapter.find({}, { skip: 0, limit: Number.NaN })).resolves.toHaveLength(20);
      await expect(
        adapter.find({}, { skip: 0, limit: Number.POSITIVE_INFINITY })
      ).resolves.toHaveLength(20);
    });

    it('caps the page size at 1000 documents', async () => {
      await AuditLogModel.collection.insertMany(
        Array.from({ length: 1001 }, (_, index) => ({
          user: null,
          action: 'login',
          status: 'success',
          ip: null,
          userAgent: null,
          provider: null,
          metadata: null,
          createdAt: new Date(Date.now() + index),
          updatedAt: new Date()
        }))
      );

      await expect(adapter.find({}, { skip: 0, limit: 5000 })).resolves.toHaveLength(1000);
    });

    it('truncates fractional limits', async () => {
      await insertLog();
      await insertLog();
      await insertLog();

      await expect(adapter.find({}, { skip: 0, limit: 2.9 })).resolves.toHaveLength(2);
    });

    it('treats negative or non-finite skips as zero', async () => {
      await insertLog({ action: 'register' });

      await expect(adapter.find({}, { skip: -10, limit: 10 })).resolves.toHaveLength(1);
      await expect(adapter.find({}, { skip: Number.NaN, limit: 10 })).resolves.toHaveLength(1);
    });

    it('truncates a fractional skip', async () => {
      const now = Date.now();
      await insertLog({ action: 'register', createdAt: new Date(now - 1_000) });
      await insertLog({ action: 'login', createdAt: new Date(now) });

      const logs = await adapter.find({}, { skip: 1.9, limit: 10 });

      expect(logs.map((log) => log.action)).toEqual(['register']);
    });
  });

  describe('count', () => {
    it('returns zero for an empty collection', async () => {
      await expect(adapter.count({})).resolves.toBe(0);
      await expect(adapter.count({ user: userOne })).resolves.toBe(0);
    });

    it('counts every log when the filter is empty', async () => {
      await insertLog();
      await insertLog({ action: 'register' });
      await insertLog({ action: 'logout' });

      await expect(adapter.count({})).resolves.toBe(3);
    });

    it('counts logs for one user', async () => {
      await insertLog({ user: new mongoose.Types.ObjectId(userOne) });
      await insertLog({ user: new mongoose.Types.ObjectId(userOne) });
      await insertLog({ user: new mongoose.Types.ObjectId(userTwo) });
      await insertLog({ user: null });

      await expect(adapter.count({ user: userOne })).resolves.toBe(2);
      await expect(adapter.count({ user: userTwo })).resolves.toBe(1);
      await expect(adapter.count({ user: null })).resolves.toBe(1);
    });

    it('returns zero when no log matches a user', async () => {
      await insertLog({ user: new mongoose.Types.ObjectId(userOne) });

      await expect(adapter.count({ user: userTwo })).resolves.toBe(0);
    });
  });
});
