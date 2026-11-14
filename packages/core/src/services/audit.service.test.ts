import { describe, it, expect } from 'vitest';
import { getAuditLogs } from './audit.service.js';
import { makeDeps } from '../__tests__/fakes.js';

const seedLogs = async (deps: ReturnType<typeof makeDeps>, userId: string, count: number) => {
  for (let i = 0; i < count; i++) {
    await deps.audit.create({
      user: userId,
      action: 'login',
      status: 'success',
      metadata: { index: i },
    });
  }
};

describe('getAuditLogs', () => {
  it('returns empty logs and zeroed pagination for a user with no activity', async () => {
    const deps = makeDeps();

    const result = await getAuditLogs({ userId: 'user-1' }, { auditDatabase: deps.audit });

    expect(result.logs).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('returns the audit logs of the requesting user only', async () => {
    const deps = makeDeps();
    await deps.audit.create({ user: 'user-1', action: 'login', status: 'success' });
    await deps.audit.create({ user: 'user-2', action: 'logout', status: 'success' });

    const result = await getAuditLogs({ userId: 'user-1' }, { auditDatabase: deps.audit });

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]).toMatchObject({ user: 'user-1', action: 'login', status: 'success' });
    expect(result.pagination.total).toBe(1);
  });

  it('supports pagination with page and limit', async () => {
    const deps = makeDeps();
    await seedLogs(deps, 'user-1', 5);

    const page1 = await getAuditLogs(
      { userId: 'user-1', page: 1, limit: 2 },
      { auditDatabase: deps.audit },
    );
    const page3 = await getAuditLogs(
      { userId: 'user-1', page: 3, limit: 2 },
      { auditDatabase: deps.audit },
    );

    expect(page1.logs).toHaveLength(2);
    expect(page1.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });

    expect(page3.logs).toHaveLength(1);
    expect(page3.pagination.page).toBe(3);
  });

  it('returns logs newest first', async () => {
    const deps = makeDeps();
    const base = Date.now();
    const entry = (index: number, offset: number) => ({
      user: 'user-1',
      action: 'login' as const,
      status: 'success' as const,
      ip: null,
      userAgent: null,
      provider: null,
      metadata: { index },
      createdAt: new Date(base + offset),
    });
    deps.audit.logs.push(entry(0, 0), entry(1, 10), entry(2, 20));

    const result = await getAuditLogs({ userId: 'user-1' }, { auditDatabase: deps.audit });

    expect(result.logs.map((log) => (log.metadata as { index: number }).index)).toEqual([2, 1, 0]);
  });

  it('clamps page and limit into the allowed range', async () => {
    const deps = makeDeps();
    await seedLogs(deps, 'user-1', 5);

    const clamped = await getAuditLogs(
      { userId: 'user-1', page: 0, limit: 500 },
      { auditDatabase: deps.audit },
    );

    expect(clamped.pagination).toEqual({ page: 1, limit: 100, total: 5, totalPages: 1 });
    expect(clamped.logs).toHaveLength(5);
  });

  it('truncates fractional page and limit values to integers', async () => {
    const deps = makeDeps();
    await seedLogs(deps, 'user-1', 10);

    const result = await getAuditLogs(
      { userId: 'user-1', page: 2.9, limit: 2.9 },
      { auditDatabase: deps.audit },
    );

    expect(result.pagination.page).toBe(2);
    expect(result.pagination.limit).toBe(2);
    expect(result.logs).toHaveLength(2);
    expect(result.logs.length).toBeLessThanOrEqual(result.pagination.limit);
  });

  it('falls back to defaults for non-finite pagination values', async () => {
    const deps = makeDeps();
    await seedLogs(deps, 'user-1', 25);

    const result = await getAuditLogs(
      { userId: 'user-1', page: Number.NaN, limit: Number.POSITIVE_INFINITY },
      { auditDatabase: deps.audit },
    );

    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
    expect(result.logs).toHaveLength(20);
    expect(result.logs.length).toBeLessThanOrEqual(result.pagination.limit);
  });

  it('never returns more entries than the advertised limit on any page', async () => {
    const deps = makeDeps();
    await seedLogs(deps, 'user-1', 7);

    for (const page of [1, 2, 3, 4]) {
      const result = await getAuditLogs(
        { userId: 'user-1', page: page + 0.5, limit: 3.5 },
        { auditDatabase: deps.audit },
      );

      expect(result.pagination.limit).toBe(3);
      expect(result.logs.length).toBeLessThanOrEqual(result.pagination.limit);
    }
  });

  it('defaults to page 1 and limit 20 when not provided', async () => {
    const deps = makeDeps();
    await seedLogs(deps, 'user-1', 25);

    const result = await getAuditLogs({ userId: 'user-1' }, { auditDatabase: deps.audit });

    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
    expect(result.logs).toHaveLength(20);
  });
});
