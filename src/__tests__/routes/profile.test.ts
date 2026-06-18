import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import userModel from '../../models/user.models';
import { createTestApp } from '../helpers/test-app';
import { setupTestDB } from '../helpers/db';

setupTestDB();

const app = createTestApp();
const request = supertest(app);

const userPassword = 'CurrentPass1';

let authToken: string;
let userId: string;

beforeEach(async () => {
  const hashedPassword = await bcrypt.hash(userPassword, 10);
  const user = await userModel.create({
    username: 'profileuser',
    email: 'profile@example.com',
    password: hashedPassword,
    bio: 'Original bio',
    phoneNumber: '1234567890',
    gender: 'male',
    isVerified: true
  });

  userId = user._id.toString();
  authToken = jwt.sign(
    { id: userId, email: user.email, username: user.username },
    process.env.JWT_SECRET!
  );
});

// ---------------------------------------------------------------------------
// GET /api/profile/me
// ---------------------------------------------------------------------------
describe('GET /api/profile/me', () => {
  it('returns the authenticated user', async () => {
    const res = await request.get('/api/profile/me').set('Cookie', `token=${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Profile fetched successfully');
    expect(res.body.data.username).toBe('profileuser');
    expect(res.body.data.email).toBe('profile@example.com');
    expect(res.body.data.password).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await request.get('/api/profile/me');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Unauthorized');
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request.get('/api/profile/me').set('Cookie', 'token=bad-jwt');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
  });

  it('returns 404 when the user no longer exists', async () => {
    await userModel.findByIdAndDelete(userId);

    const res = await request.get('/api/profile/me').set('Cookie', `token=${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/profile/me
// ---------------------------------------------------------------------------
describe('PUT /api/profile/me', () => {
  it('updates all fields', async () => {
    const res = await request.put('/api/profile/me').set('Cookie', `token=${authToken}`).send({
      username: 'updateduser',
      bio: 'Updated bio text',
      phoneNumber: '0987654321',
      gender: 'female'
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe('updateduser');
    expect(res.body.data.bio).toBe('Updated bio text');
    expect(res.body.data.phoneNumber).toBe('0987654321');
    expect(res.body.data.gender).toBe('female');

    const user = await userModel.findById(userId);
    expect(user!.username).toBe('updateduser');
  });

  it('partially updates a single field', async () => {
    const res = await request
      .put('/api/profile/me')
      .set('Cookie', `token=${authToken}`)
      .send({ username: 'newname' });

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('newname');

    const user = await userModel.findById(userId);
    expect(user!.username).toBe('newname');
    expect(user!.bio).toBe('Original bio');
  });

  describe('validation errors', () => {
    it('rejects short username (< 3)', async () => {
      const res = await request
        .put('/api/profile/me')
        .set('Cookie', `token=${authToken}`)
        .send({ username: 'ab' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects long username (> 30)', async () => {
      const res = await request
        .put('/api/profile/me')
        .set('Cookie', `token=${authToken}`)
        .send({ username: 'a'.repeat(31) });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects invalid gender', async () => {
      const res = await request
        .put('/api/profile/me')
        .set('Cookie', `token=${authToken}`)
        .send({ gender: 'alien' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
    
  });

  it('returns 401 without a token', async () => {
    const res = await request.put('/api/profile/me').send({ username: 'test' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request
      .put('/api/profile/me')
      .set('Cookie', 'token=bad-jwt')
      .send({ username: 'test' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the user no longer exists', async () => {
    await userModel.findByIdAndDelete(userId);

    const res = await request
      .put('/api/profile/me')
      .set('Cookie', `token=${authToken}`)
      .send({ username: 'test' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/profile/me
// ---------------------------------------------------------------------------
describe('DELETE /api/profile/me', () => {
  it('deletes the authenticated user', async () => {
    const res = await request.delete('/api/profile/me').set('Cookie', `token=${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Account deleted successfully');

    const user = await userModel.findById(userId);
    expect(user).toBeNull();
  });

  it('returns 401 without a token', async () => {
    const res = await request.delete('/api/profile/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request.delete('/api/profile/me').set('Cookie', 'token=bad-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 404 when the user no longer exists', async () => {
    await userModel.findByIdAndDelete(userId);

    const res = await request.delete('/api/profile/me').set('Cookie', `token=${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });
});

// ---------------------------------------------------------------------------
// POST /api/profile/me/change-password
// ---------------------------------------------------------------------------
describe('POST /api/profile/me/change-password', () => {
  const newPassword = 'NewPassword1';

  it('changes password with correct current password', async () => {
    const res = await request
      .post('/api/profile/me/change-password')
      .set('Cookie', `token=${authToken}`)
      .send({ currentPassword: userPassword, newPassword });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Password updated successfully');

    const user = await userModel.findById(userId);
    const isMatch = await bcrypt.compare(newPassword, user!.password);
    expect(isMatch).toBe(true);
  });

  it('returns 400 for wrong current password', async () => {
    const res = await request
      .post('/api/profile/me/change-password')
      .set('Cookie', `token=${authToken}`)
      .send({ currentPassword: 'WrongPass1', newPassword });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Current password is incorrect');
  });

  it('returns 401 without a token', async () => {
    const res = await request
      .post('/api/profile/me/change-password')
      .send({ currentPassword: userPassword, newPassword });
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request
      .post('/api/profile/me/change-password')
      .set('Cookie', 'token=bad-jwt')
      .send({ currentPassword: userPassword, newPassword });
    expect(res.status).toBe(401);
  });

  it('returns 404 when the user no longer exists', async () => {
    await userModel.findByIdAndDelete(userId);

    const res = await request
      .post('/api/profile/me/change-password')
      .set('Cookie', `token=${authToken}`)
      .send({ currentPassword: userPassword, newPassword });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found');
  });

  describe('validation errors', () => {
    it('rejects short new password (< 8)', async () => {
      const res = await request
        .post('/api/profile/me/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({ currentPassword: userPassword, newPassword: 'Ab1' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects new password without uppercase', async () => {
      const res = await request
        .post('/api/profile/me/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({ currentPassword: userPassword, newPassword: 'password123' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects new password without digit', async () => {
      const res = await request
        .post('/api/profile/me/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({ currentPassword: userPassword, newPassword: 'Passworddd' });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects missing currentPassword', async () => {
      const res = await request
        .post('/api/profile/me/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({ newPassword });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects missing newPassword', async () => {
      const res = await request
        .post('/api/profile/me/change-password')
        .set('Cookie', `token=${authToken}`)
        .send({ currentPassword: userPassword });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });
});
