import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

describe('health route', () => {
  it('returns the standard envelope with status ok by default', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({ status: 'ok' });
    expect(response.body.message).toBe('Service is healthy');
  });

  it('does not set a CSRF cookie on a health request', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/api/health');

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns 503 when the custom check rejects', async () => {
    const { app } = createTestApp({
      health: {
        check: async () => {
          throw new Error('db down');
        }
      }
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Service Unavailable');
    expect(response.body.error).toBe('Service Unavailable');
    expect(response.body.data).toMatchObject({ status: 'unavailable' });
  });

  it('falls through to 404 when health.enabled is false', async () => {
    const { app } = createTestApp({
      health: { enabled: false }
    });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(404);
  });

  it('applies the health rate limiter', async () => {
    const { app } = createTestApp({
      health: {
        rateLimit: { windowMs: 60_000, max: 2, message: 'Too many checks' }
      }
    });

    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/health').expect(200);

    const limited = await request(app).get('/api/health');

    expect(limited.status).toBe(429);
    expect(limited.text).toBe('Too many checks');
  });

  it('rejects an invalid health configuration', () => {
    expect(() =>
      createTestApp({
        health: 'bad' as never
      })
    ).toThrow(/"health" must be an object or omitted/);
  });

  it('rejects a non-function check', () => {
    expect(() =>
      createTestApp({
        health: { check: 'validate' as never }
      })
    ).toThrow(/"health.check" must be a function/);
  });
});
