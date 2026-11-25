import crypto from 'node:crypto';
import {
  DuplicateKeyError,
  type AuditDatabaseAdapter,
  type AuditLogFilter,
  type AuditLogInterface,
  type CreateUserInput,
  type EmailAdapter,
  type RefreshToken,
  type RefreshTokenDatabaseAdapter,
  type User,
  type UserDatabaseAdapter
} from '@cred-kit/core';

export const TEST_JWT_SECRET = 'test-jwt-secret-0123456789abcdef-0123456789abcdef';

/** Matches a record against the filter forms core's services use. */
export const matchesFilter = (record: unknown, filter: unknown): boolean => {
  const rec = record as Record<string, unknown>;

  return Object.entries(filter as Record<string, unknown>).every(([key, value]) => {
    const current = rec[key];

    if (value !== null && typeof value === 'object') {
      const operators = value as Record<string, unknown>;

      return Object.entries(operators).every(([operator, operand]) => {
        switch (operator) {
          case '$ne':
            return current !== operand;
          case '$gt':
          case '$gte':
          case '$lt':
          case '$lte':
            if (current instanceof Date && operand instanceof Date) {
              switch (operator) {
                case '$gt':
                  return current > operand;
                case '$gte':
                  return current >= operand;
                case '$lt':
                  return current < operand;
                case '$lte':
                  return current <= operand;
              }
            }

            if (typeof current === 'number' && typeof operand === 'number') {
              switch (operator) {
                case '$gt':
                  return current > operand;
                case '$gte':
                  return current >= operand;
                case '$lt':
                  return current < operand;
                case '$lte':
                  return current <= operand;
              }
            }

            return false;
          default:
            return false;
        }
      });
    }

    return current === value;
  });
};

export const buildUser = (input: Partial<CreateUserInput> = {}, id: string): User => {
  const now = new Date();

  return {
    ...input,
    id,
    username: input.username ?? `user${id}`,
    email: input.email ?? `user${id}@example.com`,
    password: input.password ?? 'hashed-password',
    isVerified: input.isVerified ?? false,
    verificationToken: input.verificationToken ?? null,
    verificationTokenExpires: input.verificationTokenExpires ?? null,
    verificationTokenLookup: input.verificationTokenLookup ?? null,
    resetPasswordToken: input.resetPasswordToken ?? null,
    resetPasswordExpires: input.resetPasswordExpires ?? null,
    resetPasswordTokenLookup: input.resetPasswordTokenLookup ?? null,
    provider: input.provider ?? 'local',
    avatar: input.avatar ?? null,
    loginAttempts: input.loginAttempts ?? 0,
    lockoutUntil: input.lockoutUntil ?? null,
    lastLogin: null,
    lastIp: null,
    createdAt: now,
    updatedAt: now
  };
};

export class FakeUserDatabase implements UserDatabaseAdapter {
  readonly users: User[] = [];
  readonly findOneCalls: Array<Partial<User>> = [];
  readonly deletedCalls: string[] = [];
  createFails = false;

  async findOne(filter: Partial<User>): Promise<User | null> {
    this.findOneCalls.push(filter);
    return this.users.find((user) => matchesFilter(user, filter)) ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    if (this.createFails) return null as unknown as User;

    this.assertUnique(input);

    const user = buildUser(input, String(this.users.length + 1));
    this.users.push(user);
    return user;
  }

  async delete(id: string): Promise<void> {
    this.deletedCalls.push(id);

    const index = this.users.findIndex((user) => user.id === id);
    if (index !== -1) this.users.splice(index, 1);
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.find((candidate) => candidate.id === id);
    if (!user) return null as unknown as User;

    this.assertUnique(updates, id);
    Object.assign(user, updates, { updatedAt: new Date() });
    return user;
  }

  async findOneByTwoConditions(
    filter1: Partial<User>,
    filter2: Partial<User>
  ): Promise<User | null> {
    return (
      this.users.find((user) => matchesFilter(user, filter1) || matchesFilter(user, filter2)) ??
      null
    );
  }

  async incrementLoginAttempts(id: string): Promise<number> {
    const user = this.users.find((candidate) => candidate.id === id);
    if (!user) return 0;

    user.loginAttempts += 1;
    return user.loginAttempts;
  }

