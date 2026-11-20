/**
 * The canonical audit action list lives in `@cred-kit/core`. This module keeps the
 * long-standing mongo-storage import path working while avoiding a second copy
 * of the list.
 */
export { AUDIT_ACTIONS } from '@cred-kit/core';
export type { AuditAction } from '@cred-kit/core';
