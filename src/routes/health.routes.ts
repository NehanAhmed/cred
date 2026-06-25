import express from 'express';
import rateLimit from 'express-rate-limit';
import { healthCheck } from '../controllers/health.controller';

const router = express.Router();

const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 30,
  message: 'Too many health check requests, please try again later.',
});

router.get('/', healthLimiter, healthCheck);

export default router;
