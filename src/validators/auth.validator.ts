import * as z from 'zod';

const bioSchema = z.string().min(3).max(200).optional();
const phoneSchema = z.string().regex(/^\d{10,15}$/, 'Phone number must contain 10-15 digits').optional();
const genderSchema = z.enum(['male', 'female', 'other']).optional();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one digit');

export const loginSchema = z
  .object({
    email: z.email().optional(),
    username: z.string().optional(),
    password: z.string().min(1),
  })
  .refine((d) => d.email || d.username, { message: 'Email or username is required' });

export const passwordForgotSchema = z.object({
  email: z.email(),
});

export const passwordResetSchema = z.object({
  password: passwordSchema,
});

export const profileSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  bio: bioSchema,
  phoneNumber: phoneSchema,
  gender: genderSchema,
});

export const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.email(),
  password: passwordSchema,
  bio: bioSchema,
  phoneNumber: phoneSchema,
  gender: z.enum(['male', 'female', 'other']).optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
