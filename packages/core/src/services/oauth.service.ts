import { AuthError } from "../errors/auth-error.js";
import { OAuthCallbackInput, OAuthCallbackResult } from "../types/oauth.types.js";
import { AuditDatabaseAdapter, RefreshTokenDatabaseAdapter, UserDatabaseAdapter } from "../types/deps.types.js";
import { generateAccessToken, generateRefreshTokenData } from "../helpers/auth.helper.js";
import { logAuditEvent } from "../helpers/audit.helper.js";

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
