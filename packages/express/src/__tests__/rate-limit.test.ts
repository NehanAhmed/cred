import { MemoryStore } from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

class SpyStore extends MemoryStore {
  readonly increments: string[] = [];

  override increment(key: string) {
    this.increments.push(key);
    return super.increment(key);
  }
}

describe('rateLimitStoreFactory', () => {
  it('is undefined by default and keeps the in-memory limit', async () => {
    const { app, config } = createTestApp();

    expect(config.rateLimitStoreFactory).toBeUndefined();

    await request(app).get('/api/auth/csrf-token').expect(200);
  });

  it('creates one distinct store per limiter', () => {
    const stores: MemoryStore[] = [];

    createTestApp({
      rateLimitStoreFactory: () => {
        const store = new MemoryStore();
        stores.push(store);
        return store;
      }
    });

    expect(stores).toHaveLength(11);
    expect(new Set(stores).size).toBe(11);
  });

  it('exercises the supplied store on a request', async () => {
    const stores: SpyStore[] = [];

    const { app } = createTestApp({
      rateLimitStoreFactory: () => {
        const store = new SpyStore();
        stores.push(store);
        return store;
      }
    });

    await request(app).get('/api/auth/csrf-token').expect(200);

    expect(stores.some((store) => store.increments.length > 0)).toBe(true);
  });

  it('rejects a non-function factory with a clear error', () => {
    expect(() =>
      createTestApp({
        rateLimitStoreFactory: 'redis' as never
      })
    ).toThrow(/@cred-kit\/express: "rateLimitStoreFactory" must be a function/);
  });
});
