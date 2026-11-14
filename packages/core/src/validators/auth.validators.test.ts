import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  passwordForgotSchema,
  passwordResetSchema,
  profileSchema,
  passwordChangeSchema,
} from './auth.validators.js';

const validRegistration = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'Password123',
};

describe('registerSchema', () => {
  it('accepts a valid registration', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it('rejects a missing username', () => {
    const { username: _, ...rest } = validRegistration;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a short username (< 3)', () => {
    expect(registerSchema.safeParse({ ...validRegistration, username: 'ab' }).success).toBe(false);
  });

  it('rejects a long username (> 30)', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, username: 'a'.repeat(31) }).success,
    ).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(registerSchema.safeParse({ ...validRegistration, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a short password (< 8)', () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: 'Ab1' }).success).toBe(false);
  });

  it('rejects a password without an uppercase letter', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'password123' }).success,
    ).toBe(false);
  });

  it('rejects a password without a digit', () => {
    expect(
      registerSchema.safeParse({ ...validRegistration, password: 'Passworddd' }).success,
    ).toBe(false);
  });

  it('rejects an invalid gender', () => {
    expect(registerSchema.safeParse({ ...validRegistration, gender: 'alien' }).success).toBe(false);
  });

  it('accepts optional profile fields and strips unknown ones', () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      bio: 'A short bio',
      phoneNumber: '1234567890',
      gender: 'male',
      role: 'admin',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('role');
  });
});

describe('loginSchema', () => {
  it('accepts email + password', () => {
    expect(loginSchema.safeParse({ email: 'test@example.com', password: 'x' }).success).toBe(true);
  });

  it('accepts username + password', () => {
    expect(loginSchema.safeParse({ username: 'testuser', password: 'x' }).success).toBe(true);
  });

  it('rejects missing both email and username', () => {
    expect(loginSchema.safeParse({ password: 'x' }).success).toBe(false);
  });

  it('rejects a missing password', () => {
    expect(loginSchema.safeParse({ email: 'test@example.com' }).success).toBe(false);
  });
});

describe('passwordForgotSchema', () => {
  it('accepts a valid email', () => {
    expect(passwordForgotSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
  });

  it('rejects an invalid email format', () => {
    expect(passwordForgotSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a missing email', () => {
    expect(passwordForgotSchema.safeParse({}).success).toBe(false);
  });
});

describe('passwordResetSchema', () => {
  it('accepts a strong password', () => {
    expect(passwordResetSchema.safeParse({ password: 'Password123' }).success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(passwordResetSchema.safeParse({ password: 'Ab1' }).success).toBe(false);
  });

  it('rejects a password without an uppercase letter', () => {
    expect(passwordResetSchema.safeParse({ password: 'password123' }).success).toBe(false);
  });

  it('rejects a password without a digit', () => {
    expect(passwordResetSchema.safeParse({ password: 'Passworddd' }).success).toBe(false);
  });

  it('rejects a missing password', () => {
    expect(passwordResetSchema.safeParse({}).success).toBe(false);
  });
});

describe('profileSchema', () => {
  it('accepts valid partial updates', () => {
    expect(
      profileSchema.safeParse({
        username: 'newname',
        bio: 'Updated bio text',
        phoneNumber: '0987654321',
        gender: 'female',
      }).success,
    ).toBe(true);
  });

  it('accepts an empty update (all fields optional)', () => {
    expect(profileSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a short username (< 3)', () => {
    expect(profileSchema.safeParse({ username: 'ab' }).success).toBe(false);
  });

  it('rejects a long username (> 30)', () => {
    expect(profileSchema.safeParse({ username: 'a'.repeat(31) }).success).toBe(false);
  });

  it('rejects an invalid gender', () => {
    expect(profileSchema.safeParse({ gender: 'alien' }).success).toBe(false);
  });

  it('rejects a phone number outside 10-15 digits', () => {
    expect(profileSchema.safeParse({ phoneNumber: '12345' }).success).toBe(false);
    expect(profileSchema.safeParse({ phoneNumber: '12345678901234567890' }).success).toBe(false);
  });

  it('rejects a bio shorter than 3 characters', () => {
    expect(profileSchema.safeParse({ bio: 'ab' }).success).toBe(false);
  });
});

describe('passwordChangeSchema', () => {
  it('accepts current + new password', () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: 'CurrentPass1', newPassword: 'NewPassword1' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing currentPassword', () => {
    expect(passwordChangeSchema.safeParse({ newPassword: 'NewPassword1' }).success).toBe(false);
  });

  it('rejects a weak newPassword', () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: 'CurrentPass1', newPassword: 'Ab1' }).success,
    ).toBe(false);
  });
});
