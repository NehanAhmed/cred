/**
 * `@cred-kit/core` is the single home for the auth-facing request types; this file
 * only re-exports them so existing `@cred-kit/shared` consumers keep working.
 */
export type {
  RegisterRequest,
  LoginRequest,
  PasswordChangeRequest,
  ProfileUpdateRequest,
} from '@cred-kit/core';
