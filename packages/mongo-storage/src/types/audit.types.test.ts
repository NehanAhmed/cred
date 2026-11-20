import { AUDIT_ACTIONS as CORE_AUDIT_ACTIONS } from '@cred/core';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS } from './audit.types.js';

describe('AUDIT_ACTIONS', () => {
  it('contains every supported audit action in a stable order', () => {
    expect(AUDIT_ACTIONS).toEqual([
      'register',
      'login',
      'logout',
      'token_refresh',
      'email_verification',
      'password_reset_request',
      'password_reset',
      'oauth_login',
      'profile_update',
      'password_change',
      'account_deletion'
    ]);
  });

  it('has no duplicate entries', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('stays in sync with the canonical list owned by @cred/core', () => {
    expect(AUDIT_ACTIONS).toEqual(CORE_AUDIT_ACTIONS);
  });

  it('uses lowercase snake_case identifiers', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(action).toMatch(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);
    }
  });
});
