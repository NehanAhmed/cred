import { describe, expect, it } from 'vitest';
import { toMongoFilter } from './database.helper.js';

describe('toMongoFilter', () => {
  it('maps the storage-neutral id field onto MongoDB _id', () => {
    expect(toMongoFilter({ id: 'user-1' })).toEqual({ _id: 'user-1' });
  });

  it('keeps ordinary user fields untouched', () => {
    expect(
      toMongoFilter({
        id: 'user-1',
        email: 'user@example.com',
        username: 'user',
        isVerified: true
      })
    ).toEqual({
      _id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      isVerified: true
    });
  });

  it('drops undefined fields instead of querying for them', () => {
    expect(
      toMongoFilter({
        email: 'user@example.com',
        id: undefined,
        bio: undefined
      })
    ).toEqual({ email: 'user@example.com' });
  });

  it('preserves null and other falsy filter values', () => {
    expect(
      toMongoFilter({
        verificationToken: null,
        lockoutUntil: null,
        isVerified: false,
        loginAttempts: 0,
        bio: ''
      })
    ).toEqual({
      verificationToken: null,
      lockoutUntil: null,
      isVerified: false,
      loginAttempts: 0,
      bio: ''
    });
  });

  it('preserves comparison operators for conditional queries', () => {
    const deadline = new Date('2030-01-01T00:00:00.000Z');

    expect(toMongoFilter({ lockoutUntil: { $lte: deadline } } as never)).toEqual({
      lockoutUntil: { $lte: deadline }
    });
  });

  it('does not mutate the supplied filter', () => {
    const filter = { email: 'user@example.com', id: 'user-1', bio: undefined };

    toMongoFilter(filter);

    expect(filter).toEqual({
      email: 'user@example.com',
      id: 'user-1',
      bio: undefined
    });
  });

  it.each([
    ['an empty object', {}],
    ['only undefined values', { id: undefined, email: undefined, bio: undefined }]
  ])('returns an empty query for %s so Mongo can match any document', (_label, filter) => {
    expect(toMongoFilter(filter)).toEqual({});
  });
});
