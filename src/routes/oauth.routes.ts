import express, { NextFunction, Request, Response } from 'express';
import passport from '../services/passport';
import { oauthCallback } from '../controllers/oauth.controllers';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const router = express.Router();

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many OAuth attempts, please try again later.',
});

router.use(oauthLimiter);

const validateOAuthState = (req: Request, res: Response, next: NextFunction) => {
  const cookieState = req.cookies?.oauth_state;
  const queryState = req.query.state as string | undefined;

  if (!cookieState || !queryState || cookieState !== queryState) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_state_mismatch`);
  }

  res.clearCookie('oauth_state');
  next();
};

router.get('/google', (req, res, next) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state })(req, res, next);
});

router.get(
  '/google/callback',
  validateOAuthState,
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed`,
    session: false,
  }),
  oauthCallback
);

router.get('/github', (req, res, next) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });
  passport.authenticate('github', { scope: ['user:email'], session: false, state })(req, res, next);
});

router.get(
  '/github/callback',
  validateOAuthState,
  passport.authenticate('github', {
    failureRedirect: `${process.env.CLIENT_URL}/login?error=github_auth_failed`,
    session: false,
  }),
  oauthCallback
);

export default router;
