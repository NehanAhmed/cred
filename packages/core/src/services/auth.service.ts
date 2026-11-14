import bcrypt from "bcryptjs"
import crypto from 'node:crypto'
import { AuthError } from "../errors/auth-error.js";
import { LoginRequest, RegisterRequest, User } from "../types/auth.types.js";
import { UserDatabaseAdapter, EmailAdapter, RefreshTokenDatabaseAdapter } from "../types/deps.types.js";
import { generateAccessToken, generateRefreshTokenData } from "../helpers/auth.helper.js";
const LOCK_DURATION_MS = 15 * 60 * 1000
export async function register(
    input: RegisterRequest,
    deps: { userDatabase: UserDatabaseAdapter, email: EmailAdapter }
) {
    const { email: rawEmail, username, password, bio, phoneNumber, gender } = input;
    const email = rawEmail.toLowerCase().trim();

    const [byUsername, byEmail] = await Promise.all([
        await deps.userDatabase.findOne({ username }),
        await deps.userDatabase.findOne({ email })
    ]);
    if (byUsername || byEmail) {
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
        throw new AuthError("EMAIL_SEND_FAILED", 'Failed to send verification email. Please try again.', 500)
    }


}

export async function verifyEmail(token: string, deps: { userDatabase: UserDatabaseAdapter }) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await deps.userDatabase.findOne({ verificationToken: hashedToken });
    if (!user || !user.verificationTokenExpires || user.verificationTokenExpires < new Date()) {
        throw new AuthError('INVALID_TOKEN', 'Invalid or expired token', 400);
    }

    const updatedUser = await deps.userDatabase.update(user.id, {
        verificationToken: null,
        verificationTokenExpires: null,
        isVerified: true
    })

    return { isVerified: true }

}

export async function login(input: LoginRequest, deps: { userDatabase: UserDatabaseAdapter, refreshTokenDatabase: RefreshTokenDatabaseAdapter }, config: { jwtSecret: string },
    context: { ip?: string } = {},) {

    const user = await deps.userDatabase.findOneByTwoConditions({ username: input.username }, { email: input.email?.toLowerCase().trim() });

    if (!user) {
        throw new AuthError('INVALID_CREDENTIALS', 'Invalid username or email', 400);
    }

    if (user?.lockoutUntil && user?.lockoutUntil > new Date()) {

        throw new AuthError('ACCOUNT_LOCKED', 'Account locked due to too many failed login attempts. Please try again later.', 401)
    }

    if (user?.provider !== 'local') {
        throw new AuthError('INVALID_LOGIN_METHOD', 'This account cannot be logined by this method', 400)
    }

    if (!user.isVerified) {
        throw new AuthError("EMAIL_NOT_VERIFIED", 'Please verify your email first.', 401)
    }
    const isPasswordValid = await bcrypt.compare(input.password, user.password);

    if (!isPasswordValid) {
        const updated = await deps.userDatabase.update(user.id, {
            loginAttempts: user.loginAttempts + 1
        })
        if (updated && updated.loginAttempts >= 5) {
            const updated = await deps.userDatabase.update(user.id, {
                lockoutUntil: new Date(Date.now() + LOCK_DURATION_MS)
            })
        }
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

export async function logout(context: { rawToken: string }, deps: { refreshTokenDatabase: RefreshTokenDatabaseAdapter }) {
    if (!context.rawToken) {
        throw new AuthError('MISSING_TOKEN', "No token found.", 404)
    }
    const deleteRefreshToken = await deps.refreshTokenDatabase.delete(context.rawToken)

}

export async function refresh(context: { rawToken: string }, deps: { refreshTokenDatabase: RefreshTokenDatabaseAdapter, userDatabase: UserDatabaseAdapter }, config: { jwtSecret: string }) {
    if (!context.rawToken) {
        throw new AuthError('MISSING_TOKEN', "No token found.", 404)
    }
    const hashedToken = crypto.createHash('sha256').update(context.rawToken).digest('hex');
    const claimed = await deps.refreshTokenDatabase.findOneAndUpdate({ token: hashedToken, consumed: false }, { consumed: true })
    if (!claimed) {
        const existing = await deps.refreshTokenDatabase.findOne({ token: hashedToken })
        if (existing) {
            await deps.refreshTokenDatabase.deleteMany({ family: existing.family, user: existing.user })
            throw new AuthError('REFRESH_TOKEN_REUSE_DETECTED', "Refresh token reuse detected. All sessions revoked.", 401)
        }
        throw new AuthError('REFRESH_TOKEN_NOT_FOUND', "Invalid token.", 401)
    }
    if (claimed.expiresAt < new Date()) {
        throw new AuthError('REFRESH_TOKEN_EXPIRED', "Refresh token expired.", 401)
    }
    const user = await deps.userDatabase.findOne({ id: claimed.user })
    if (!user) {
        throw new AuthError('UNEXPECTED_ERROR_OCCURED', "User not found.", 500)
    }
    const rtData = generateRefreshTokenData();
    await deps.refreshTokenDatabase.create({
        user: user.id,
        family: rtData.family,
        token: rtData.hashedToken,
        expiresAt: rtData.expiresAt,
        consumed: false
    })
    const accessToken = generateAccessToken({ id: user.id, email: user.email, username: user.username }, config.jwtSecret);
    return { accessToken, refreshToken: rtData.rawToken };

}

export async function forgotPassword(input: { email: string }, deps: { userDatabase: UserDatabaseAdapter, email: EmailAdapter }) {
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
        throw new AuthError('USER_NOT_FOUND', 'User not found', 404)

    }
    if (user.provider !== 'local') {
        throw new AuthError('UNEXPECTED_ERROR_OCCURED', 'If an account exists, a password reset link has been sent.', 500)
    }
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const updateUser = await deps.userDatabase.update(user.id, { resetPasswordToken: hashedToken, resetPasswordExpires: new Date(Date.now() + 3600000) })
    if (!updateUser) {
        throw new AuthError('UNEXPECTED_ERROR_OCCURED', 'If an account exists, a password reset link has been sent.', 500)
    }
    try {
        await deps.email.sendEmailVerification(user.email, token);
    } catch {
        const updateUser = await deps.userDatabase.update(user.id, { resetPasswordToken: null, resetPasswordExpires: null })
        throw new AuthError('EMAIL_SEND_FAILED', 'Failed to send password reset email. Please try again.', 500)
    }
    return { message: 'If an account exists, a password reset link has been sent.' }
}

export async function resetPassword(input: { token: string, newPassword: string }, deps: { userDatabase: UserDatabaseAdapter,refreshTokenDatabase:RefreshTokenDatabaseAdapter }) {
    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex')
    const findUser = await deps.userDatabase.findOne({ resetPasswordToken: hashedToken })
    if (!findUser || !findUser.resetPasswordExpires || findUser.resetPasswordExpires < new Date()) {
        throw new AuthError('INVALID_TOKEN', 'Invalid or expired token', 400);
    }

    const hashedPassword = await bcrypt.hash(input.newPassword, 10);
    const updateUser = await deps.userDatabase.update(findUser.id, { password: hashedPassword, resetPasswordToken: null, resetPasswordExpires: null, loginAttempts: 0, lockoutUntil: null })
    if(!updateUser){
        throw new AuthError('UNEXPECTED_ERROR_OCCURED','An error occured while updating the password',500)
    }
    await deps.refreshTokenDatabase.deleteMany({user: updateUser.id})
    return{
        message:"Password Updated."
    }
}