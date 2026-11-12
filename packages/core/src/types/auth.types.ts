export interface User extends RegisterRequest {
  id:string;
  isVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpires: Date | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  googleId?: string;
  githubId?: string;
  provider: 'local' | 'github' | 'google';
  avatar: string | null;
  loginAttempts: number;
  lockoutUntil: Date | null;
  lastLogin: Date | null;
  lastIp: string | null;
  createdAt: Date;
  updatedAt: Date;
}
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
