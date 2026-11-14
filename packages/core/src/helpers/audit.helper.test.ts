import { describe, it, expect, vi } from 'vitest';
import { logAuditEvent } from './audit.helper.js';
import { makeDeps } from '../__tests__/fakes.js';

describe('logAuditEvent', () => {
  it('reports failures through the injected logger without throwing', async () => {
    const deps = makeDeps();
    vi.spyOn(deps.audit, 'create').mockRejectedValue(new Error('audit store down'));
    const errors: unknown[][] = [];

    await expect(
      logAuditEvent(
        { action: 'login', status: 'success' },
        {
          auditDatabase: deps.audit,
          logger: { error: (...args: unknown[]) => errors.push(args) },
        },
      ),
    ).resolves.toBeUndefined();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(expect.arrayContaining(['Audit log error:', 'login', 'success']));
  });

  it('keeps audit failures isolated when no logger is provided', async () => {
    const deps = makeDeps();
    vi.spyOn(deps.audit, 'create').mockRejectedValue(new Error('audit store down'));

    await expect(
      logAuditEvent({ action: 'login', status: 'success' }, { auditDatabase: deps.audit }),
    ).resolves.toBeUndefined();
  });

  it('does nothing when no audit database is configured', async () => {
    await expect(
      logAuditEvent({ action: 'login', status: 'success' }, {}),
    ).resolves.toBeUndefined();
  });
});
