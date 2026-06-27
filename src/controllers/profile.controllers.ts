import { sendError, sendSuccess } from '../helpers/api.helpers';
import userModel from '../models/user.models';
import refreshTokenModel from '../models/refreshToken.models';
import { Request, Response } from 'express';
import { PasswordChangeRequest, ProfileUpdateRequest } from '../types/auth.types';
import bcrypt from 'bcryptjs';
import { logAuditEvent } from '../helpers/audit.helpers';

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await userModel.findById(req.user?.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }
    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, userWithoutPassword, 'Profile fetched successfully', 200);
  } catch (error) {
    console.error('Get profile error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const updatePassword = async (
  req: Request<{}, {}, PasswordChangeRequest>,
  res: Response
) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await userModel.findById(req.user?.id);
    if (!user) {
      await logAuditEvent({
        userId: req.user.id,
        action: 'password_change',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'User not found' },
      });
      return sendError(res, 'User not found', 404);
    }

    if (user.provider !== 'local') {
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'password_change',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Social login account', provider: user.provider },
      });
      return sendError(res, 'Cannot change password for social login accounts', 400);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password || '');
    if (!isPasswordValid) {
      await logAuditEvent({
        userId: user._id.toString(),
        action: 'password_change',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Incorrect current password' },
      });
      return sendError(res, 'Current password is incorrect', 400);
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.loginAttempts = 0;
    user.lockoutUntil = null;
    await user.save();

    await refreshTokenModel.deleteMany({ user: user._id });

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'password_change',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, userWithoutPassword, 'Password updated successfully', 200);
  } catch (error) {
    console.error('Update password error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const updateProfile = async (req: Request<{}, {}, ProfileUpdateRequest>, res: Response) => {
  try {
    const { username, bio, phoneNumber, gender } = req.body;
    const user = await userModel.findById(req.user?.id);
    if (!user) {
      await logAuditEvent({
        userId: req.user.id,
        action: 'profile_update',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'User not found' },
      });
      return sendError(res, 'User not found', 404);
    }

    if (username !== undefined) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (gender !== undefined) user.gender = gender;

    await user.save();

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'profile_update',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, userWithoutPassword, 'Profile updated successfully', 200);
  } catch (error: unknown) {
    const mongoError = error as Record<string, unknown>;
    if (mongoError?.code === 11000) {
      const keyPattern = mongoError.keyPattern as Record<string, unknown> || {};
      const field = Object.keys(keyPattern)[0] || 'field';
      await logAuditEvent({
        userId: req.user?.id,
        action: 'profile_update',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: `${field} is already taken` },
      });
      return sendError(res, `${field} is already taken`, 400);
    }
    console.error('Update profile error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const user = await userModel.findById(req.user?.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    await refreshTokenModel.deleteMany({ user: user._id });

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'account_deletion',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await user.deleteOne();
    return sendSuccess(res, null, 'Account deleted successfully', 200);
  } catch (error) {
    console.error('Delete account error:', error);
    return sendError(res, 'Internal server error', 500);
  }
};
