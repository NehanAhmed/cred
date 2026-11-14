import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { JWTPayload, RefreshTokenData } from '../types/auth.types.js';
import { AuthError } from '../errors/auth-error.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_HASH_ROUNDS = 10;

export interface GeneratedToken {
  rawToken: string;
  hashedToken: string;
  lookupId: string;
}

export interface ParsedToken {
  lookupId: string;
  secret: string;
}

/**
 * Splits a raw token into its public lookup id and secret. The lookup id is
 * only used to find the stored record; bcrypt protects the secret.
 */
export const parseToken = (rawToken: string): ParsedToken | null => {
  const separator = rawToken.indexOf('.');
  if (separator <= 0 || separator === rawToken.length - 1) return null;
  return {
    lookupId: rawToken.slice(0, separator),
    secret: rawToken.slice(separator + 1),
  };
};

export const parseTokenLookupId = (rawToken: string): string | null => {
  return parseToken(rawToken)?.lookupId ?? null;
};

/**
 * Hashes a token with bcrypt. Unlike a plain digest, a bcrypt hash is salted,
 * so callers must use `verifyToken` rather than comparing hashes for equality.
 */
export const hashToken = async (token: string): Promise<string> => {
  return bcrypt.hash(token, TOKEN_HASH_ROUNDS);
};

export const verifyToken = async (token: string, hashedToken: string): Promise<boolean> => {
  return bcrypt.compare(token, hashedToken);
};

/**
 * Verifies the secret portion of a raw token against a stored bcrypt hash.
 * Returns false for malformed tokens instead of throwing.
 */
export const verifyRawToken = async (rawToken: string, hashedToken: string): Promise<boolean> => {
  const parsed = parseToken(rawToken);
  return parsed ? verifyToken(parsed.secret, hashedToken) : false;
};

export const generateToken = async (secretBytes = 32): Promise<GeneratedToken> => {
  const lookupId = crypto.randomBytes(16).toString('hex');
  const secret = crypto.randomBytes(secretBytes).toString('hex');
  const rawToken = `${lookupId}.${secret}`;
  // Hash only the secret: bcrypt truncates inputs at 72 bytes, while the full
  // raw token is longer. The random lookup id already identifies the record.
  const hashedToken = await hashToken(secret);

  return { rawToken, hashedToken, lookupId };
};

export const generateRefreshTokenData = async (): Promise<RefreshTokenData> => {
  const { rawToken, hashedToken, lookupId } = await generateToken(32);
  const family = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  return { rawToken, family, hashedToken, expiresAt, lookupId };
};


export const generateAccessToken = (user: { id: string | string; email: string; username: string },secret: string): string => {
  return jwt.sign(
    { id: user.id.toString(), email: user.email, username: user.username, tokenType: 'access' } satisfies JWTPayload,
    secret  ,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Verifies an access token and returns its payload.
 * Throws `AuthError('INVALID_TOKEN')` when the token is missing, malformed,
 * expired, or is not an access token.
 */
export const verifyAccessToken = (token: string, secret: string): JWTPayload => {
  if (!token) {
    throw new AuthError('INVALID_TOKEN', 'Unauthorized', 401);
  }

  try {
    const decoded = jwt.verify(token, secret) as JWTPayload;

    if (decoded.tokenType !== 'access' || !decoded.id || !decoded.email || !decoded.username) {
      throw new AuthError('INVALID_TOKEN', 'Invalid token', 401);
    }

    return decoded;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('INVALID_TOKEN', 'Invalid token', 401);
  }
};
