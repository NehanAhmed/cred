import express, { type Express } from 'express';
import request from 'supertest';
import {
  resolveCredConfig,
  type CredExpressConfig,
  type ResolvedCredExpressConfig
} from '../config.js';
import { createRouter } from '../router.js';
import type { CredCoreDeps } from '../types.js';
import { makeDeps, TEST_JWT_SECRET, type TestDeps } from './fakes.js';

export type TestAppOverrides = Omit<
  Partial<CredExpressConfig>,
  'database' | 'email' | 'jwtSecret' | 'clientUrl' | 'backendUrl'
>;

export interface TestApp {
  app: Express;
  config: ResolvedCredExpressConfig;
  deps: CredCoreDeps;
  fakes: TestDeps;
}

export const createTestApp = (overrides: TestAppOverrides = {}): TestApp => {
  const fakes = makeDeps();

  const config = resolveCredConfig({
    database: {
      user: fakes.users,
      refreshToken: fakes.tokens,
      audit: fakes.audit
    },
    email: fakes.email,
    jwtSecret: TEST_JWT_SECRET,
    clientUrl: 'http://localhost:3000',
    backendUrl: 'http://localhost:5000',
    ...overrides
  });

  const deps: CredCoreDeps = {
    userDatabase: fakes.users,
    refreshTokenDatabase: fakes.tokens,
    auditDatabase: fakes.audit,
    email: fakes.email
  };

  const app = express();
  app.use('/api', createRouter(config, deps));

  return { app, config, deps, fakes };
};

export const TEST_USER = {
  username: 'johndoe',
  email: 'john@example.com',
  password: 'SecurePass1'
} as const;

/**
 * Registers a user through the router and follows the verification link.
 * Returns the agent so the caller keeps the CSRF and auth cookies.
 */
export const registerVerifiedUser = async (
  app: Express,
  fakes: TestDeps
): Promise<ReturnType<typeof request.agent>> => {
  const agent = request.agent(app);

  await agent.post('/api/auth').send(TEST_USER).expect(201);

  const verification = fakes.email.verifications.at(-1);
  if (!verification) throw new Error('registration did not send an email');

  await agent.get(`/api/auth/verify-email/${verification.rawToken}`).expect(302);

  return agent;
};
