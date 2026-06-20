export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  bio?: string;
  phoneNumber?: string;
  gender?: 'male' | 'female' | 'other';
}

export interface LoginRequest {
  email?: string;
  username?: string;
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
  gender?: 'male' | 'female' | 'other';
}
