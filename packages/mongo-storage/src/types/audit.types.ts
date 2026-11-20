/**
 * The canonical audit action list lives in `@cred/core`. This module keeps the
 * long-standing mongo-storage import path working while avoiding a second copy
 * of the list.
 */
export { AUDIT_ACTIONS } from '@cred/core';
export type { AuditAction } from '@cred/core';
