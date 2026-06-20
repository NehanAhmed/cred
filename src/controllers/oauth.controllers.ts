import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const oauthCallback = (req: Request, res: Response) => {
  const user = req.user as Record<string, unknown>;

  const token = jwt.sign(
    { id: user._id, email: user.email, username: user.username },
    process.env.JWT_SECRET!,
    { expiresIn: '1d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.redirect(`${process.env.CLIENT_URL}/auth/callback`);
};
