export type AuthErrorCode =
  | 'USER_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_TOKEN'
  | 'EMAIL_SEND_FAILED'
  | 'USER_CREATION_FAILED'
  | 'USER_DELETION_FAILED'
  | 'MISSING_CREDENTIALS'
  | 'INVALID_LOGIN_METHOD'
  | 'REFRESH_TOKEN_CREATION_FAILED'
  | 'MISSING_TOKEN'
  | 'UNEXPECTED_ERROR_OCCURED'
  | 'REFRESH_TOKEN_REUSE_DETECTED'
  | 'REFRESH_TOKEN_NOT_FOUND'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'INVALID_EMAIL'
  | 'USER_NOT_FOUND'
  ;

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}