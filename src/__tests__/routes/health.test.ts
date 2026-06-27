import supertest from 'supertest';
import { createTestApp } from '../helpers/test-app';
import { setupTestDB } from '../helpers/db';

setupTestDB();

const app = createTestApp();
const request = supertest(app);

// ---------------------------------------------------------------------------
// GET /api/health — Health check
// ---------------------------------------------------------------------------
describe('GET /api/health — Health check', () => {
  it('returns 200 when database is connected', async () => {
    const res = await request.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('cred');
    expect(res.body.data.version).toBe('1.0.0');
    expect(res.body.data.database).toBeDefined();
    expect(res.body.data.database.status).toBe('connected');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(typeof res.body.data.timestamp).toBe('string');
  });
});
