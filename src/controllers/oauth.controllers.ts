import { Request, Response } from 'express';
import { Types } from 'mongoose';
import refreshTokenModel from '../models/refreshToken.models';
import { generateAccessToken, generateRefreshTokenData } from '../helpers/token.helpers';

interface OAuthUser {
  _id: Types.ObjectId;
  email: string;
  username: string;
}

export const oauthCallback = async (req: Request, res: Response) => {
  try {
    const user = req.user as unknown as OAuthUser;

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

    res.redirect(`${process.env.CLIENT_URL}/auth/callback`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
  }
};
