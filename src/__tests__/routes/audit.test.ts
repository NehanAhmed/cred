import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import userModel from '../../models/user.models';
import auditLogModel from '../../models/auditLog.models';
import { createTestApp } from '../helpers/test-app';
import { setupTestDB } from '../helpers/db';

setupTestDB();

const app = createTestApp();
const request = supertest(app);

// ---------------------------------------------------------------------------
// GET /api/profile/me/audit-logs — Audit logs
// ---------------------------------------------------------------------------
describe('GET /api/profile/me/audit-logs — Audit logs', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request.get('/api/profile/me/audit-logs');
    expect(res.status).toBe(401);
  });

  it('returns empty logs for a user with no activity', async () => {
    const user = await userModel.create({
      username: 'audituser',
      email: 'audit@example.com',
      password: 'hashed',
      isVerified: true,
    });

    const token = jwt.sign(
      { id: user._id, email: user.email, username: user.username, tokenType: 'access' },
      process.env.JWT_SECRET!
    );

    const res = await request
      .get('/api/profile/me/audit-logs')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.logs).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
    expect(res.body.data.pagination.totalPages).toBe(0);
  });

  it('returns audit logs for a user', async () => {
    const user = await userModel.create({
      username: 'audituser2',
      email: 'audit2@example.com',
      password: 'hashed',
      isVerified: true,
    });

    await auditLogModel.create({
      user: user._id,
      action: 'login',
      status: 'success',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
    });

    const token = jwt.sign(
      { id: user._id, email: user.email, username: user.username, tokenType: 'access' },
      process.env.JWT_SECRET!
    );

    const res = await request
      .get('/api/profile/me/audit-logs')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBe(1);
    expect(res.body.data.logs[0].action).toBe('login');
    expect(res.body.data.logs[0].status).toBe('success');
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('does not return audit logs for other users', async () => {
    const user1 = await userModel.create({
      username: 'audituser3',
      email: 'audit3@example.com',
      password: 'hashed',
      isVerified: true,
    });

    const user2 = await userModel.create({
      username: 'audituser4',
      email: 'audit4@example.com',
      password: 'hashed',
      isVerified: true,
    });

    await auditLogModel.create({
      user: user2._id,
      action: 'login',
      status: 'success',
    });

    const token = jwt.sign(
      { id: user1._id, email: user1.email, username: user1.username, tokenType: 'access' },
      process.env.JWT_SECRET!
    );

    const res = await request
      .get('/api/profile/me/audit-logs')
      .set('Cookie', `token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBe(0);
  });

  it('supports pagination', async () => {
    const user = await userModel.create({
      username: 'audituser5',
      email: 'audit5@example.com',
      password: 'hashed',
      isVerified: true,
    });

    const logs = Array.from({ length: 5 }, (_, i) => ({
      user: user._id,
      action: 'login' as const,
      status: 'success' as const,
      metadata: { index: i },
    }));
    await auditLogModel.create(logs);

    const token = jwt.sign(
      { id: user._id, email: user.email, username: user.username, tokenType: 'access' },
      process.env.JWT_SECRET!
    );

    const page1 = await request
      .get('/api/profile/me/audit-logs?page=1&limit=2')
      .set('Cookie', `token=${token}`);

    expect(page1.status).toBe(200);
    expect(page1.body.data.logs.length).toBe(2);
    expect(page1.body.data.pagination.page).toBe(1);
    expect(page1.body.data.pagination.total).toBe(5);
    expect(page1.body.data.pagination.totalPages).toBe(3);
  });
});
