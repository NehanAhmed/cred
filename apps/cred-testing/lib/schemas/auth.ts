import { z } from "zod"
import {
  emailSchema,
  genderSchema,
  passwordSchema,
  usernameSchema,
} from "./common"

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  bio: z.string().optional(),
  phoneNumber: z.string().optional(),
  gender: genderSchema,
})

export const loginSchema = z
  .object({
    email: emailSchema.optional(),
    username: z.string().optional(),
    password: z.string().min(1, "Password is required"),
  })
  .refine(
    (data) => data.email || data.username,
    "At least one of email or username is required"
  )

export const passwordForgotSchema = z.object({
  email: emailSchema,
})

export const passwordResetSchema = z.object({
  password: passwordSchema,
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type PasswordForgotInput = z.infer<typeof passwordForgotSchema>
export type PasswordResetInput = z.infer<typeof passwordResetSchema>
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>
