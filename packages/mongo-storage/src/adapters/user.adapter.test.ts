import { DuplicateKeyError, type CreateUserInput, type User, type UserQuery } from '@cred/core';
import mongoose, { type Model } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../__tests__/helpers/mongo.js';
import { getUserModel } from '../models/user.model.js';
import { createUserAdapter } from './user.adapter.js';

const createInput = (overrides: Partial<CreateUserInput> = {}): CreateUserInput => ({
  username: 'alice',
  email: 'alice@example.com',
  password: 'hashed-password',
  ...overrides
});

const futureDate = (): Date => new Date(Date.now() + 60_000);
const pastDate = (): Date => new Date(Date.now() - 60_000);

describe('createUserAdapter', () => {
  let database: TestDatabase;
  let UserModel: Model<any>;
  let adapter: ReturnType<typeof createUserAdapter>;

  beforeAll(async () => {
    database = await startTestDatabase();
    UserModel = getUserModel(database.connection);
    await UserModel.init();
    adapter = createUserAdapter(UserModel);
  }, 120_000);

  afterEach(async () => {
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  describe('findOne', () => {
    it('returns null when no user matches', async () => {
      await expect(adapter.findOne({ email: 'missing@example.com' })).resolves.toBeNull();
    });

    it('maps a document onto the storage-neutral user contract', async () => {
      const created = await adapter.create(
        createInput({ bio: 'hello', phoneNumber: '+1-555-0100', gender: 'female' })
      );

      const found = await adapter.findOne({ email: 'alice@example.com' });

      expect(found).toMatchObject({
        id: created.id,
        username: 'alice',
        email: 'alice@example.com',
        password: 'hashed-password',
        bio: 'hello',
        phoneNumber: '+1-555-0100',
        gender: 'female',
        provider: 'local',
        isVerified: false,
        loginAttempts: 0
      });
      expect(found?.createdAt).toBeInstanceOf(Date);
      expect(found?.updatedAt).toBeInstanceOf(Date);
      expect(found).not.toHaveProperty('_id');
      expect(found).not.toHaveProperty('__v');
    });

    it('translates the contract id onto _id', async () => {
      const created = await adapter.create(createInput());

      await expect(adapter.findOne({ id: created.id })).resolves.toMatchObject({
        id: created.id,
        email: 'alice@example.com'
      });
    });

    it('ignores undefined filter fields', async () => {
      await adapter.create(createInput());

      await expect(
        adapter.findOne({ email: 'alice@example.com', bio: undefined })
      ).resolves.toMatchObject({ email: 'alice@example.com' });
      await expect(
        adapter.findOne({ email: 'missing@example.com', bio: undefined })
      ).resolves.toBeNull();
    });

    it('supports null filters for optional fields', async () => {
      const created = await adapter.create(createInput());

      await expect(adapter.findOne({ lockoutUntil: null })).resolves.toMatchObject({
        id: created.id
      });
    });

    it('finds fields that exist in the core contract but not in the schema', async () => {
      const created = await adapter.create(
        createInput({ verificationTokenLookup: 'verification-lookup-1' })
      );

      await expect(
        adapter.findOne({ verificationTokenLookup: 'verification-lookup-1' })
      ).resolves.toMatchObject({ id: created.id });
    });

    it.each([
      ['an empty filter', {}],
      ['a filter made only of undefined values', { bio: undefined }]
    ])('rejects %s', async (_label, filter) => {
      await expect(adapter.findOne(filter)).rejects.toThrow(
        'findOne requires at least one filter field'
      );
    });
  });

  describe('create', () => {
    it('persists a user and returns it with defaults and timestamps', async () => {
      const created = await adapter.create(createInput());

      expect(created).toMatchObject({
        username: 'alice',
        email: 'alice@example.com',
        password: 'hashed-password',
        provider: 'local',
        isVerified: false,
        gender: null,
        avatar: null,
        loginAttempts: 0,
        lockoutUntil: null,
        lastLogin: null,
        lastIp: null
      });
      expect(created.id).toBeTypeOf('string');
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it('persists optional profile fields', async () => {
      const created = await adapter.create(
        createInput({ bio: 'bio', phoneNumber: '+1-555-0101', gender: 'other' })
      );

      expect(created).toMatchObject({
        bio: 'bio',
        phoneNumber: '+1-555-0101',
        gender: 'other'
      });
    });

    it('persists contract fields that are absent from the schema', async () => {
      const created = await adapter.create(
        createInput({
          verificationToken: 'verification-hash',
          verificationTokenLookup: 'verification-lookup',
          resetPasswordToken: 'reset-hash',
          resetPasswordTokenLookup: 'reset-lookup'
        })
      );

      const raw = await UserModel.findById(created.id).lean();

      expect(raw).toMatchObject({
        verificationToken: 'verification-hash',
        verificationTokenLookup: 'verification-lookup',
        resetPasswordToken: 'reset-hash',
        resetPasswordTokenLookup: 'reset-lookup'
      });
    });

    it('creates a social account without a password', async () => {
      const created = await adapter.create({
        username: 'oauth-user',
        email: 'oauth@example.com',
        provider: 'google',
        googleId: 'google-1',
        isVerified: true
      } as CreateUserInput);

      expect(created).toMatchObject({
        provider: 'google',
        googleId: 'google-1',
        isVerified: true
      });
      expect(created.password).toBeUndefined();
    });

    it('translates a duplicate username into DuplicateKeyError', async () => {
      await adapter.create(createInput());

      const error = await adapter
        .create(createInput({ email: 'other@example.com' }))
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('username');
      expect((error as DuplicateKeyError).message).toContain('username');
    });

    it('translates a duplicate email into DuplicateKeyError', async () => {
      await adapter.create(createInput());

      const error = await adapter
        .create(createInput({ username: 'other' }))
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('email');
    });

    it('lets schema validation failures propagate unchanged', async () => {
      await expect(adapter.create(createInput({ username: '' }))).rejects.toMatchObject({
        name: 'ValidationError'
      });
    });

    it('lets the local-account password requirement propagate', async () => {
      await expect(
        adapter.create({
          username: 'no-password',
          email: 'no-password@example.com'
        } as CreateUserInput)
      ).rejects.toThrow('Password is required for local accounts');
    });
  });

  describe('delete', () => {
    it('deletes the requested user only', async () => {
      const alice = await adapter.create(createInput());
      const bob = await adapter.create(createInput({ username: 'bob', email: 'bob@example.com' }));

      await adapter.delete(alice.id);

      await expect(adapter.findOne({ id: alice.id })).resolves.toBeNull();
      await expect(adapter.findOne({ id: bob.id })).resolves.toMatchObject({
        username: 'bob'
      });
    });

    it('resolves when the user does not exist', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      await expect(adapter.delete(missingId)).resolves.toBeUndefined();
    });

    it('rejects a malformed id rather than silently deleting nothing', async () => {
      await expect(adapter.delete('not-an-object-id')).rejects.toThrow(/Cast to ObjectId failed/);
    });
  });

  describe('update', () => {
    it('updates mutable fields and returns the new document', async () => {
      const created = await adapter.create(
        createInput({ bio: 'old bio', phoneNumber: '+1-555-0102' })
      );

      const updated = await adapter.update(created.id, {
        bio: 'new bio',
        phoneNumber: '+1-555-0199',
        gender: 'male'
      });

      expect(updated).toMatchObject({
        id: created.id,
        bio: 'new bio',
        phoneNumber: '+1-555-0199',
        gender: 'male'
      });
      await expect(adapter.findOne({ id: created.id })).resolves.toMatchObject({
        bio: 'new bio'
      });
    });

    it('ignores undefined update fields', async () => {
      const created = await adapter.create(createInput({ bio: 'keep me' }));

      const updated = await adapter.update(created.id, {
        bio: undefined,
        phoneNumber: '+1-555-0110'
      });

      expect(updated).toMatchObject({
        bio: 'keep me',
        phoneNumber: '+1-555-0110'
      });
    });

    it('refuses to reassign identity or immutable timestamps', async () => {
      const created = await adapter.create(createInput());
      const before = await adapter.findOne({ id: created.id });
      const replacementId = new mongoose.Types.ObjectId().toString();

      const updated = await adapter.update(created.id, {
        id: replacementId,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        bio: 'updated'
      } as Partial<User>);

      expect(updated.id).toBe(created.id);
      expect(updated.bio).toBe('updated');
      expect(updated.createdAt.getTime()).toBe(before?.createdAt.getTime());
      expect(updated.updatedAt.getTime()).not.toBe(new Date(0).getTime());

      await expect(adapter.findOne({ id: replacementId })).resolves.toBeNull();
    });

    it('persists contract fields that are absent from the schema', async () => {
      const created = await adapter.create(createInput());

      const updated = await adapter.update(created.id, {
        verificationTokenLookup: 'updated-lookup'
      } as Partial<User>);

      expect(updated.verificationTokenLookup).toBe('updated-lookup');
    });

    it('translates a duplicate username into DuplicateKeyError', async () => {
      await adapter.create(createInput());
      const bob = await adapter.create(createInput({ username: 'bob', email: 'bob@example.com' }));

      const error = await adapter
        .update(bob.id, { username: 'alice' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('username');
    });

    it('translates a duplicate email into DuplicateKeyError', async () => {
      await adapter.create(createInput());
      const bob = await adapter.create(createInput({ username: 'bob', email: 'bob@example.com' }));

      const error = await adapter
        .update(bob.id, { email: 'alice@example.com' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('email');
    });

    it('runs schema validators', async () => {
      const created = await adapter.create(createInput());

      await expect(
        adapter.update(created.id, { gender: 'invalid' } as unknown as Partial<User>)
      ).rejects.toThrow(/gender/);
    });

    it('returns null when the user was deleted concurrently', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      await expect(adapter.update(missingId, { bio: 'x' })).resolves.toBeNull();
    });

    it('rejects a malformed id', async () => {
      await expect(adapter.update('not-an-object-id', { bio: 'x' })).rejects.toThrow(
        /Cast to ObjectId failed/
      );
    });
  });

  describe('findOneByTwoConditions', () => {
    it('matches either condition', async () => {
      const alice = await adapter.create(createInput());
      const bob = await adapter.create(createInput({ username: 'bob', email: 'bob@example.com' }));

      const found = await adapter.findOneByTwoConditions(
        { username: 'alice' },
        { email: 'bob@example.com' }
      );

      expect([alice.id, bob.id]).toContain(found?.id);
    });

    it('uses the only usable condition when the other is empty', async () => {
      const created = await adapter.create(createInput());

      await expect(
        adapter.findOneByTwoConditions({ email: undefined }, { username: 'alice' })
      ).resolves.toMatchObject({ id: created.id });
    });

    it('returns null when both conditions are empty', async () => {
      await expect(adapter.findOneByTwoConditions({ username: undefined }, {})).resolves.toBeNull();
    });

    it('does not treat an empty condition as match-all', async () => {
      await adapter.create(createInput());

      await expect(
        adapter.findOneByTwoConditions({ username: 'missing' }, { email: undefined })
      ).resolves.toBeNull();
    });

    it('translates the contract id in either condition', async () => {
      const created = await adapter.create(createInput());

      await expect(adapter.findOneByTwoConditions({ id: created.id }, {})).resolves.toMatchObject({
        id: created.id
      });
      await expect(adapter.findOneByTwoConditions({}, { id: created.id })).resolves.toMatchObject({
        id: created.id
      });
    });
  });

  describe('incrementLoginAttempts', () => {
    it('increments and returns the new attempt count', async () => {
      const created = await adapter.create(createInput());

      await expect(adapter.incrementLoginAttempts(created.id)).resolves.toBe(1);
      await expect(adapter.incrementLoginAttempts(created.id)).resolves.toBe(2);

      await expect(adapter.findOne({ id: created.id })).resolves.toMatchObject({
        loginAttempts: 2
      });
    });

    it('returns 0 when the user does not exist', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      await expect(adapter.incrementLoginAttempts(missingId)).resolves.toBe(0);
    });

    it('increments atomically under concurrent failures', async () => {
      const created = await adapter.create(createInput());

      const results = await Promise.all(
        Array.from({ length: 10 }, () => adapter.incrementLoginAttempts(created.id))
      );

      expect(results.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      await expect(adapter.findOne({ id: created.id })).resolves.toMatchObject({
        loginAttempts: 10
      });
    });
  });

  describe('findOneAndUpdate', () => {
    it('atomically updates the first matching user', async () => {
      const created = await adapter.create(createInput());

      const updated = await adapter.findOneAndUpdate(
        { id: created.id, isVerified: false },
        { isVerified: true }
      );

      expect(updated).toMatchObject({ id: created.id, isVerified: true });
      await expect(adapter.findOne({ id: created.id })).resolves.toMatchObject({
        isVerified: true
      });
    });

    it('supports comparison operators in the condition', async () => {
      const created = await adapter.create(
        createInput({
          verificationToken: 'verification-hash',
          verificationTokenExpires: futureDate()
        })
      );

      const updated = await adapter.findOneAndUpdate(
        {
          id: created.id,
          verificationToken: 'verification-hash',
          verificationTokenExpires: { $gt: new Date() }
        },
        {
          isVerified: true,
          verificationToken: null,
          verificationTokenExpires: null
        }
      );

      expect(updated).toMatchObject({
        id: created.id,
        isVerified: true,
        verificationToken: null,
        verificationTokenExpires: null
      });
    });

    it('returns null and leaves the user untouched when the condition misses', async () => {
      const created = await adapter.create(
        createInput({
          verificationToken: 'verification-hash',
          verificationTokenExpires: pastDate()
        })
      );

      const updated = await adapter.findOneAndUpdate(
        {
          id: created.id,
          verificationTokenExpires: { $gt: new Date() }
        },
        { isVerified: true }
      );

      expect(updated).toBeNull();
      await expect(adapter.findOne({ id: created.id })).resolves.toMatchObject({
        isVerified: false
      });
    });

    it('returns null when the user does not exist', async () => {
      const missingId = new mongoose.Types.ObjectId().toString();

      await expect(adapter.findOneAndUpdate({ id: missingId }, { bio: 'x' })).resolves.toBeNull();
    });

    it('can condition on fields that are absent from the schema', async () => {
      const created = await adapter.create(createInput({ verificationTokenLookup: 'lookup-1' }));

      const updated = await adapter.findOneAndUpdate(
        { verificationTokenLookup: 'lookup-1' },
        { isVerified: true, verificationTokenLookup: null }
      );

      expect(updated).toMatchObject({ id: created.id, isVerified: true });
      expect(updated?.verificationTokenLookup).toBeNull();
    });

    it('only lets one caller win a compare-and-set race', async () => {
      const created = await adapter.create(createInput({ verificationToken: 'token-1' }));

      const results = await Promise.all([
        adapter.findOneAndUpdate(
          { id: created.id, verificationToken: 'token-1' },
          { verificationToken: null }
        ),
        adapter.findOneAndUpdate(
          { id: created.id, verificationToken: 'token-1' },
          { verificationToken: null }
        )
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
    });

    it('refuses to reassign identity or immutable timestamps', async () => {
      const created = await adapter.create(createInput());
      const before = await adapter.findOne({ id: created.id });
      const replacementId = new mongoose.Types.ObjectId().toString();

      const updated = await adapter.findOneAndUpdate({ id: created.id }, {
        id: replacementId,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        bio: 'updated'
      } as Partial<User>);

      expect(updated?.id).toBe(created.id);
      expect(updated?.bio).toBe('updated');
      expect(updated?.createdAt.getTime()).toBe(before?.createdAt.getTime());
      expect(updated?.updatedAt.getTime()).not.toBe(new Date(0).getTime());
    });

    it('translates duplicate key violations on update', async () => {
      await adapter.create(createInput());
      const bob = await adapter.create(createInput({ username: 'bob', email: 'bob@example.com' }));

      const error = await adapter
        .findOneAndUpdate({ id: bob.id }, { username: 'alice' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).field).toBe('username');
    });

    it('runs schema validators', async () => {
      const created = await adapter.create(createInput());

      await expect(
        adapter.findOneAndUpdate({ id: created.id }, {
          gender: 'invalid'
        } as unknown as Partial<User>)
      ).rejects.toThrow(/gender/);
    });

    it.each([
      ['an empty condition', {} as UserQuery],
      ['a condition made only of undefined values', { id: undefined } as UserQuery]
    ])('rejects %s', async (_label, condition) => {
      await expect(adapter.findOneAndUpdate(condition, { bio: 'x' })).rejects.toThrow(
        'A conditional user update requires at least one condition'
      );
    });
  });
});
