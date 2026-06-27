import userModel from '../models/user.models';
import refreshTokenModel from '../models/refreshToken.models';
import { Request, Response } from 'express';
import { LoginRequest, RegisterRequest } from '../types/auth.types';
import { sendError, sendSuccess } from '../helpers/api.helpers';
import { generateAccessToken, generateRefreshTokenData, hashToken } from '../helpers/token.helpers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendEmailVerification, sendPasswordReset } from '../helpers/email.helpers';

const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const setAuthCookies = (
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

const clearAuthCookies = (res: Response) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken', { path: '/api/auth' });
};

export const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { username, email, password, bio, phoneNumber, gender } = req.body;

    const existingUser = await userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (existingUser) {
      return sendError(res, 'User already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await userModel.create({
      username,
      email,
      password: hashedPassword,
      bio,
      phoneNumber,
      gender,
      verificationToken: hashToken,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
      await sendEmailVerification(user.email, rawToken);
    } catch {
      await userModel.deleteOne({ _id: user._id });
      return sendError(res, 'Failed to send verification email. Please try again.', 500);
    }

    return sendSuccess(res, {}, 'User registered successfully. Verify your email first.', 201);
  } catch (error) {
    return sendError(res, 'Internal server error', 500);
  }
};

export const login = async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const { email, password, username } = req.body;
    const user = await userModel.findOne({
      $or: [{ email }, { username }],
    });

    if (!user) {
      return sendError(res, 'Invalid credentials', 401);
    }
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return sendError(res, 'Account locked due to too many failed login attempts. Please try again later.', 401);
    }
    if (user.provider !== 'local') {
      return sendError(res, `This account uses ${user.provider} login. Please sign in with ${user.provider}.`, 400);
    }

    if (!user.isVerified) {
      return sendError(res, 'Please verify your email first', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockoutUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await user.save();
      return sendError(res, 'Invalid credentials', 401);
    }
    user.loginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    const accessToken = generateAccessToken(user);
    const rtData = generateRefreshTokenData();

    await refreshTokenModel.create({
      token: rtData.hashedToken,
      user: user._id,
      family: rtData.family,
      expiresAt: rtData.expiresAt,
    });

    setAuthCookies(res, accessToken, rtData.rawToken, 'strict');

    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, { user: userWithoutPassword }, 'Logged in successfully', 200);
  } catch (error) {
    console.error('Login error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const rawToken = req.cookies.refreshToken;
    if (rawToken) {
      const hashed = hashToken(rawToken);
      await refreshTokenModel.deleteOne({ token: hashed });
    }

    clearAuthCookies(res);
    return sendSuccess(res, null, 'Logged out successfully', 200);
  } catch (error) {
    console.error('Logout error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const rawToken = req.cookies.refreshToken;
    if (!rawToken) {
      return sendError(res, 'Refresh token not found', 401);
    }

    const hashed = hashToken(rawToken);
    const storedToken = await refreshTokenModel.findOne({ token: hashed });

    if (!storedToken) {
      clearAuthCookies(res);
      return sendError(res, 'Invalid refresh token', 401);
    }

    if (storedToken.expiresAt < new Date()) {
      await storedToken.deleteOne();
      clearAuthCookies(res);
      return sendError(res, 'Refresh token expired', 401);
    }

    const user = await userModel.findById(storedToken.user);
    if (!user) {
      await storedToken.deleteOne();
      clearAuthCookies(res);
      return sendError(res, 'User not found', 401);
    }

    const reused = await refreshTokenModel.findOne({
      user: storedToken.user,
      family: storedToken.family,
      _id: { $ne: storedToken._id },
    });

    if (reused) {
      await refreshTokenModel.deleteMany({ user: storedToken.user, family: storedToken.family });
      clearAuthCookies(res);
      return sendError(res, 'Refresh token reuse detected. All sessions revoked.', 401);
    }

    await storedToken.deleteOne();

    const rtData = generateRefreshTokenData();

    await refreshTokenModel.create({
      token: rtData.hashedToken,
      user: user._id,
      family: rtData.family,
      expiresAt: rtData.expiresAt,
    });

    const accessToken = generateAccessToken(user);
    setAuthCookies(res, accessToken, rtData.rawToken, 'strict');

    return sendSuccess(res, null, 'Token refreshed successfully', 200);
  } catch (error) {
    console.error('Refresh token error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const verifyEmail = async (req: Request<{ token: string }>, res: Response) => {
  try {
    const { token } = req.params;
    const hashToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await userModel.findOne({
      verificationToken: hashToken,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?verified=false`);
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    return res.redirect(`${process.env.CLIENT_URL}/login?verified=true`);
  } catch (error) {
    console.error('Email verification error:', error);
    return res.redirect(`${process.env.CLIENT_URL}/login?verified=false`);
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail } = req.body;
    if (typeof rawEmail !== 'string') {
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    const email = rawEmail.trim().toLowerCase();
    if (!email) {
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    const user = await userModel.findOne({ email });

    if (!user) {
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    if (user.provider !== 'local') {
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashToken = crypto.createHash('sha256').update(token).digest('hex');

    user.resetPasswordToken = hashToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();

    try {
      await sendPasswordReset(user.email, token);
    } catch {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
    }

    return sendSuccess(res, null, 'If an account exists, a password reset link has been sent', 200);
  } catch (error) {
    console.error('Forgot password error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const resetPassword = async (
  req: Request<{ token: string }, {}, { password: string }>,
  res: Response
) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const hashToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await userModel.findOne({
      resetPasswordToken: hashToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return sendError(res, 'Invalid or expired token', 400);
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return sendSuccess(res, null, 'Password reset successfully', 200);
  } catch (error) {
    console.error('Reset password error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};
