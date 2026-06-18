import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authControllers from '../../controllers/auth.controllers';
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

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
  }));

  app.post('/api/auth', validate(registerSchema), authControllers.register);
  app.post('/api/auth/login', validate(loginSchema), authControllers.login);
  app.post('/api/auth/logout', authMiddleware, authControllers.logout);
  app.get('/api/auth/verify-email/:token', authControllers.verifyEmail);
  app.post(
    '/api/auth/forgot-password',
    validate(passwordForgotSchema),
    authControllers.forgotPassword
  );
  app.post(
    '/api/auth/reset-password/:token',
    validate(passwordResetSchema),
    authControllers.resetPassword
  );

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
