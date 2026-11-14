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

    if(!user){
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
        user:{
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