export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
    bio?: string;
    phoneNumber?: number;
    gender: string;
}

export interface LoginRequest {
    email?: string;
    username?: string;
    password: string;
}

export interface PasswordForgotRequest {
    email: string;
}

export interface PasswordResetRequest {
    password: string;
}
