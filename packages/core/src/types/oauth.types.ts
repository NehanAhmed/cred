export type OAuthProvider = 'local' | 'google' | 'github';

/**
 * The user object handed over by an OAuth strategy after authentication
 * (the adapter equivalent of `req.user` in the Express controller).
 */
export interface OAuthUser {
    id?: string;
    email?: string;
    username?: string;
    provider?: OAuthProvider;
}

export interface OAuthCallbackInput {
    user?: OAuthUser | null;
}

export interface OAuthCallbackResult {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; username: string; provider?: OAuthProvider };
}
