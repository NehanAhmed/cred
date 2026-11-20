import { z } from "zod"
import { genderSchema, usernameSchema } from "./common"

export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  bio: z.string().min(3).max(200).optional(),
  phoneNumber: z.string().min(10).max(15).optional(),
  gender: genderSchema,
})

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
