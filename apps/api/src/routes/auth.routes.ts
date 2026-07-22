import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  logout,
  refresh,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controllers.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  passwordForgotSchema,
  passwordResetSchema
} from '@cred/shared';
import {
  loginLimiterConfig,
  registerLimiterConfig,
  forgotLimiterConfig,
  refreshLimiterConfig,
  verifyEmailLimiterConfig,
  resetPasswordLimiterConfig,
  logoutLimiterConfig,
} from '../config/rate-limiters.js';

const router = express.Router();

const loginLimiter = rateLimit({
  ...loginLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  ...registerLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotLimiter = rateLimit({
  ...forgotLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  ...refreshLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyEmailLimiter = rateLimit({
  ...verifyEmailLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  ...resetPasswordLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

const logoutLimiter = rateLimit({
  ...logoutLimiterConfig,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logoutLimiter, authMiddleware, logout);
router.post('/refresh', refreshLimiter, refresh);
router.get('/verify-email/:token', verifyEmailLimiter, verifyEmail);
router.post('/forgot-password', forgotLimiter, validate(passwordForgotSchema), forgotPassword);
router.post('/reset-password/:token', resetPasswordLimiter, validate(passwordResetSchema), resetPassword);

export default router;
