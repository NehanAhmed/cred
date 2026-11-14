import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { register } from './auth.service.js';
import { AuthError } from '../errors/auth-error.js';
import type { RegisterRequest, User } from '../types/auth.types.js';
import type { UserDatabaseAdapter, EmailAdapter } from '../types/deps.types.js';

type CreateInput = Parameters<UserDatabaseAdapter['create']>[0];

const validInput: RegisterRequest = {
  username: 'johndoe',
  email: 'john@example.com',
  password: 'SecurePass1',
};

function buildUser(input: CreateInput, id: string): User {
  return {
    verificationToken: null,
    verificationTokenExpires: null,
    ...input,
    id,
    isVerified: false,
    resetPasswordToken: null,
    resetPasswordExpires: null,
    provider: 'local',
    avatar: null,
    loginAttempts: 0,
    lockoutUntil: null,
    lastLogin: null,
    lastIp: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeFakes(opts: { emailFails?: boolean; createReturnsNull?: boolean } = {}) {
  const users: User[] = [];
  const calls = {
    findOne: [] as Array<Partial<User>>,
    deleted: [] as string[],
    emails: [] as Array<{ to: string; rawToken: string }>,
    passwordResets: [] as Array<{ to: string; rawToken: string }>,
  };

  const database: UserDatabaseAdapter = {
    findOne: async (filter) => {
      calls.findOne.push(filter);
      return (
        users.find((u) =>
          Object.entries(filter).every(
            ([field, value]) => u[field as keyof User] === value,
          ),
        ) ?? null
      );
    },
    create: async (input) => {
      if (opts.createReturnsNull) return null as unknown as User;
      const user = buildUser(input, String(users.length + 1));
      users.push(user);
      return user;
    },
    delete: async (id) => {
      calls.deleted.push(id);
      const i = users.findIndex((u) => u.id === id);
      if (i !== -1) users.splice(i, 1);
    },
    update: async (id, updates) => {
      const user = users.find((u) => u.id === id);
      if (!user) return null as unknown as User;
      Object.assign(user, updates);
      return user;
    },
    findOneByTwoConditions: async (filter1, filter2) => {
      return (
        users.find(
          (u) =>
            Object.entries(filter1).every(
              ([field, value]) => u[field as keyof User] === value,
            ) ||
            Object.entries(filter2).every(
              ([field, value]) => u[field as keyof User] === value,
            ),
        ) ?? null
      );
    },
    incrementLoginAttempts: async (id) => {
      const user = users.find((u) => u.id === id);
      if (!user) return 0;
      user.loginAttempts += 1;
      return user.loginAttempts;
    },
    findOneAndUpdate: async (condition, updates) => {
      const user = users.find((u) =>
        Object.entries(condition).every(([field, value]) => {
          const current = u[field as keyof User];
          if (value && typeof value === 'object' && '$gt' in value) {
            return current instanceof Date && current > (value as { $gt: Date }).$gt;
          }
          return current === value;
        }),
      );
      if (!user) return null;
      Object.assign(user, updates);
      return user;
    },
  };

  const email: EmailAdapter = {
    sendEmailVerification: async (to, rawToken) => {
      if (opts.emailFails) throw new Error('SMTP down');
      calls.emails.push({ to, rawToken });
    },
    sendPasswordReset: async (to, rawToken) => {
      calls.passwordResets.push({ to, rawToken });
    },
  };

  return { users, calls, deps: { userDatabase: database, email } };
}

describe('register', () => {
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(() => {
    fakes = makeFakes();
  });

  it('creates a user and sends a verification email', async () => {
    await register(validInput, fakes.deps);

    expect(fakes.users).toHaveLength(1);
    expect(fakes.users[0].username).toBe('johndoe');
    expect(fakes.calls.emails).toHaveLength(1);
    expect(fakes.calls.emails[0].to).toBe('john@example.com');
  });

  it('lowercases and trims the email before lookup and storage', async () => {
    await register({ ...validInput, email: '  John@Example.COM ' }, fakes.deps);

    const emailLookup = fakes.calls.findOne.find((filter) => filter.email !== undefined);
    expect(emailLookup?.email).toBe('john@example.com');
    expect(fakes.users[0].email).toBe('john@example.com');
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await register(validInput, fakes.deps);

    const stored = fakes.users[0].password;
    expect(stored).not.toBe(validInput.password);
    expect(await bcrypt.compare(validInput.password, stored)).toBe(true);
  });

  it('emails the raw token and stores only its SHA-256 hash', async () => {
    await register(validInput, fakes.deps);

    const { rawToken } = fakes.calls.emails[0];
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    expect(fakes.users[0].verificationToken).toBe(expectedHash);
    expect(fakes.users[0].verificationToken).not.toBe(rawToken);
  });

  it('sets the verification token to expire in about 24 hours', async () => {
    const before = Date.now();
    await register(validInput, fakes.deps);
    const after = Date.now();

    const expires = fakes.users[0].verificationTokenExpires!.getTime();
    const day = 24 * 60 * 60 * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + day);
    expect(expires).toBeLessThanOrEqual(after + day);
  });

  it('passes optional profile fields through', async () => {
    await register(
      { ...validInput, bio: 'Full-stack dev', phoneNumber: '1234567890', gender: 'male' },
      fakes.deps,
    );

    expect(fakes.users[0]).toMatchObject({
      bio: 'Full-stack dev',
      phoneNumber: '1234567890',
      gender: 'male',
    });
  });

  it('throws USER_EXISTS and does nothing else when the user already exists', async () => {
    await register(validInput, fakes.deps);
    fakes.calls.emails.length = 0;

    await expect(register(validInput, fakes.deps)).rejects.toMatchObject({
      code: 'USER_EXISTS',
      statusCode: 400,
    });

    expect(fakes.users).toHaveLength(1);
    expect(fakes.calls.emails).toHaveLength(0);
  });

  it('treats a duplicate username with a different email as existing', async () => {
    await register(validInput, fakes.deps);

    await expect(
      register({ ...validInput, email: 'other@example.com' }, fakes.deps),
    ).rejects.toMatchObject({ code: 'USER_EXISTS' });
  });

  it('throws an AuthError instance', async () => {
    await register(validInput, fakes.deps);
    await expect(register(validInput, fakes.deps)).rejects.toBeInstanceOf(AuthError);
  });

  it('throws USER_CREATION_FAILED when the adapter returns nothing', async () => {
    const f = makeFakes({ createReturnsNull: true });

    await expect(register(validInput, f.deps)).rejects.toMatchObject({
      code: 'USER_CREATION_FAILED',
      statusCode: 500,
    });
    expect(f.calls.emails).toHaveLength(0);
  });

  it('rolls back the user and throws EMAIL_SEND_FAILED when the email fails', async () => {
    const f = makeFakes({ emailFails: true });

    await expect(register(validInput, f.deps)).rejects.toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      statusCode: 500,
    });

    expect(f.calls.deleted).toEqual(['1']); // deleted the user that was just created
    expect(f.users).toHaveLength(0);
  });
});