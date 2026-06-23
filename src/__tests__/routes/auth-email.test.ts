import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import userModel from '../../models/user.models';
import { sendPasswordReset } from '../../helpers/email.helpers';
import { createTestApp } from '../helpers/test-app';
import { setupTestDB } from '../helpers/db';

setupTestDB();

const app = createTestApp();
const request = supertest(app);

const baseUser = {
  username: 'existinguser',
  email: 'existing@example.com',
  password: 'Password123',
  isVerified: true
};

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
describe('POST /api/auth/forgot-password', () => {
  it('sends a reset link for an existing user', async () => {
    await userModel.create(
      await bcrypt.hash(baseUser.password, 10).then((hash) => ({
        ...baseUser,
        password: hash
      }))
    );

    const res = await request.post('/api/auth/forgot-password').send({
      email: baseUser.email
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('If an account exists, a password reset link has been sent');

    expect(sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(sendPasswordReset).toHaveBeenCalledWith(baseUser.email, expect.any(String));

    const user = await userModel.findOne({ email: baseUser.email });
    expect(user!.resetPasswordToken).not.toBeNull();
    expect(user!.resetPasswordExpires).not.toBeNull();
  });

  it('returns the same message for a non-existent user (no info leak)', async () => {
    const res = await request.post('/api/auth/forgot-password').send({
      email: 'ghost@example.com'
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('If an account exists, a password reset link has been sent');
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  describe('validation errors', () => {
    it('rejects an invalid email format', async () => {
      const res = await request.post('/api/auth/forgot-password').send({
        email: 'not-an-email'
      });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects missing email', async () => {
      const res = await request.post('/api/auth/forgot-password').send({});
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password/:token
// ---------------------------------------------------------------------------
describe('POST /api/auth/reset-password/:token', () => {
  const newPassword = 'NewPass123';

  it('resets password with a valid non-expired token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await userModel.create({
      username: 'resetuser',
      email: 'reset@example.com',
      password: await bcrypt.hash('OldPass123', 10),
      isVerified: true,
      resetPasswordToken: hash,
      resetPasswordExpires: new Date(Date.now() + 3600000)
    });

    const res = await request
      .post(`/api/auth/reset-password/${rawToken}`)
      .send({ password: newPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Password reset successfully');

    const user = await userModel.findOne({ email: 'reset@example.com' });
    expect(user!.resetPasswordToken).toBeNull();
    expect(user!.resetPasswordExpires).toBeNull();

    const isMatch = await bcrypt.compare(newPassword, user!.password!);
    expect(isMatch).toBe(true);
  });

  it('returns 400 for an invalid token', async () => {
    const res = await request
      .post('/api/auth/reset-password/invalid-token')
      .send({ password: newPassword });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid or expired token');
  });

  it('returns 400 for an expired token', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await userModel.create({
      username: 'expireduser',
      email: 'expired@example.com',
      password: await bcrypt.hash('OldPass123', 10),
      isVerified: true,
      resetPasswordToken: hash,
      resetPasswordExpires: new Date(Date.now() - 60000)
    });

    const res = await request
      .post(`/api/auth/reset-password/${rawToken}`)
      .send({ password: newPassword });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid or expired token');
  });

  describe('validation errors', () => {
    it('rejects password shorter than 8 characters', async () => {
      const res = await request
        .post('/api/auth/reset-password/sometoken')
        .send({ password: 'Ab1' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects password without uppercase letter', async () => {
      const res = await request
        .post('/api/auth/reset-password/sometoken')
        .send({ password: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects password without digit', async () => {
      const res = await request
        .post('/api/auth/reset-password/sometoken')
        .send({ password: 'Passworddd' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects missing password', async () => {
      const res = await request.post('/api/auth/reset-password/sometoken').send({});
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });
});
