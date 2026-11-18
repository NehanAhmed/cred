/**
 * Registered Mongoose model names shared by the schemas and their references.
 *
 * Keeping these in one place prevents a schema `ref` from drifting away from
 * the model name used by `mongooseStorage` (which previously broke populate).
 */
export const USER_MODEL_NAME = 'CredUser';
export const REFRESH_TOKEN_MODEL_NAME = 'CredRefreshToken';
export const AUDIT_LOG_MODEL_NAME = 'CredAuditLog';
