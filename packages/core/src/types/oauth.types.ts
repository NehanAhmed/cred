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

export interface FindOrCreateOAuthUserInput {
    provider: 'google' | 'github';
    profileId: string;
    email?: string;
    displayName?: string;
    avatar?: string;
    /**
     * Whether the provider has verified ownership of `email`. Email-based
     * linking is only allowed when this is true; unverified addresses must go
     * through a separate authenticated link flow or a new account.
     */
    isEmailVerified: boolean;
}

export interface OAuthCallbackInput {
    user?: OAuthUser | null;
    /** The provider used for the current login, which may differ from the linked account's stored provider. */
    provider: 'google' | 'github';
}

export interface OAuthCallbackResult {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; username: string; provider?: OAuthProvider };
}
