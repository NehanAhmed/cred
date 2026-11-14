export interface User extends RegisterRequest {
  id: string;
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

export type RegisterRequest = {
  username: string;
  email: string;
  password: string;
  bio?: string;
  phoneNumber?: string;
  gender?: 'male' | 'female' | 'other';
}

export type LoginRequest = { password: string } & (
  | { email: string; username?: string }
  | { email?: string; username: string }
);
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
export interface JWTPayload {
  id: string;
  email: string;
  username: string;
  tokenType: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenData {
  rawToken: string;
  family: string;
  hashedToken: string;
  expiresAt: Date;
}

export interface RefreshToken {
  
  token:string;
  user:string
  family:string
  expiresAt:Date
  consumed:boolean
}