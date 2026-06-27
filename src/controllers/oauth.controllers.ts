import { Request, Response } from 'express';
import { Types } from 'mongoose';
import refreshTokenModel from '../models/refreshToken.models';
import userModel from '../models/user.models';
import { generateAccessToken, generateRefreshTokenData, setAuthCookies } from '../helpers/token.helpers';
import { logAuditEvent } from '../helpers/audit.helpers';

export const oauthCallback = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      await logAuditEvent({
        action: 'oauth_login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'No user returned from OAuth provider' },
      });
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }

    const userId = req.user._id ?? req.user.id;
    if (!userId) {
      await logAuditEvent({
        action: 'oauth_login',
        status: 'failure',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { reason: 'Invalid user object from OAuth provider' },
      });
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }

    if (Types.ObjectId.isValid(userId.toString())) {
      await userModel.findByIdAndUpdate(userId, {
        lastLogin: new Date(),
        lastIp: req.ip,
      });
    }

    const accessToken = generateAccessToken({ _id: userId, email: req.user.email, username: req.user.username });
    const rtData = generateRefreshTokenData();

    await refreshTokenModel.create({
      token: rtData.hashedToken,
      user: userId,
      family: rtData.family,
      expiresAt: rtData.expiresAt,
    });

    setAuthCookies(res, accessToken, rtData.rawToken, 'lax');

    await logAuditEvent({
      userId: userId.toString(),
      action: 'oauth_login',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      provider: req.user.provider,
    });

    res.redirect(`${process.env.CLIENT_URL}/auth/callback`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }
};
