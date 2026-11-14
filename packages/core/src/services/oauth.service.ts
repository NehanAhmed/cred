import { AuthError } from "../errors/auth-error.js";
import { OAuthCallbackInput, OAuthCallbackResult } from "../types/oauth.types.js";
import { AuditDatabaseAdapter, RefreshTokenDatabaseAdapter, UserDatabaseAdapter } from "../types/deps.types.js";
import { User } from "../types/auth.types.js";
import { generateAccessToken, generateRefreshTokenData } from "../helpers/auth.helper.js";
import { logAuditEvent } from "../helpers/audit.helper.js";
import crypto from 'node:crypto';

const generateUniqueUsername = async (base: string, deps: { userDatabase: UserDatabaseAdapter }): Promise<string> => {
    const sanitized = base
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 25) || `user_${crypto.randomBytes(4).toString('hex')}`;

    const exists = await deps.userDatabase.findOne({ username: sanitized });
    if (!exists) return sanitized;

    const suffix = crypto.randomBytes(3).toString('hex');
    return `${sanitized}_${suffix}`;
};

/**
 * Finds an OAuth user by provider id, links an existing local account by email,
 * or creates a new user — the core logic behind the passport strategies.
 */
export async function findOrCreateOAuthUser(
    input: { provider: 'google' | 'github', profileId: string, email?: string, displayName?: string, avatar?: string },
    deps: { userDatabase: UserDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }
): Promise<User> {
    const { provider, profileId, email, displayName, avatar } = input;
    const providerField = provider === 'google' ? 'googleId' : 'githubId';

    let existing = await deps.userDatabase.findOne({ [providerField]: profileId });
    if (existing) return existing;

    if (email) {
        existing = await deps.userDatabase.findOne({ email: email.toLowerCase() });
        if (existing) {
            const wasLocal = existing.provider === 'local';
            const updates: Partial<User> = { [providerField]: profileId };
            if (!existing.avatar) updates.avatar = avatar || null;
            if (wasLocal) updates.provider = provider;
            const saved = await deps.userDatabase.update(existing.id, updates);
            if (wasLocal) {
                await logAuditEvent({
                    user: saved.id,
                    action: 'oauth_login',
                    status: 'success',
                    provider,
                    metadata: { reason: 'Account linked to existing local user by email' },
                }, { auditDatabase: deps.auditDatabase });
            }
            return saved;
        }
    }

    const username = await generateUniqueUsername(
        displayName || email?.split('@')[0] || 'user',
        deps
    );

    const user = await deps.userDatabase.create({
        username,
        email: email || `${profileId}@${provider}.oauth`,
        password: crypto.randomBytes(32).toString('hex'),
        provider,
        [providerField]: profileId,
        avatar: avatar || null,
        isVerified: true,
    });

    if (!user) {
        throw new AuthError('USER_CREATION_FAILED', 'Failed to create user', 500);
    }

    return user;
}

export async function oauthCallback(
    input: OAuthCallbackInput,
    deps: { userDatabase: UserDatabaseAdapter, refreshTokenDatabase: RefreshTokenDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter },
    config: { jwtSecret: string },
    context: { ip?: string, userAgent?: string } = {}
): Promise<OAuthCallbackResult> {
    const { user } = input;

    if (!user) {
        await logAuditEvent({
            action: 'oauth_login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'No user returned from OAuth provider' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('OAUTH_FAILED', 'No user returned from OAuth provider', 401);
    }

    const userId = user.id;
    const { email, username } = user;

    if (!userId || !email || !username) {
        await logAuditEvent({
            action: 'oauth_login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Invalid user object from OAuth provider', fields: { userId: !!userId, email: !!email, username: !!username } },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('OAUTH_INVALID_USER', 'Invalid user object from OAuth provider', 401);
    }

    await deps.userDatabase.update(userId, {
        lastLogin: new Date(),
        lastIp: context.ip || null,
    });

    const accessToken = generateAccessToken({ id: userId, email, username }, config.jwtSecret);
    const rtData = generateRefreshTokenData();

    const refreshToken = await deps.refreshTokenDatabase.create({
        token: rtData.hashedToken,
        user: userId,
        family: rtData.family,
        expiresAt: rtData.expiresAt,
        consumed: false,
    });

    if (!refreshToken) {
        throw new AuthError('REFRESH_TOKEN_CREATION_FAILED', 'Failed to create refresh token', 500);
    }

    await logAuditEvent({
        user: userId,
        action: 'oauth_login',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
        provider: user.provider ?? null,
    }, { auditDatabase: deps.auditDatabase });

    return {
        accessToken,
        refreshToken: rtData.rawToken,
        user: { id: userId, email, username, provider: user.provider },
    };
}
