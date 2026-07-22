import supertest from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';

const limiterConfigs = [
  {
    name: 'authLimiter',
    max: 3,
    message: 'Too many authentication attempts, please try again later.',
  },
  {
    name: 'registerLimiter',
    max: 3,
    message: 'Too many registration attempts, please try again in 60 minutes.',
  },
  {
    name: 'loginLimiter',
    max: 3,
    message: 'Too many login attempts, please try again in 15 minutes.',
  },
  {
    name: 'forgotLimiter',
    max: 3,
    message: 'Too many password reset attempts, please try again in 60 minutes.',
  },
  {
    name: 'refreshLimiter',
    max: 3,
    message: 'Too many refresh attempts, please try again in 15 minutes.',
  },
  {
    name: 'oauthLimiter',
    max: 3,
    message: 'Too many OAuth attempts, please try again later.',
  },
  {
    name: 'profileLimiter',
    max: 3,
    message: 'Too many profile requests, please try again later.',
  },
  {
    name: 'profileUpdateLimiter',
    max: 3,
    message: 'Too many profile update attempts, please try again later.',
  },
];

const createApp = (config: { max: number; message: string }) => {
  const app = express();
  app.use(
    rateLimit({
      windowMs: 1000,
      max: config.max,
      message: config.message,
    })
  );
  app.get('/test', (_req, res) => res.sendStatus(200));
  return supertest(app);
};

describe('Rate limiters', () => {
  describe.each(limiterConfigs)('$name', ({ name, max, message }) => {
    it(`allows ${max} requests then blocks the ${max + 1}th with 429`, async () => {
      const request = createApp({ max, message });

      for (let i = 0; i < max; i++) {
        const res = await request.get('/test');
        expect(res.status).toBe(200);
      }

      const res = await request.get('/test');
      expect(res.status).toBe(429);
      expect(res.text).toBe(message);
    });
  });

  it('returns Retry-After header on 429', async () => {
    const request = createApp({ max: 1, message: 'rate limited' });

    await request.get('/test');
    const res = await request.get('/test');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('1');
  });

  it('resets the counter after windowMs expires', async () => {
    const request = createApp({ max: 1, message: 'rate limited' });

    await request.get('/test');
    const blocked = await request.get('/test');
    expect(blocked.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const reset = await request.get('/test');
    expect(reset.status).toBe(200);
  }, 5000);
});
