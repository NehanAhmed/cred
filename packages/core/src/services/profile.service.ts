import bcrypt from "bcryptjs"
import { AuthError } from "../errors/auth-error.js";
import { PasswordChangeRequest, ProfileUpdateRequest, User, UserWithoutPassword } from "../types/auth.types.js";
import { AuditDatabaseAdapter, RefreshTokenDatabaseAdapter, UserDatabaseAdapter } from "../types/deps.types.js";
import { logAuditEvent } from "../helpers/audit.helper.js";

export async function getProfile(
    context: { userId: string },
    deps: { userDatabase: UserDatabaseAdapter }
): Promise<UserWithoutPassword> {
    const user = await deps.userDatabase.findOne({ id: context.userId });
    if (!user) {
        throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

export async function updatePassword(
    input: PasswordChangeRequest,
    context: { userId: string, ip?: string, userAgent?: string },
    deps: { userDatabase: UserDatabaseAdapter, refreshTokenDatabase: RefreshTokenDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }
): Promise<UserWithoutPassword> {
    const user = await deps.userDatabase.findOne({ id: context.userId });

    if (!user) {
        await logAuditEvent({
            user: context.userId,
            action: 'password_change',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'User not found' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.provider !== 'local') {
        await logAuditEvent({
            user: user.id,
            action: 'password_change',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Social login account', provider: user.provider },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('SOCIAL_LOGIN_ACCOUNT', 'Cannot change password for social login accounts', 400);
    }

    const isPasswordValid = await bcrypt.compare(input.currentPassword, user.password || '');
    if (!isPasswordValid) {
        await logAuditEvent({
            user: user.id,
            action: 'password_change',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Incorrect current password' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('INVALID_CURRENT_PASSWORD', 'Current password is incorrect', 400);
    }

    const hashedPassword = await bcrypt.hash(input.newPassword, 10);
    const updatedUser = await deps.userDatabase.update(user.id, {
        password: hashedPassword,
        loginAttempts: 0,
        lockoutUntil: null,
    });

    await deps.refreshTokenDatabase.deleteMany({ user: user.id });

    await logAuditEvent({
        user: user.id,
        action: 'password_change',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
}

export async function updateProfile(
    input: ProfileUpdateRequest,
    context: { userId: string, ip?: string, userAgent?: string },
    deps: { userDatabase: UserDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }
): Promise<UserWithoutPassword> {
    const user = await deps.userDatabase.findOne({ id: context.userId });
    if (!user) {
        await logAuditEvent({
            user: context.userId,
            action: 'profile_update',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'User not found' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    const updates: Partial<User> = {};
    if (input.username !== undefined) updates.username = input.username;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.phoneNumber !== undefined) updates.phoneNumber = input.phoneNumber;
    if (input.gender !== undefined) updates.gender = input.gender;

    let updatedUser: User;
    try {
        updatedUser = await deps.userDatabase.update(user.id, updates);
    } catch (error: unknown) {
        // Duck-typed duplicate-key error from the database adapter (no ORM import here).
        const mongoError = error as Record<string, unknown>;
        if (mongoError?.code === 11000) {
            const keyPattern = mongoError.keyPattern as Record<string, unknown> || {};
            const field = Object.keys(keyPattern)[0] || 'field';
            await logAuditEvent({
                user: context.userId,
                action: 'profile_update',
                status: 'failure',
                ip: context.ip,
                userAgent: context.userAgent,
                metadata: { reason: `${field} is already taken` },
            }, { auditDatabase: deps.auditDatabase });
            throw new AuthError('DUPLICATE_KEY', `${field} is already taken`, 400);
        }
        throw error;
    }

    await logAuditEvent({
        user: user.id,
        action: 'profile_update',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
}

export async function deleteAccount(
    context: { userId: string, ip?: string, userAgent?: string },
    deps: { userDatabase: UserDatabaseAdapter, refreshTokenDatabase: RefreshTokenDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }
): Promise<void> {
    const user = await deps.userDatabase.findOne({ id: context.userId });
    if (!user) {
        throw new AuthError('USER_NOT_FOUND', 'User not found', 404);
    }

    await deps.refreshTokenDatabase.deleteMany({ user: user.id });

    await logAuditEvent({
        user: user.id,
        action: 'account_deletion',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    await deps.userDatabase.delete(user.id);
}
