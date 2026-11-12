export type AuthErrorCode =
  | 'USER_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'INVALID_TOKEN'
  | 'EMAIL_SEND_FAILED'
  | 'USER_CREATION_FAILED'
  | 'USER_DELETION_FAILED'
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