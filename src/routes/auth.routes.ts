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
} from '../controllers/auth.controllers';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  registerSchema,
  loginSchema,
  passwordForgotSchema,
  passwordResetSchema
} from '../validators/auth.validator';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, please try again in 15 minutes.'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many registration attempts, please try again in 60 minutes.'
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many password reset attempts, please try again in 60 minutes.'
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many refresh attempts, please try again in 15 minutes.'
});

const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many verification attempts, please try again later.'
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many password reset attempts, please try again later.'
});

const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many logout attempts, please try again later.'
});

router.post('/', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', authMiddleware, logoutLimiter, logout);
router.post('/refresh', refreshLimiter, refresh);
router.get('/verify-email/:token', verifyEmailLimiter, verifyEmail);
router.post('/forgot-password', forgotLimiter, validate(passwordForgotSchema), forgotPassword);
router.post('/reset-password/:token', resetPasswordLimiter, validate(passwordResetSchema), resetPassword);

export default router;
