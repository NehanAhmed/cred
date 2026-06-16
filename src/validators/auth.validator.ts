import * as z from "zod";

export const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/\d/),
  bio: z.string().optional(),
  phoneNumber: z.number().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
});

export const loginSchema = z.object({
  email: z.email().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
}).refine(d => d.email || d.username, { message: "Email or username is required" });


export const profileSchema = z.object({
  username:z.string().min(3,"Username must be at least 3 characters").max(30).optional(),
  bio: z.string().min(3,"Bio must be at least 3 characters").max(200).optional(),
  phoneNumber: z.number().min(10,"Phone number must be at least 10 digits").max(15,"Phone number must be at most 15 digits").optional(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
})

export const passwordSchema = z.object({
  newPassword: z.string().min(8).regex(/[A-Z]/).regex(/\d/),
  currentPassword:z.string(),
})