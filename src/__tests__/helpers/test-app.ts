import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from '../../controllers/auth.controllers';
import {
  getProfile,
  updateProfile,
  deleteAccount,
  updatePassword
} from '../../controllers/profile.controllers';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  registerSchema,
  loginSchema,
  passwordForgotSchema,
  passwordResetSchema,
  profileSchema,
  passwordChangeSchema
} from '../../validators/auth.validator';

export const createTestApp = () => {
  const app = express();

  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const passwordChangeRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const profileRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
  }));
  app.use('/api/auth', authRateLimiter);
  app.use('/api/profile', profileRateLimiter);

  app.post('/api/auth', validate(registerSchema), register);
  app.post('/api/auth/login', validate(loginSchema), login);
  app.post('/api/auth/logout', authMiddleware, logout);
  app.post('/api/auth/refresh', refresh);
  app.get('/api/auth/verify-email/:token', verifyEmail);
  app.post('/api/auth/forgot-password', validate(passwordForgotSchema), forgotPassword);
    passwordChangeRateLimiter,
  app.post('/api/auth/reset-password/:token', validate(passwordResetSchema), resetPassword);

  app.get('/api/profile/me', authMiddleware, getProfile);
  app.put('/api/profile/me', authMiddleware, validate(profileSchema), updateProfile);
  app.delete('/api/profile/me', authMiddleware, deleteAccount);
  app.post(
    '/api/profile/me/change-password',
    authMiddleware,
    validate(passwordChangeSchema),
    updatePassword
  );

  return app;
};
