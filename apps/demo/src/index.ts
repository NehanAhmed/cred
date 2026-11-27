import { credExpress } from '@cred-kit/express';
import { configDotenv } from 'dotenv';
import express from 'express';

configDotenv({ path: '.env.local' });

const readRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const readPort = (): number => {
  const raw = process.env.PORT;

  if (raw === undefined || raw.trim() === '') return 5000;

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`Invalid PORT: ${raw}. Must be an integer between 1 and 65535.`);
  }

  return value;
};

const PORT = readPort();
const MONGO_URI = readRequiredEnv('MONGO_URI');
const JWT_SECRET = readRequiredEnv('JWT_SECRET');
const BACKEND_URL = readRequiredEnv('BACKEND_URL');
const CLIENT_URL = readRequiredEnv('CLIENT_URL');
const EMAIL_FROM = readRequiredEnv('EMAIL_FROM');
const SMTP_HOST = readRequiredEnv('SMTP_HOST');
const SMTP_PORT = readRequiredEnv('SMTP_PORT');
const SMTP_USER = readRequiredEnv('SMTP_USER');
const SMTP_PASS = readRequiredEnv('SMTP_PASS');

const app = express();

const cred = await credExpress({
  database: { uri: MONGO_URI },
  email: {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    EMAIL_FROM,
    BACKEND_URL,
  },
  jwtSecret: JWT_SECRET,
  clientUrl: CLIENT_URL,
  backendUrl: BACKEND_URL,
});

app.use('/api', cred);

app.listen(PORT, () => {
  console.log(`cred-kit demo listening on http://localhost:${PORT}/api`);
});
