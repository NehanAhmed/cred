import userModel from '../models/user.models';
import refreshTokenModel from '../models/refreshToken.models';
import { Request, Response } from 'express';
import { LoginRequest, RegisterRequest } from '../types/auth.types';
import { sendError, sendSuccess } from '../helpers/api.helpers';
import { generateAccessToken, generateRefreshTokenData, hashToken, setAuthCookies, clearAuthCookies } from '../helpers/token.helpers';
import { logAuditEvent } from '../helpers/audit.helpers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendEmailVerification, sendPasswordReset } from '../helpers/email.helpers';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const { username, email, password, bio, phoneNumber, gender } = req.body;

    const existingUser = await userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (existingUser) {
      await logAuditEvent({
        action: 'register',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'User already exists', email, username },
      });
      return sendError(res, 'User already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await userModel.create({
      username,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      bio,
      phoneNumber,
      gender,
      verificationToken: hashedToken,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    try {
      await sendEmailVerification(user.email, rawToken);
    } catch {
      await userModel.deleteOne({ _id: user._id });
      await logAuditEvent({
        action: 'register',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Failed to send verification email', email },
      });
      return sendError(res, 'Failed to send verification email. Please try again.', 500);
    }

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'register',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

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
      await logAuditEvent({
        action: 'login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Invalid credentials' },
      });
      return sendError(res, 'Invalid credentials', 401);
    }
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Account locked' },
      });
      return sendError(res, 'Account locked due to too many failed login attempts. Please try again later.', 401);
    }
    if (user.provider !== 'local') {
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: `Account uses ${user.provider} login`, provider: user.provider },
      });
      return sendError(res, `This account uses ${user.provider} login. Please sign in with ${user.provider}.`, 400);
    }

    if (!user.isVerified) {
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Email not verified' },
      });
      return sendError(res, 'Please verify your email first', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      const updated = await userModel.findByIdAndUpdate(
        user._id,
        { $inc: { loginAttempts: 1 } },
        { returnDocument: 'after', fields: 'loginAttempts lockoutUntil' }
      );
      if (updated && updated.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        await userModel.updateOne(
          { _id: user._id, lockoutUntil: null },
          { $set: { lockoutUntil: new Date(Date.now() + LOCK_DURATION_MS) } }
        );
      }
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Invalid credentials', loginAttempts: updated?.loginAttempts ?? 0 },
      });
      return sendError(res, 'Invalid credentials', 401);
    }
    user.loginAttempts = 0;
    user.lockoutUntil = null;
    user.lastLogin = new Date();
    user.lastIp = req.ip;
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

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'login',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

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

    await logAuditEvent({
      userId: req.user!.id,
      action: 'logout',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

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
      await logAuditEvent({
        action: 'token_refresh',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Refresh token not found' },
      });
      return sendError(res, 'Refresh token not found', 401);
    }

    // Atomically consume the token — first caller wins
    const hashed = hashToken(rawToken);
    const consumedToken = await refreshTokenModel.findOneAndDelete({ token: hashed });

    if (!consumedToken) {
      clearAuthCookies(res);
      await logAuditEvent({
        action: 'token_refresh',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Invalid or already consumed refresh token' },
      });
      return sendError(res, 'Invalid refresh token', 401);
    }

    if (consumedToken.expiresAt < new Date()) {
      clearAuthCookies(res);
      await logAuditEvent({
        userId: consumedToken.user.toString(),
        action: 'token_refresh',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Refresh token expired' },
      });
      return sendError(res, 'Refresh token expired', 401);
    }

    // Check for reuse — if another token exists in the same family,
    // this token was already rotated (someone is replaying an old token)
    const reused = await refreshTokenModel.findOne({
      user: consumedToken.user,
      family: consumedToken.family,
    });

    if (reused) {
      await refreshTokenModel.deleteMany({ user: consumedToken.user, family: consumedToken.family });
      clearAuthCookies(res);
      await logAuditEvent({
        userId: consumedToken.user.toString(),
        action: 'token_refresh',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Refresh token reuse detected' },
      });
      return sendError(res, 'Refresh token reuse detected. All sessions revoked.', 401);
    }

    const user = await userModel.findById(consumedToken.user);
    if (!user) {
      clearAuthCookies(res);
      await logAuditEvent({
        action: 'token_refresh',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'User not found' },
      });
      return sendError(res, 'User not found', 401);
    }

    const rtData = generateRefreshTokenData();

    await refreshTokenModel.create({
      token: rtData.hashedToken,
      user: user._id,
      family: rtData.family,
      expiresAt: rtData.expiresAt,
    });

    const accessToken = generateAccessToken(user);
    setAuthCookies(res, accessToken, rtData.rawToken, 'strict');

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'token_refresh',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, null, 'Token refreshed successfully', 200);
  } catch (error) {
    console.error('Refresh token error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const verifyEmail = async (req: Request<{ token: string }>, res: Response) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await userModel.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      await logAuditEvent({
        action: 'email_verification',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Invalid or expired token' },
      });
      return res.redirect(`${process.env.CLIENT_URL}/login?verified=false`);
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    await user.save();

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'email_verification',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

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
      await logAuditEvent({
        action: 'password_reset_request',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'User not found', email },
      });
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    if (user.provider !== 'local') {
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'password_reset_request',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Social login account', provider: user.provider },
      });
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();

    try {
      await sendPasswordReset(user.email, token);
    } catch {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'password_reset_request',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Failed to send password reset email' },
      });
      return sendSuccess(
        res,
        null,
        'If an account exists, a password reset link has been sent',
        200
      );
    }

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'password_reset_request',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

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
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await userModel.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      await logAuditEvent({
        action: 'password_reset',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Invalid or expired token' },
      });
      return sendError(res, 'Invalid or expired token', 400);
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.loginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    await refreshTokenModel.deleteMany({ user: user._id });

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'password_reset',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, null, 'Password reset successfully', 200);
  } catch (error) {
    console.error('Reset password error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};
