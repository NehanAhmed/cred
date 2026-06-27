import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import userModel from '../../models/user.models';
import refreshTokenModel from '../../models/refreshToken.models';
import { hashToken } from '../../helpers/token.helpers';
import { createTestApp } from '../helpers/test-app';
import { setupTestDB } from '../helpers/db';

setupTestDB();

const app = createTestApp();
const request = supertest(app);

const validUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'Password123',
  bio: 'A short bio',
  phoneNumber: '1234567890',
  gender: 'male'
};

// ---------------------------------------------------------------------------
// POST /api/auth — Register
// ---------------------------------------------------------------------------
describe('POST /api/auth — Register', () => {
  it('registers a user successfully', async () => {
    const res = await request.post('/api/auth').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('User registered successfully. Verify your email first.');
    expect(res.body.data).toEqual({});

    const user = await userModel.findOne({ email: validUser.email });
    expect(user).not.toBeNull();
    expect(user!.username).toBe(validUser.username);
    expect(user!.password).not.toBe(validUser.password);
    expect(user!.isVerified).toBe(false);
    expect(user!.verificationToken).not.toBeNull();
    expect(user!.verificationTokenExpires).not.toBeNull();
  });

  it('returns 400 when email is already taken', async () => {
    await request.post('/api/auth').send(validUser);
    const res = await request.post('/api/auth').send({
      ...validUser,
      username: 'otheruser'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('User already exists');
  });

  it('returns 400 when username is already taken', async () => {
    await request.post('/api/auth').send(validUser);
    const res = await request.post('/api/auth').send({
      ...validUser,
      email: 'other@example.com'
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('User already exists');
  });

  describe('validation errors', () => {
    it('rejects missing username', async () => {
      const { username: _, ...rest } = validUser;
      const res = await request.post('/api/auth').send(rest);
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects invalid email', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects short password (< 8)', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, password: 'Ab1' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects password without uppercase letter', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects password without digit', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, password: 'Passworddd' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects short username (< 3)', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, username: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects long username (> 30)', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, username: 'a'.repeat(31) });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects invalid gender', async () => {
      const res = await request.post('/api/auth').send({ ...validUser, gender: 'alien' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/verify-email/:token — Email verification
// ---------------------------------------------------------------------------
describe('GET /api/auth/verify-email/:token — Email verification', () => {
  it('verifies email with a valid non-expired token and redirects', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await userModel.create({
      username: 'verifyuser',
      email: 'verify@example.com',
      password: 'hashedpassword',
      isVerified: false,
      verificationToken: hash,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    const res = await request.get(`/api/auth/verify-email/${rawToken}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?verified=true');

    const user = await userModel.findOne({ email: 'verify@example.com' });
    expect(user!.isVerified).toBe(true);
    expect(user!.verificationToken).toBeNull();
    expect(user!.verificationTokenExpires).toBeNull();
  });

  it('redirects with verified=false for an invalid token', async () => {
    const res = await request.get('/api/auth/verify-email/nonexistent-token');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?verified=false');
  });

  it('redirects with verified=false for an expired token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await userModel.create({
      username: 'expireduser',
      email: 'expired@example.com',
      password: 'hashedpassword',
      isVerified: false,
      verificationToken: hash,
      verificationTokenExpires: new Date(Date.now() - 60 * 1000)
    });

    const res = await request.get(`/api/auth/verify-email/${rawToken}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?verified=false');

    const user = await userModel.findOne({ email: 'expired@example.com' });
    expect(user!.isVerified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — Login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login — Login', () => {
  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('Password123', 10);
    await userModel.create({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword,
      bio: 'A short bio',
      phoneNumber: '1234567890',
      gender: 'male',
      isVerified: true
    });
  });

  it('logs in with email and returns user + cookie', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'Password123'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Logged in successfully');
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.username).toBe('testuser');
    expect(res.body.data.user.password).toBeUndefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(Array.isArray(cookies) ? cookies[0] : cookies).toContain('token=');
  });

  it('logs in with username', async () => {
    const res = await request.post('/api/auth/login').send({
      username: 'testuser',
      password: 'Password123'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 for non-existent user', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'ghost@example.com',
      password: 'Password123'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 when email is not verified', async () => {
    const hashedPassword = await bcrypt.hash('Password123', 10);
    await userModel.create({
      username: 'unverified',
      email: 'unverified@example.com',
      password: hashedPassword,
      isVerified: false
    });

    const res = await request.post('/api/auth/login').send({
      email: 'unverified@example.com',
      password: 'Password123'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Please verify your email first');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'WrongPass1'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials');
  });

  describe('validation errors', () => {
    it('rejects missing both email and username', async () => {
      const res = await request.post('/api/auth/login').send({ password: 'Password123' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects missing password', async () => {
      const res = await request.post('/api/auth/login').send({ email: 'test@example.com' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('account lockout', () => {
    it('increments loginAttempts on wrong password', async () => {
      await request.post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'WrongPass1'
      });

      const user = await userModel.findOne({ email: 'test@example.com' });
      expect(user!.loginAttempts).toBe(1);
    });

    it('locks the account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request.post('/api/auth/login').send({
          email: 'test@example.com',
          password: 'WrongPass1'
        });
      }

      const user = await userModel.findOne({ email: 'test@example.com' });
      expect(user!.loginAttempts).toBe(5);
      expect(user!.lockoutUntil).not.toBeNull();
      expect(user!.lockoutUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns lockout error when account is locked', async () => {
      for (let i = 0; i < 5; i++) {
        await request.post('/api/auth/login').send({
          email: 'test@example.com',
          password: 'WrongPass1'
        });
      }

      const res = await request.post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'WrongPass1'
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Account locked due to too many failed login attempts. Please try again later.');
    });

    it('resets loginAttempts on successful login', async () => {
      await request.post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'WrongPass1'
      });
      await request.post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'WrongPass1'
      });

      const successRes = await request.post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'Password123'
      });
      expect(successRes.status).toBe(200);

      const user = await userModel.findOne({ email: 'test@example.com' });
      expect(user!.loginAttempts).toBe(0);
      expect(user!.lockoutUntil).toBeNull();
    });

    it('allows login after lock duration expires', async () => {
      for (let i = 0; i < 5; i++) {
        await request.post('/api/auth/login').send({
          email: 'test@example.com',
          password: 'WrongPass1'
        });
      }

      await userModel.findOneAndUpdate(
        { email: 'test@example.com' },
        { lockoutUntil: new Date(Date.now() - 1000) }
      );

      const res = await request.post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'Password123'
      });
      expect(res.status).toBe(200);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout — Logout
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout — Logout', () => {
  it('logs out successfully with a valid token cookie', async () => {
    const user = await userModel.create({
      username: 'logoutuser',
      email: 'logout@example.com',
      password: 'hashed',
      isVerified: true
    });
    const token = jwt.sign(
      { id: user._id, email: user.email, username: user.username, tokenType: 'access' },
      process.env.JWT_SECRET!
    );

    const res = await request.post('/api/auth/logout').set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Logged out successfully');
  });

  it('returns 401 when no cookie is sent', async () => {
    const res = await request.post('/api/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Unauthorized');
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request
      .post('/api/auth/logout')
      .set('Cookie', 'token=this-is-not-a-valid-jwt');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid token');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh — Token refresh
// ---------------------------------------------------------------------------
describe('POST /api/auth/refresh — Refresh', () => {
  it('returns 401 when no refresh token cookie is sent', async () => {
    const res = await request.post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Refresh token not found');
  });

  it('returns 401 when an invalid refresh token is sent', async () => {
    const res = await request
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid refresh token');
  });

  it('returns 200 and rotates the refresh token', async () => {
    const hashedPassword = await bcrypt.hash('Password123', 10);
    const user = await userModel.create({
      username: 'refreshuser',
      email: 'refresh@example.com',
      password: hashedPassword,
      isVerified: true,
    });

    const loginRes = await request.post('/api/auth/login').send({
      email: 'refresh@example.com',
      password: 'Password123',
    });

    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    const refreshTokenMatch = cookieStr.match(/refreshToken=([^;]+)/);
    expect(refreshTokenMatch).not.toBeNull();

    const oldRefreshCookie = `refreshToken=${refreshTokenMatch![1]}`;

    const res = await request
      .post('/api/auth/refresh')
      .set('Cookie', oldRefreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Token refreshed successfully');

    const tokensAfter = await refreshTokenModel.find({ user: user._id });
    expect(tokensAfter.length).toBe(1);
    expect(tokensAfter[0].family).toBeDefined();
  });

  it('rejects reuse of an already rotated refresh token', async () => {
    const hashedPassword = await bcrypt.hash('Password123', 10);
    const user = await userModel.create({
      username: 'reuseuser',
      email: 'reuse@example.com',
      password: hashedPassword,
      isVerified: true,
    });

    const loginRes = await request.post('/api/auth/login').send({
      email: 'reuse@example.com',
      password: 'Password123',
    });

    const cookieStr = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].join('; ')
      : loginRes.headers['set-cookie'];
    const refreshTokenMatch = cookieStr.match(/refreshToken=([^;]+)/);
    expect(refreshTokenMatch).not.toBeNull();

    const oldRefreshCookie = `refreshToken=${refreshTokenMatch![1]}`;

    await request.post('/api/auth/refresh').set('Cookie', oldRefreshCookie);
    const res = await request.post('/api/auth/refresh').set('Cookie', oldRefreshCookie);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid refresh token');

    const tokensAfter = await refreshTokenModel.find({ user: user._id });
    expect(tokensAfter.length).toBe(1);
  });

  it('returns 401 when refresh token is expired', async () => {
    const user = await userModel.create({
      username: 'expiredtokenuser',
      email: 'expiredtoken@example.com',
      password: 'hashed',
      isVerified: true,
    });

    const rawToken = crypto.randomBytes(40).toString('hex');
    const family = crypto.randomUUID();
    const hashedToken = hashToken(rawToken);

    await refreshTokenModel.create({
      token: hashedToken,
      user: user._id,
      family,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${rawToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Refresh token expired');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — Non-local provider
// ---------------------------------------------------------------------------
describe('POST /api/auth/login — Non-local provider', () => {
  it('returns 400 when trying to login with email of an OAuth-only account', async () => {
    await userModel.create({
      username: 'googleuser',
      email: 'google@example.com',
      password: 'hashedpassword',
      isVerified: true,
      provider: 'google',
      googleId: 'google123',
    });

    const res = await request.post('/api/auth/login').send({
      email: 'google@example.com',
      password: 'Password123',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('This account uses google login. Please sign in with google.');
  });
});