  async findOneAndUpdate(condition: Partial<User>, updates: Partial<User>): Promise<User | null> {
    const user = this.users.find((candidate) => matchesFilter(candidate, condition));
    if (!user) return null;

    Object.assign(user, updates, { updatedAt: new Date() });
    return user;
  }

  private assertUnique(input: Partial<User>, excludeId?: string): void {
    if (
      input.username !== undefined &&
      this.users.some((user) => user.id !== excludeId && user.username === input.username)
    ) {
      throw new DuplicateKeyError('username');
    }

    if (
      input.email !== undefined &&
      this.users.some((user) => user.id !== excludeId && user.email === input.email)
    ) {
      throw new DuplicateKeyError('email');
    }
  }
}

export type StoredToken = RefreshToken & { id: string };

export class FakeRefreshTokenDatabase implements RefreshTokenDatabaseAdapter {
  readonly tokens: StoredToken[] = [];
  createFails = false;

  async findOne(filter: Partial<RefreshToken>): Promise<StoredToken | null> {
    return this.tokens.find((token) => matchesFilter(token, filter)) ?? null;
  }

  async create(token: RefreshToken): Promise<StoredToken> {
    if (this.createFails) return null as unknown as StoredToken;

    const stored: StoredToken = { ...token, id: crypto.randomUUID() };
    this.tokens.push(stored);
    return stored;
  }

  async delete(token: string): Promise<void> {
    const index = this.tokens.findIndex((candidate) => candidate.token === token);
    if (index !== -1) this.tokens.splice(index, 1);
  }

  async update(id: string, updates: Partial<RefreshToken>): Promise<StoredToken> {
    const token = this.tokens.find((candidate) => candidate.id === id);
    if (!token) return null as unknown as StoredToken;

    Object.assign(token, updates);
    return token;
  }

  async findOneAndUpdate(
    condition: Partial<RefreshToken>,
    updates: Partial<RefreshToken>
  ): Promise<StoredToken | null> {
    const token = this.tokens.find((candidate) => matchesFilter(candidate, condition));
    if (!token) return null;

    Object.assign(token, updates);
    return token;
  }

  async deleteMany(filter: Partial<RefreshToken>): Promise<void> {
    for (let index = this.tokens.length - 1; index >= 0; index -= 1) {
      if (matchesFilter(this.tokens[index], filter)) {
        this.tokens.splice(index, 1);
      }
    }
  }
}

export interface StoredAuditLog extends AuditLogInterface {
  createdAt: Date;
}

export class FakeAuditDatabase implements AuditDatabaseAdapter {
  readonly logs: StoredAuditLog[] = [];

  async create(audit: Partial<AuditLogInterface>): Promise<StoredAuditLog> {
    const entry: StoredAuditLog = {
      user: null,
      action: audit.action!,
      status: audit.status!,
      ip: null,
      userAgent: null,
      provider: null,
      metadata: null,
      ...audit,
      createdAt: new Date()
    };

    this.logs.push(entry);
    return entry;
  }

  async find(
    filter: AuditLogFilter,
    options: { skip: number; limit: number }
  ): Promise<StoredAuditLog[]> {
    return this.logs
      .filter((log) => (filter.user === undefined ? true : log.user === filter.user))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(options.skip, options.skip + options.limit);
  }

  async count(filter: AuditLogFilter): Promise<number> {
    return this.logs.filter((log) => (filter.user === undefined ? true : log.user === filter.user))
      .length;
  }
}

export class FakeEmail implements EmailAdapter {
  readonly verifications: Array<{ to: string; rawToken: string }> = [];
  readonly passwordResets: Array<{ to: string; rawToken: string }> = [];
  verificationFails = false;
  passwordResetFails = false;

  async sendEmailVerification(to: string, rawToken: string): Promise<void> {
    if (this.verificationFails) throw new Error('SMTP down');
    this.verifications.push({ to, rawToken });
  }

  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    if (this.passwordResetFails) throw new Error('SMTP down');
    this.passwordResets.push({ to, rawToken });
  }
}

export interface TestDeps {
  users: FakeUserDatabase;
  tokens: FakeRefreshTokenDatabase;
  audit: FakeAuditDatabase;
  email: FakeEmail;
}

export const makeDeps = (): TestDeps => ({
  users: new FakeUserDatabase(),
  tokens: new FakeRefreshTokenDatabase(),
  audit: new FakeAuditDatabase(),
  email: new FakeEmail()
});
