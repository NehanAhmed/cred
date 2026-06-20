export interface JWTPayload {
    id: string;
    email: string;
    username: string;
    iat?: number;
    exp?: number;
}