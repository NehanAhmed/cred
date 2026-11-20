import { apiCall, type ApiResult } from "@/lib/api-client"

export type UserData = {
  _id: string
  username: string
  email: string
  bio: string | null
  phoneNumber: string | null
  gender: string | null
  isVerified: boolean
  verificationToken: string | null
  verificationTokenExpires: string | null
  resetPasswordToken: string | null
  resetPasswordExpires: string | null
  createdAt: string
  updatedAt: string
}

export type RegisterInput = {
  username: string
  email: string
  password: string
  bio?: string
  phoneNumber?: string
  gender?: "male" | "female" | "other"
}

export type LoginInput = {
  email?: string
  username?: string
  password: string
}

export type LoginData = {
  user: UserData
}

export function register(
  input: RegisterInput
): Promise<ApiResult<Record<string, never>>> {
  return apiCall<Record<string, never>>("/api/auth", {
    method: "POST",
    body: input,
  })
}

export function login(input: LoginInput): Promise<ApiResult<LoginData>> {
  return apiCall<LoginData>("/api/auth/login", {
    method: "POST",
    body: input,
  })
}

export function logout(): Promise<ApiResult<null>> {
  return apiCall<null>("/api/auth/logout", { method: "POST" })
}

export function refreshToken(): Promise<ApiResult<null>> {
  return apiCall<null>("/api/auth/refresh", { method: "POST" })
}

export function verifyEmail(token: string): Promise<ApiResult<never>> {
  return apiCall<never>(`/api/auth/verify-email/${encodeURIComponent(token)}`, {
    method: "GET",
  })
}

export function forgotPassword(email: string): Promise<ApiResult<null>> {
  return apiCall<null>("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
  })
}

export function resetPassword(
  token: string,
  password: string
): Promise<ApiResult<null>> {
  return apiCall<null>(`/api/auth/reset-password/${token}`, {
    method: "POST",
    body: { password },
  })
}
