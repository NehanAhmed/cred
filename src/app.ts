import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import passport from './services/passport';
import authRoutes from './routes/auth.routes';
import profileRoutes from './routes/profile.routes';
import oauthRoutes from './routes/oauth.routes';
import healthRoutes from './routes/health.routes';
import auditRoutes from './routes/audit.routes';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { config } from 'dotenv';

config();

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'CLIENT_URL', 'BACKEND_URL', 'CORS_ORIGIN', 'NODE_ENV'];
for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const app = express();

app.set('trust proxy', 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts, please try again later.',
});

const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many profile requests, please try again later.',
});

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(passport.initialize());

app.use('/api/health', healthRoutes);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', authLimiter, oauthRoutes);
app.use('/api/profile', profileLimiter, profileRoutes);
app.use('/api/profile', profileLimiter, auditRoutes);

export default app;
