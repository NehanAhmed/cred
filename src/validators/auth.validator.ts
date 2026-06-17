import * as z from "zod";

export const loginSchema = z.object({
  email: z.email().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
}).refine(d => d.email || d.username, { message: "Email or username is required" });

export const passwordForgotSchema = z.object({
  email: z.email(),
});

export const passwordResetSchema = z.object({
  password: z.string().min(8).regex(/[A-Z]/).regex(/\d/),
});

export const profileSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  bio: z.string().min(3).max(200).optional(),
  phoneNumber: z.string().min(10).max(15).optional(),
  gender: z.enum(["male", "female", "other"]).nullish(),
})

export const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/\d/),
  bio: z.string().optional(),
  phoneNumber: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).regex(/[A-Z]/).regex(/\d/),
})
