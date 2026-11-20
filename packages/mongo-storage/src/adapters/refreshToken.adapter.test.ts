import { DuplicateKeyError, type RefreshToken } from '@cred/core';
import mongoose, { type Model } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../__tests__/helpers/mongo.js';
import { getRefreshModel } from '../models/refresh-token.model.js';
import { createRefreshTokenAdapter } from './refreshToken.adapter.js';

const userOne = new mongoose.Types.ObjectId().toString();
const userTwo = new mongoose.Types.ObjectId().toString();
const sevenDays = 7 * 24 * 60 * 60 * 1000;

const tokenInput = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
  token: 'hashed-token',
  user: userOne,
  family: 'family-1',
  expiresAt: new Date(Date.now() + sevenDays),
  consumed: false,
  ...overrides
});

describe('createRefreshTokenAdapter', () => {
  let database: TestDatabase;
  let RefreshTokenModel: Model<any>;
  let adapter: ReturnType<typeof createRefreshTokenAdapter>;

  beforeAll(async () => {
    database = await startTestDatabase();
    RefreshTokenModel = getRefreshModel(database.connection);
    await RefreshTokenModel.init();

    adapter = createRefreshTokenAdapter(RefreshTokenModel);
  }, 120_000);

  afterEach(async () => {
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  const idOf = async (token: string): Promise<string> => {
    const raw = await RefreshTokenModel.findOne({ token }).lean();
    if (!raw) {
      throw new Error(`No refresh token stored for ${token}`);
    }
    return String(raw._id);
  };

  describe('findOne', () => {
    it('returns null when no token matches', async () => {
      await expect(adapter.findOne({ token: 'missing' })).resolves.toBeNull();
    });

    it('returns the token contract with a string user reference', async () => {
      const expiresAt = new Date(Date.now() + sevenDays);
      await adapter.create({
        token: 'hashed-token',
        user: userOne,
        family: 'family-1',
        expiresAt,
        consumed: true
      });

      const found = await adapter.findOne({ token: 'hashed-token' });

      expect(found).toMatchObject({
        token: 'hashed-token',
        user: userOne,
        family: 'family-1',
        consumed: true
      });
      expect(found?.expiresAt.getTime()).toBe(expiresAt.getTime());
      expect(found).not.toHaveProperty('__v');
    });

    it('finds a token by its opaque lookup id', async () => {
      await adapter.create({ ...tokenInput(), lookupId: 'lookup-1' });

      await expect(adapter.findOne({ lookupId: 'lookup-1' })).resolves.toMatchObject({
        lookupId: 'lookup-1',
        token: 'hashed-token'
      });
    });

    it('casts the user string for filtering', async () => {
      await adapter.create(tokenInput());

      await expect(adapter.findOne({ user: userOne })).resolves.toMatchObject({
        user: userOne
      });
      await expect(adapter.findOne({ user: userTwo })).resolves.toBeNull();
    });

    it('ignores undefined filter fields', async () => {
      await adapter.create(tokenInput());

      await expect(
        adapter.findOne({ token: 'hashed-token', family: undefined })
      ).resolves.toMatchObject({ token: 'hashed-token' });
      await expect(adapter.findOne({ token: 'missing', family: undefined })).resolves.toBeNull();
    });

    it.each([
      ['an empty filter', {}],
      ['a filter made only of undefined values', { token: undefined, family: undefined }]
    ])('matches the first document for %s', async (_label, filter) => {
      await adapter.create(tokenInput());

      await expect(adapter.findOne(filter)).resolves.toMatchObject({
        token: 'hashed-token'
      });
    });
  });

  describe('create', () => {
    it('persists a refresh token and returns the mapped contract', async () => {
      const created = await adapter.create(tokenInput());

      expect(created).toMatchObject({
        token: 'hashed-token',
        user: userOne,
        family: 'family-1',
        consumed: false
      });
      expect(created.expiresAt).toBeInstanceOf(Date);
    });

    it('defaults consumed to false when the caller omits it', async () => {
      const { consumed: _consumed, ...withoutConsumed } = tokenInput();

      const created = await adapter.create(withoutConsumed as RefreshToken);

      expect(created.consumed).toBe(false);
    });

    it('stores the user as an ObjectId while exposing it as a string', async () => {
      const created = await adapter.create(tokenInput());

      const raw = await RefreshTokenModel.findOne({ token: 'hashed-token' }).lean();

      expect(raw?.user).toBeInstanceOf(mongoose.Types.ObjectId);
      expect(String(raw?.user)).toBe(userOne);
      expect(created.user).toBe(userOne);
    });

    it('persists the opaque lookup id used before hash verification', async () => {
      await adapter.create({ ...tokenInput(), lookupId: 'lookup-1' });

      const raw = await RefreshTokenModel.findOne({ lookupId: 'lookup-1' }).lean();

      expect(raw).toMatchObject({ token: 'hashed-token', lookupId: 'lookup-1' });
    });

    it.each([
      ['token', { user: userOne, family: 'family-1', expiresAt: new Date() }],
      ['user', { token: 'hashed-token', family: 'family-1', expiresAt: new Date() }],
      ['family', { token: 'hashed-token', user: userOne, expiresAt: new Date() }],
      ['expiresAt', { token: 'hashed-token', user: userOne, family: 'family-1' }]
    ])('requires %s', async (_field, input) => {
      await expect(adapter.create(input as RefreshToken)).rejects.toMatchObject({
        name: 'ValidationError'
      });
    });

    it('rejects a malformed user reference', async () => {
      await expect(adapter.create({ ...tokenInput(), user: 'not-an-object-id' })).rejects.toThrow(
        /Cast to ObjectId failed/
      );
    });

    it('translates a duplicate token into DuplicateKeyError', async () => {
      await adapter.create({ ...tokenInput(), token: 'unique-token' });

      const error = await adapter
        .create({ ...tokenInput(), token: 'unique-token' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('token');
    });
  });

  describe('delete', () => {
    it('deletes only the presented token', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });
      await adapter.create({ ...tokenInput(), token: 'token-2' });

      await adapter.delete('token-1');

      await expect(adapter.findOne({ token: 'token-1' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 'token-2' })).resolves.toMatchObject({
        token: 'token-2'
      });
    });

    it('resolves when the token does not exist', async () => {
      await expect(adapter.delete('missing-token')).resolves.toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates mutable fields and returns the new document', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });
      const id = await idOf('token-1');
      const nextExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const updated = await adapter.update(id, {
        consumed: true,
        expiresAt: nextExpiry
      });

      expect(updated).toMatchObject({ token: 'token-1', consumed: true });
      expect(updated.expiresAt.getTime()).toBe(nextExpiry.getTime());
      await expect(adapter.findOne({ token: 'token-1' })).resolves.toMatchObject({
        consumed: true
      });
    });

    it('ignores undefined update fields', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1', consumed: false });
      const id = await idOf('token-1');

      const updated = await adapter.update(id, {
        consumed: true,
        family: undefined
      });

      expect(updated).toMatchObject({ consumed: true, family: 'family-1' });
    });

    it('refuses to reassign identity or immutable timestamps', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });
      const id = await idOf('token-1');
      const before = await RefreshTokenModel.findById(id).lean();
      const replacementId = new mongoose.Types.ObjectId().toString();
      const nextExpiry = new Date(Date.now() + 2 * sevenDays);

      const updated = await adapter.update(id, {
        expiresAt: nextExpiry,
        id: replacementId,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      } as Partial<RefreshToken>);

      expect(updated.expiresAt.getTime()).toBe(nextExpiry.getTime());
      expect(await RefreshTokenModel.findById(replacementId).lean()).toBeNull();

      const after = await RefreshTokenModel.findById(id).lean();
      expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime());
      expect(after?.updatedAt.getTime()).not.toBe(new Date(0).getTime());
    });

    it('runs schema validators', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });
      const id = await idOf('token-1');

      await expect(
        adapter.update(id, { token: null } as unknown as Partial<RefreshToken>)
      ).rejects.toThrow(/token/);
    });

    it('returns null when the token was deleted concurrently', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      await expect(adapter.update(missingId, { consumed: true })).resolves.toBeNull();
    });

    it('rejects a malformed id', async () => {
      await expect(adapter.update('not-an-object-id', { consumed: true })).rejects.toThrow(
        /Cast to ObjectId failed/
      );
    });

    it('translates duplicate key violations on update', async () => {
      await adapter.create({ ...tokenInput(), token: 'unique-token-1' });
      await adapter.create({ ...tokenInput(), token: 'unique-token-2' });
      const id = await idOf('unique-token-2');

      const error = await adapter
        .update(id, { token: 'unique-token-1' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('token');
    });
  });

  describe('findOneAndUpdate', () => {
    it('claims a token atomically with a compare-and-set', async () => {
      await adapter.create({ ...tokenInput(), lookupId: 'lookup-1' });

      const claimed = await adapter.findOneAndUpdate(
        { lookupId: 'lookup-1', consumed: false },
        { consumed: true }
      );
      const secondClaim = await adapter.findOneAndUpdate(
        { lookupId: 'lookup-1', consumed: false },
        { consumed: true }
      );

      expect(claimed).toMatchObject({ token: 'hashed-token', consumed: true });
      expect(secondClaim).toBeNull();
    });

    it('lets only one concurrent caller claim a token', async () => {
      await adapter.create({ ...tokenInput(), lookupId: 'lookup-1' });

      const results = await Promise.all([
        adapter.findOneAndUpdate({ lookupId: 'lookup-1', consumed: false }, { consumed: true }),
        adapter.findOneAndUpdate({ lookupId: 'lookup-1', consumed: false }, { consumed: true })
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      await expect(adapter.findOne({ lookupId: 'lookup-1' })).resolves.toMatchObject({
        consumed: true
      });
    });

    it('casts the user string for the condition', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });

      const updated = await adapter.findOneAndUpdate(
        { user: userOne, consumed: false },
        { consumed: true }
      );

      expect(updated).toMatchObject({ user: userOne, consumed: true });
    });

    it('returns null when nothing matches', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });

      await expect(
        adapter.findOneAndUpdate({ user: userTwo, consumed: false }, { consumed: true })
      ).resolves.toBeNull();
    });

    it('can clear the opaque lookup id on rotation', async () => {
      await adapter.create({ ...tokenInput(), lookupId: 'lookup-1' });

      const updated = await adapter.findOneAndUpdate({ lookupId: 'lookup-1' }, {
        lookupId: null
      } as unknown as Partial<RefreshToken>);

      expect(updated?.lookupId).toBeNull();
    });

    it('runs schema validators', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });

      await expect(
        adapter.findOneAndUpdate({ token: 'token-1' }, {
          token: null
        } as unknown as Partial<RefreshToken>)
      ).rejects.toThrow(/token/);
    });

    it('refuses to reassign identity or immutable timestamps', async () => {
      await adapter.create({ ...tokenInput(), token: 'token-1' });
      const id = await idOf('token-1');
      const before = await RefreshTokenModel.findById(id).lean();
      const replacementId = new mongoose.Types.ObjectId().toString();
      const nextExpiry = new Date(Date.now() + 2 * sevenDays);

      const updated = await adapter.findOneAndUpdate({ token: 'token-1' }, {
        expiresAt: nextExpiry,
        id: replacementId,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      } as Partial<RefreshToken>);

      expect(updated?.expiresAt.getTime()).toBe(nextExpiry.getTime());
      expect(await RefreshTokenModel.findById(replacementId).lean()).toBeNull();

      const after = await RefreshTokenModel.findById(id).lean();
      expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime());
      expect(after?.updatedAt.getTime()).not.toBe(new Date(0).getTime());
    });

    it.each([
      ['an empty condition', {}],
      ['a condition made only of undefined values', { token: undefined }]
    ])('updates the first matching document for %s', async (_label, condition) => {
      await adapter.create(tokenInput());

      await expect(
        adapter.findOneAndUpdate(condition, { consumed: true })
      ).resolves.toMatchObject({ token: 'hashed-token', consumed: true });
    });

    it('translates duplicate key violations on update', async () => {
      await adapter.create({ ...tokenInput(), token: 'unique-token-1' });
      await adapter.create({ ...tokenInput(), token: 'unique-token-2' });

      const error = await adapter
        .findOneAndUpdate({ token: 'unique-token-2' }, { token: 'unique-token-1' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('token');
    });
  });

  describe('deleteMany', () => {
    const seedFamilies = async (): Promise<void> => {
      await adapter.create({ ...tokenInput(), token: 't1', family: 'family-1' });
      await adapter.create({ ...tokenInput(), token: 't2', family: 'family-1' });
      await adapter.create({ ...tokenInput(), token: 't3', family: 'family-2' });
      await adapter.create({
        ...tokenInput(),
        token: 't4',
        user: userTwo,
        family: 'family-1'
      });
    };

    it('deletes every token in one family belonging to one user', async () => {
      await seedFamilies();

      await adapter.deleteMany({ family: 'family-1', user: userOne });

      await expect(adapter.findOne({ token: 't1' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't2' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't3' })).resolves.toMatchObject({
        token: 't3'
      });
      await expect(adapter.findOne({ token: 't4' })).resolves.toMatchObject({
        token: 't4'
      });
    });

    it('deletes a whole family when only the family is supplied', async () => {
      await seedFamilies();

      await adapter.deleteMany({ family: 'family-1' });

      await expect(adapter.findOne({ token: 't1' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't2' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't3' })).resolves.toMatchObject({
        token: 't3'
      });
      await expect(adapter.findOne({ token: 't4' })).resolves.toBeNull();
    });

    it('deletes every token belonging to one user', async () => {
      await seedFamilies();

      await adapter.deleteMany({ user: userOne });

      await expect(adapter.findOne({ token: 't1' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't2' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't3' })).resolves.toBeNull();
      await expect(adapter.findOne({ token: 't4' })).resolves.toMatchObject({
        token: 't4'
      });
    });

    it('leaves the database untouched when nothing matches', async () => {
      await seedFamilies();

      await adapter.deleteMany({ family: 'unknown-family' });

      await expect(adapter.findOne({ token: 't1' })).resolves.toMatchObject({
        token: 't1'
      });
    });

    it('rejects an empty filter', async () => {
      await expect(adapter.deleteMany({})).rejects.toThrow(
        'deleteMany requires at least one filter field'
      );
    });
  });
});
