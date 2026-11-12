import bcrypt from "bcryptjs"
import crypto from 'node:crypto'
import { AuthError } from "../errors/auth-error.js";
import { RegisterRequest, User } from "../types/auth.types.js";
import { DatabaseAdapter, EmailAdapter } from "../types/deps.types.js";

export async function register(
    input: RegisterRequest,
    deps: { database: DatabaseAdapter, email: EmailAdapter }
) {
    const { email: rawEmail, username, password, bio, phoneNumber, gender } = input;
    const email = rawEmail.toLowerCase().trim();

    const [byUsername, byEmail] = await Promise.all([
        deps.database.findOne({ username }),
        deps.database.findOne({ email })
    ]);
    if (byUsername || byEmail) {
        throw new AuthError('USER_EXISTS', 'User already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await deps.database.create({
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
        await deps.database.delete(user.id).catch(() => {
            throw new AuthError("USER_DELETION_FAILED", 'Failed to delete user after email send failure. Please contact support.', 500)
        });
        throw new AuthError("EMAIL_SEND_FAILED", 'Failed to send verification email. Please try again.', 500)
    }


}

export async function verifyEmail(token: string, deps: { database: DatabaseAdapter }) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await deps.database.findOne({ verificationToken: hashedToken });
    if (!user || !user.verificationTokenExpires || user.verificationTokenExpires < new Date()) {
        throw new AuthError('INVALID_TOKEN', 'Invalid or expired token', 400);
    }

    const updatedUser = await deps.database.update(user.id, {
        verificationToken: null,
        verificationTokenExpires: null,
        isVerified: true
    })

    return { isVerified: true }

}   

