import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Response } from 'express';
import { JWTPayload } from '../types/jwt.types';
import { Types } from 'mongoose';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const generateAccessToken = (user: { _id: Types.ObjectId | string; email: string; username: string }): string => {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, username: user.username, tokenType: 'access' } satisfies JWTPayload,
    process.env.JWT_SECRET!,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

export interface RefreshTokenData {
  rawToken: string;
  family: string;
  hashedToken: string;
  expiresAt: Date;
}

export const generateRefreshTokenData = (): RefreshTokenData => {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const family = crypto.randomUUID();
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  return { rawToken, family, hashedToken, expiresAt };
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  rawRefreshToken: string,
  sameSite: 'strict' | 'lax'
) => {
  res.cookie('token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken', { path: '/api/auth' });
};
