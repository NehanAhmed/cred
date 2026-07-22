import supertest from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  authLimiterConfig,
  profileLimiterConfig,
  loginLimiterConfig,
  registerLimiterConfig,
  forgotLimiterConfig,
  refreshLimiterConfig,
  oauthLimiterConfig,
  profileUpdateLimiterConfig,
} from '../../config/rate-limiters.js';
import type { LimiterOptions } from '../../config/rate-limiters.js';

const namedLimiters: { name: string; config: LimiterOptions }[] = [
  { name: 'authLimiter', config: authLimiterConfig },
  { name: 'profileLimiter', config: profileLimiterConfig },
  { name: 'loginLimiter', config: loginLimiterConfig },
  { name: 'registerLimiter', config: registerLimiterConfig },
  { name: 'forgotLimiter', config: forgotLimiterConfig },
  { name: 'refreshLimiter', config: refreshLimiterConfig },
  { name: 'oauthLimiter', config: oauthLimiterConfig },
  { name: 'profileUpdateLimiter', config: profileUpdateLimiterConfig },
];

const createAppWithLimiter = (config: LimiterOptions) => {
  const app = express();
  app.use(
    rateLimit({
      ...config,
      windowMs: 1000,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
  app.get('/test', (_req, res) => res.sendStatus(200));
  return supertest(app);
};

describe('Rate limiters', () => {
  describe.each(namedLimiters)('$name', ({ name: _name, config }) => {
    it(`allows ${config.max} requests then blocks the ${config.max + 1}th with 429 and the documented message`, async () => {
      const request = createAppWithLimiter(config);

      for (let i = 0; i < config.max; i++) {
        const res = await request.get('/test');
        expect(res.status).toBe(200);
      }

      const res = await request.get('/test');
      expect(res.status).toBe(429);
      expect(res.text).toBe(config.message);
    });

    it('sets rate-limit headers matching production standardHeaders config', async () => {
      const request = createAppWithLimiter({ ...config, windowMs: 60 * 1000 });

      const res = await request.get('/test');
      expect(res.status).toBe(200);

      expect(res.headers['ratelimit-limit']).toBe(String(config.max));
      expect(res.headers['ratelimit-remaining']).toBe(String(config.max - 1));
      expect(res.headers['ratelimit-reset']).toBeDefined();
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });
  });

  it('returns Retry-After header on 429', async () => {
    const request = createAppWithLimiter({ windowMs: 1000, max: 1, message: 'rate limited' });

    await request.get('/test');
    const res = await request.get('/test');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('1');
  });
});
