import express from 'express';
import {
  getProfile,
  updateProfile,
  deleteAccount,
  updatePassword
} from '../controllers/profile.controllers.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { profileSchema, passwordChangeSchema } from '@cred/shared';
import { rateLimit } from 'express-rate-limit';

const profileUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many profile update attempts, please try again later.'
});

const router = express.Router();

router.get('/me', authMiddleware, getProfile);
router.put('/me', authMiddleware, profileUpdateLimiter, validate(profileSchema), updateProfile);
router.delete('/me', authMiddleware, deleteAccount);
router.post(
  '/me/change-password',
  authMiddleware,
  profileUpdateLimiter,
  validate(passwordChangeSchema),
  updatePassword
);
export default router;
