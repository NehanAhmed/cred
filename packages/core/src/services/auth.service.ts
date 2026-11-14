import bcrypt from "bcryptjs"
import crypto from 'node:crypto'
import { AuthError } from "../errors/auth-error.js";
import { LoginRequest, RegisterRequest, User } from "../types/auth.types.js";
import { AuditDatabaseAdapter, UserDatabaseAdapter, EmailAdapter, RefreshTokenDatabaseAdapter } from "../types/deps.types.js";
import { generateAccessToken, generateRefreshTokenData } from "../helpers/auth.helper.js";
import { logAuditEvent } from "../helpers/audit.helper.js";
const LOCK_DURATION_MS = 15 * 60 * 1000
export async function register(
    input: RegisterRequest,
    deps: { userDatabase: UserDatabaseAdapter, email: EmailAdapter, auditDatabase?: AuditDatabaseAdapter },
    context: { ip?: string, userAgent?: string } = {}
) {
    const { email: rawEmail, username, password, bio, phoneNumber, gender } = input;
    const email = rawEmail.toLowerCase().trim();

    const [byUsername, byEmail] = await Promise.all([
        await deps.userDatabase.findOne({ username }),
        await deps.userDatabase.findOne({ email })
    ]);
    if (byUsername || byEmail) {
        await logAuditEvent({
            action: 'register',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'User already exists', email, username },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('USER_EXISTS', 'User already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await deps.userDatabase.create({
        email,
        username,
        password: hashedPassword,
        bio,
        phoneNumber,
        gender,
        verificationToken: hashedToken,
        verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    })

    if (!user) {
        throw new AuthError('USER_CREATION_FAILED', 'Failed to create user', 500);
    }

    try {
        await deps.email.sendEmailVerification(user.email, rawToken);
    } catch {
        await deps.userDatabase.delete(user.id).catch(() => {
            throw new AuthError("USER_DELETION_FAILED", 'Failed to delete user after email send failure. Please contact support.', 500)
        });
        await logAuditEvent({
            action: 'register',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Failed to send verification email', email },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError("EMAIL_SEND_FAILED", 'Failed to send verification email. Please try again.', 500)
    }

    await logAuditEvent({
        user: user.id,
        action: 'register',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });
}

export async function verifyEmail(token: string, deps: { userDatabase: UserDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }, context: { ip?: string, userAgent?: string } = {}) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await deps.userDatabase.findOne({ verificationToken: hashedToken });
    if (!user || !user.verificationTokenExpires || user.verificationTokenExpires < new Date()) {
        await logAuditEvent({
            action: 'email_verification',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Invalid or expired token' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('INVALID_TOKEN', 'Invalid or expired token', 400);
    }

    const updatedUser = await deps.userDatabase.update(user.id, {
        verificationToken: null,
        verificationTokenExpires: null,
        isVerified: true
    })

    await logAuditEvent({
        user: user.id,
        action: 'email_verification',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    return { isVerified: true }

}

export async function login(input: LoginRequest, deps: { userDatabase: UserDatabaseAdapter, refreshTokenDatabase: RefreshTokenDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }, config: { jwtSecret: string },
    context: { ip?: string, userAgent?: string } = {},) {

    const user = await deps.userDatabase.findOneByTwoConditions({ username: input.username }, { email: input.email?.toLowerCase().trim() });

    if (!user) {
        await logAuditEvent({
            action: 'login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Invalid credentials' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid username or email', 400);
    }

    if (user?.lockoutUntil && user?.lockoutUntil > new Date()) {
        await logAuditEvent({
            user: user.id,
            action: 'login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Account locked' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('ACCOUNT_LOCKED', 'Account locked due to too many failed login attempts. Please try again later.', 401)
    }

    if (user?.provider !== 'local') {
        await logAuditEvent({
            user: user.id,
            action: 'login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: `Account uses ${user.provider} login`, provider: user.provider },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('INVALID_LOGIN_METHOD', 'This account cannot be logined by this method', 400)
    }

    if (!user.isVerified) {
        await logAuditEvent({
            user: user.id,
            action: 'login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Email not verified' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError("EMAIL_NOT_VERIFIED", 'Please verify your email first.', 401)
    }
    const isPasswordValid = await bcrypt.compare(input.password, user.password);

    if (!isPasswordValid) {
        const loginAttempts = await deps.userDatabase.incrementLoginAttempts(user.id);
        if (loginAttempts >= 5) {
            await deps.userDatabase.update(user.id, {
                lockoutUntil: new Date(Date.now() + LOCK_DURATION_MS)
            })
        }
        await logAuditEvent({
            user: user.id,
            action: 'login',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Invalid credentials', loginAttempts },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid Credentials', 401)
    }
    const updated = await deps.userDatabase.update(user.id, {
        lockoutUntil: null,
        lastLogin: new Date(),
        loginAttempts: 0,
        lastIp: context.ip || null
    })

    const accessToken = generateAccessToken({ id: user.id, email: user.email, username: user.username }, config.jwtSecret);
    const rtData = generateRefreshTokenData();

    const refreshToken = await deps.refreshTokenDatabase.create({

        user: user.id,
        family: rtData.family,
        token: rtData.hashedToken,
        expiresAt: rtData.expiresAt,
        consumed: false
    })

    if (!refreshToken) {
        throw new AuthError('REFRESH_TOKEN_CREATION_FAILED', 'Failed to create refresh token', 500);
    }

    await logAuditEvent({
        user: user.id,
        action: 'login',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    return {
        accessToken,
        refreshToken: rtData.rawToken,
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            bio: user.bio,
            phoneNumber: user.phoneNumber,
            gender: user.gender,
            avatar: user.avatar,
            provider: user.provider,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt

        }
    }

}

export async function logout(
    context: { rawToken: string, userId?: string, ip?: string, userAgent?: string },
    deps: { refreshTokenDatabase: RefreshTokenDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter }
) {
    if (!context.rawToken) {
        throw new AuthError('MISSING_TOKEN', "No token found.", 404)
    }
    const hashedToken = crypto.createHash('sha256').update(context.rawToken).digest('hex');
    await deps.refreshTokenDatabase.delete(hashedToken)

    await logAuditEvent({
        user: context.userId,
        action: 'logout',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });
}

export async function refresh(
    context: { rawToken: string, ip?: string, userAgent?: string },
    deps: { refreshTokenDatabase: RefreshTokenDatabaseAdapter, userDatabase: UserDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter },
    config: { jwtSecret: string }
) {
    if (!context.rawToken) {
        await logAuditEvent({
            action: 'token_refresh',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Refresh token not found' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('MISSING_TOKEN', "No token found.", 404)
    }
    const hashedToken = crypto.createHash('sha256').update(context.rawToken).digest('hex');
    const claimed = await deps.refreshTokenDatabase.findOneAndUpdate({ token: hashedToken, consumed: false }, { consumed: true })
    if (!claimed) {
        const existing = await deps.refreshTokenDatabase.findOne({ token: hashedToken })
        if (existing) {
            await deps.refreshTokenDatabase.deleteMany({ family: existing.family, user: existing.user })
            await logAuditEvent({
                user: existing.user,
                action: 'token_refresh',
                status: 'failure',
                ip: context.ip,
                userAgent: context.userAgent,
                metadata: { reason: 'Refresh token reuse detected' },
            }, { auditDatabase: deps.auditDatabase });
            throw new AuthError('REFRESH_TOKEN_REUSE_DETECTED', "Refresh token reuse detected. All sessions revoked.", 401)
        }
        await logAuditEvent({
            action: 'token_refresh',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Invalid or already consumed refresh token' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('REFRESH_TOKEN_NOT_FOUND', "Invalid token.", 401)
    }
    if (claimed.expiresAt < new Date()) {
        await logAuditEvent({
            user: claimed.user,
            action: 'token_refresh',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Refresh token expired' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('REFRESH_TOKEN_EXPIRED', "Refresh token expired.", 401)
    }
    const user = await deps.userDatabase.findOne({ id: claimed.user })
    if (!user) {
        await logAuditEvent({
            action: 'token_refresh',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'User not found' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('UNEXPECTED_ERROR_OCCURED', "User not found.", 500)
    }
    const rtData = generateRefreshTokenData();
    const successor = await deps.refreshTokenDatabase.create({
        user: user.id,
        family: claimed.family,
        token: rtData.hashedToken,
        expiresAt: rtData.expiresAt,
        consumed: false
    })
    if (!successor) {
        throw new AuthError('REFRESH_TOKEN_CREATION_FAILED', 'Failed to create refresh token', 500);
    }

    // A concurrent replay of the consumed predecessor revokes the whole family.
    // The successor is issued into that same family, so the revocation deletes it
    // as well. Re-check the predecessor after issuing the successor to close the
    // window where a replay removed the family before the successor was written.
    const predecessor = await deps.refreshTokenDatabase.findOne({ token: hashedToken })
    if (!predecessor) {
        await deps.refreshTokenDatabase.delete(rtData.hashedToken).catch(() => {})
        throw new AuthError('REFRESH_TOKEN_REUSE_DETECTED', "Refresh token reuse detected. All sessions revoked.", 401)
    }

    const accessToken = generateAccessToken({ id: user.id, email: user.email, username: user.username }, config.jwtSecret);

    await logAuditEvent({
        user: user.id,
        action: 'token_refresh',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    return { accessToken, refreshToken: rtData.rawToken };

}

export async function forgotPassword(
    input: { email: string },
    deps: { userDatabase: UserDatabaseAdapter, email: EmailAdapter, auditDatabase?: AuditDatabaseAdapter },
    context: { ip?: string, userAgent?: string } = {}
) {
    const { email: rawEmail } = input;
    if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
        throw new AuthError('INVALID_EMAIL', "Invalid email address.", 400)
    }
    const email = rawEmail.trim().toLowerCase()
    if (!email) {
        throw new AuthError('INVALID_EMAIL', "Invalid email address.", 400)

    }
    const user = await deps.userDatabase.findOne({ email: email })
    if (!user) {
        await logAuditEvent({
            action: 'password_reset_request',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'User not found', email },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('USER_NOT_FOUND', 'User not found', 404)

    }
    if (user.provider !== 'local') {
        await logAuditEvent({
            user: user.id,
            action: 'password_reset_request',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Social login account', provider: user.provider },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('UNEXPECTED_ERROR_OCCURED', 'If an account exists, a password reset link has been sent.', 500)
    }
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const updateUser = await deps.userDatabase.update(user.id, { resetPasswordToken: hashedToken, resetPasswordExpires: new Date(Date.now() + 3600000) })
    if (!updateUser) {
        throw new AuthError('UNEXPECTED_ERROR_OCCURED', 'If an account exists, a password reset link has been sent.', 500)
    }
    try {
        await deps.email.sendPasswordReset(user.email, token);
    } catch {
        await deps.userDatabase.update(user.id, { resetPasswordToken: null, resetPasswordExpires: null })
        await logAuditEvent({
            user: user.id,
            action: 'password_reset_request',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Failed to send password reset email' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('EMAIL_SEND_FAILED', 'Failed to send password reset email. Please try again.', 500)
    }

    await logAuditEvent({
        user: user.id,
        action: 'password_reset_request',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    return { message: 'If an account exists, a password reset link has been sent.' }
}

export async function resetPassword(
    input: { token: string, newPassword: string },
    deps: { userDatabase: UserDatabaseAdapter, refreshTokenDatabase: RefreshTokenDatabaseAdapter, auditDatabase?: AuditDatabaseAdapter },
    context: { ip?: string, userAgent?: string } = {}
) {
    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex')
    const hashedPassword = await bcrypt.hash(input.newPassword, 10);

    // Consume the token and replace the password in one conditional update so
    // concurrent/replayed resets cannot both succeed and expired tokens are rejected.
    const updateUser = await deps.userDatabase.findOneAndUpdate(
        {
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() }
        },
        {
            password: hashedPassword,
            resetPasswordToken: null,
            resetPasswordExpires: null,
            loginAttempts: 0,
            lockoutUntil: null
        }
    )
    if (!updateUser) {
        await logAuditEvent({
            action: 'password_reset',
            status: 'failure',
            ip: context.ip,
            userAgent: context.userAgent,
            metadata: { reason: 'Invalid or expired token' },
        }, { auditDatabase: deps.auditDatabase });
        throw new AuthError('INVALID_TOKEN', 'Invalid or expired token', 400);
    }
    await deps.refreshTokenDatabase.deleteMany({ user: updateUser.id })

    await logAuditEvent({
        user: updateUser.id,
        action: 'password_reset',
        status: 'success',
        ip: context.ip,
        userAgent: context.userAgent,
    }, { auditDatabase: deps.auditDatabase });

    return {
        message: "Password Updated."
    }
}
