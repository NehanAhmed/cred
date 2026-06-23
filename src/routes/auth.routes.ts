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
  max: 5,
  message: 'Too many login attempts, please try again in 15 minutes.'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts, please try again in 60 minutes.'
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts, please try again in 60 minutes.'
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many refresh attempts, please try again in 15 minutes.'
});

router.post('/', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', authMiddleware, logout);
router.post('/refresh', refreshLimiter, refresh);
router.get('/verify-email/:token', verifyEmail);
router.post('/forgot-password', forgotLimiter, validate(passwordForgotSchema), forgotPassword);
router.post('/reset-password/:token', validate(passwordResetSchema), resetPassword);

export default router;
