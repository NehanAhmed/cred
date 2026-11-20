import { apiCall, type ApiResult } from "@/lib/api-client"
import type { UserData } from "./auth"

export type ProfileUpdateInput = {
  username?: string
  bio?: string
  phoneNumber?: string
  gender?: "male" | "female" | "other"
}

export type ChangePasswordInput = {
  currentPassword: string
  newPassword: string
}

export function getProfile(): Promise<ApiResult<UserData>> {
  return apiCall<UserData>("/api/profile/me")
}

export function updateProfile(
  input: ProfileUpdateInput
): Promise<ApiResult<UserData>> {
  return apiCall<UserData>("/api/profile/me", {
    method: "PUT",
    body: input,
  })
}

export function deleteAccount(): Promise<ApiResult<null>> {
  return apiCall<null>("/api/profile/me", { method: "DELETE" })
}

export function changePassword(
  input: ChangePasswordInput
): Promise<ApiResult<UserData>> {
  return apiCall<UserData>("/api/profile/me/change-password", {
    method: "POST",
    body: input,
  })
}
