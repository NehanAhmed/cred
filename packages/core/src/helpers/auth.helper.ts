import jwt from 'jsonwebtoken';
import { JWTPayload, RefreshTokenData } from '../types/auth.types.js';
import crypto from 'crypto';
const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const generateRefreshTokenData = (): RefreshTokenData => {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const family = crypto.randomUUID();
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  return { rawToken, family, hashedToken, expiresAt };
};


export const generateAccessToken = (user: { id: string | string; email: string; username: string },secret: string): string => {
  return jwt.sign(
    { id: user.id.toString(), email: user.email, username: user.username, tokenType: 'access' } satisfies JWTPayload,
    secret  ,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};