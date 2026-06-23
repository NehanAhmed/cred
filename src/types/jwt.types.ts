export interface JWTPayload {
    id: string;
    email: string;
    username: string;
    tokenType: 'access' | 'refresh';
    iat?: number;
    exp?: number;
}