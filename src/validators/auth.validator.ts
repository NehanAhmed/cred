import z from "zod";

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