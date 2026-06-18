import { sendError, sendSuccess } from '../helpers/api.helpers';
import userModel from '../models/user.models';
import { Request, Response } from 'express';
import { PasswordChangeRequest, ProfileUpdateRequest } from '../types/auth.types';
import bcrypt from 'bcryptjs';
export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }
    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, userWithoutPassword, 'Profile fetched successfully', 200);
  } catch (error) {
    console.log(error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const updatePassword = async (
  req: Request<{}, {}, PasswordChangeRequest>,
  res: Response
) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return sendError(res, 'Current password is incorrect', 400);
    }
    const newHashedPassword: string = await bcrypt.hash(newPassword, 10);
    await userModel.updateOne({ _id: req.user.id }, { password: newHashedPassword });

    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, userWithoutPassword, 'Password updated successfully', 200);
  } catch (error) {
    console.log(error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const updateProfile = async (req: Request<{}, {}, ProfileUpdateRequest>, res: Response) => {
  try {
    const { username, bio, phoneNumber, gender } = req.body;
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }
    if (username) user.username = username;
    if (bio) user.bio = bio;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (gender) user.gender = gender;
    await user.save();
    const { password: _, ...userWithoutPassword } = user.toObject();
    return sendSuccess(res, userWithoutPassword, 'Profile updated successfully', 200);
  } catch (error) {
    console.log(error);
    return sendError(res, 'Internal server error', 500);
  }
};

export const deleteAccount = async (req: Request, res: Response) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return sendError(res, 'User not found', 404);
    }
    await user.deleteOne();
    return sendSuccess(res, null, 'Account deleted successfully', 200);
  } catch (error) {
    console.log(error);
    return sendError(res, 'Internal server error', 500);
  }
};
