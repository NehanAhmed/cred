"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  updateProfile,
  deleteAccount,
  changePassword,
  type ProfileUpdateInput,
  type ChangePasswordInput,
} from "@/lib/api/profile"
import type { ApiResult } from "@/lib/api-client"

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProfileUpdateInput) => updateProfile(input),
    onSuccess: (result) => {
      if (result.kind === "success") {
        queryClient.invalidateQueries({ queryKey: ["profile"] })
      }
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
  })
}

export type ProfileMutationResult<T> = ApiResult<T>
