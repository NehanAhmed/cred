import userModel from '../models/user.models';
import { Request, Response } from 'express';
import { LoginRequest, RegisterRequest } from '../types/auth.types';
import { sendError, sendSuccess } from '../helpers/api.helpers';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sendEmailVerification, sendPasswordReset } from '../helpers/email.helpers';

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

    if (user.provider !== 'local') {
      return sendError(res, `This account uses ${user.provider} login. Please sign in with ${user.provider}.`, 400);
    }

    if (!user.isVerified) {
      return sendError(res, 'Please verify your email first', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password!);
    if (!isPasswordValid) {
      return sendError(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, username: user.username },
      process.env.JWT_SECRET!,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
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
    res.clearCookie('token');
    return sendSuccess(res, null, 'Logged out successfully', 200);
  } catch (error) {
    console.error('Logout error:', error);
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
    const { email } = req.body;
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

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return sendSuccess(res, null, 'Password reset successfully', 200);
  } catch (error) {
    console.error('Reset password error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};
