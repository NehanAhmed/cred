export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  bio?: string;
  phoneNumber?: string;
  gender: string;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface PasswordForgotRequest {
  email: string;
}

export interface PasswordResetRequest {
  password: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ProfileUpdateRequest {
  username?: string;
  bio?: string;
  phoneNumber?: string;
  gender?: string;
}
