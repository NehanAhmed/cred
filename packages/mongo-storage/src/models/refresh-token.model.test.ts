import mongoose, { type Model } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  hasSchemaIndex,
  startTestDatabase,
  type TestDatabase
} from '../__tests__/helpers/mongo.js';
import { getRefreshModel } from './refresh-token.model.js';
import { getUserModel } from './user.model.js';

const userId = new mongoose.Types.ObjectId().toString();
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

describe('getRefreshModel', () => {
  let database: TestDatabase;
  let User: Model<any>;
  let RefreshToken: Model<any>;

  beforeAll(async () => {
    database = await startTestDatabase();
    // The two models share a connection in production, so the getters must not
    // resolve to the same registered model.
    User = getUserModel(database.connection);
    RefreshToken = getRefreshModel(database.connection);
    await RefreshToken.init();
  }, 120_000);

  afterEach(async () => {
    await database.clear();
  });

  afterAll(async () => {
    await database.close();
  });

  it('registers a refresh-token model distinct from the user model', () => {
    expect(RefreshToken).not.toBe(User);
    expect(RefreshToken.modelName).not.toBe(User.modelName);
    expect(RefreshToken.collection.name).toBe('RefreshToken');
  });

  it('reuses the registered model instead of compiling it twice', () => {
    expect(getRefreshModel(database.connection)).toBe(RefreshToken);
  });

  it('honours an explicit model name and collection', () => {
    const CustomRefreshToken = getRefreshModel(
      database.connection,
      'CustomCredRefreshToken',
      'CustomRefreshTokenCollection'
    );

    expect(CustomRefreshToken).not.toBe(RefreshToken);
    expect(CustomRefreshToken.modelName).toBe('CustomCredRefreshToken');
    expect(CustomRefreshToken.collection.name).toBe('CustomRefreshTokenCollection');
  });

  it('defaults consumed to false and records timestamps', async () => {
    const token = await RefreshToken.create({
      token: 'hashed-token',
      user: userId,
      family: 'family-1',
      expiresAt
    });

    expect(token.consumed).toBe(false);
    expect(token.createdAt).toBeInstanceOf(Date);
    expect(token.updatedAt).toBeInstanceOf(Date);
  });

  it('casts the user reference to an ObjectId', async () => {
    const token = await RefreshToken.create({
      token: 'hashed-token',
      user: userId,
      family: 'family-1',
      expiresAt
    });

    expect(token.user).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(token.user)).toBe(userId);
  });

  it.each([
    ['token', { user: userId, family: 'family-1', expiresAt }],
    ['user', { token: 'hashed-token', family: 'family-1', expiresAt }],
    ['family', { token: 'hashed-token', user: userId, expiresAt }],
    ['expiresAt', { token: 'hashed-token', user: userId, family: 'family-1' }]
  ])('requires %s', async (_field, input) => {
    await expect(RefreshToken.create(input)).rejects.toMatchObject({
      name: 'ValidationError'
    });
  });

  it('rejects a user reference that is not an ObjectId', async () => {
    await expect(
      RefreshToken.create({
        token: 'hashed-token',
        user: 'not-an-object-id',
        family: 'family-1',
        expiresAt
      })
    ).rejects.toThrow(/Cast to ObjectId failed/);
  });

  it('persists adapter-managed fields that are not part of the schema', async () => {
    const token = new RefreshToken(
      {
        token: 'hashed-token',
        user: userId,
        family: 'family-1',
        expiresAt,
        lookupId: 'lookup-1'
      },
      undefined,
      { strict: false }
    );
    await token.save();

    const stored = await RefreshToken.findOne({ lookupId: 'lookup-1' })
      .setOptions({ strictQuery: false })
      .lean();

    expect(stored).toMatchObject({
      token: 'hashed-token',
      family: 'family-1',
      lookupId: 'lookup-1'
    });
  });

  it('declares the lookup and TTL indexes used by refresh-token rotation', () => {
    expect(hasSchemaIndex(RefreshToken, { token: 1 })).toBe(true);
    expect(hasSchemaIndex(RefreshToken, { user: 1, family: 1 })).toBe(true);
    expect(hasSchemaIndex(RefreshToken, { expiresAt: 1 }, { expireAfterSeconds: 0 })).toBe(true);
  });
});
