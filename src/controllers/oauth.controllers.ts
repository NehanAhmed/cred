import { Request, Response } from 'express';
import { Types } from 'mongoose';
import refreshTokenModel from '../models/refreshToken.models';
import userModel from '../models/user.models';
import { generateAccessToken, generateRefreshTokenData } from '../helpers/token.helpers';
import { logAuditEvent } from '../helpers/audit.helpers';

interface OAuthUser {
  _id: Types.ObjectId;
  email: string;
  username: string;
  provider: 'google' | 'github';
}

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

    const user = req.user as unknown as OAuthUser;

    if (Types.ObjectId.isValid(user._id.toString())) {
      await userModel.findByIdAndUpdate(user._id, {
        lastLogin: new Date(),
        lastIp: req.ip,
      });
    }

    const accessToken = generateAccessToken(user);
    const rtData = generateRefreshTokenData();

    await refreshTokenModel.create({
      token: rtData.hashedToken,
      user: user._id,
      family: rtData.family,
      expiresAt: rtData.expiresAt,
    });

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', rtData.rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await logAuditEvent({
      userId: user._id.toString(),
      action: 'oauth_login',
      status: 'success',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      provider: user.provider,
    });

    res.redirect(`${process.env.CLIENT_URL}/auth/callback`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }
};
