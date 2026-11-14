import { AuditLogInterface, AuditLogParams } from "./audit.types.js";
import { RefreshToken, RegisterRequest, User } from "./auth.types.js";

/**
 * A filter value that also supports the comparison operators needed for
 * time-based conditional updates (for example, an unexpired deadline).
 */
export type QueryValue<T> =
    | T
    | { $gt?: T; $gte?: T; $lt?: T; $lte?: T; $ne?: T };

export type UserQuery = {
    [K in keyof User]?: QueryValue<User[K]>;
};

export type CreateUserInput = RegisterRequest & {
    verificationToken?: string,
    verificationTokenExpires?: Date,
} & Partial<Pick<User, 'provider' | 'googleId' | 'githubId' | 'avatar' | 'isVerified' | 'resetPasswordToken' | 'resetPasswordExpires' | 'loginAttempts' | 'lockoutUntil'>>;

export interface UserDatabaseAdapter {
    findOne(filter: Partial<User>): Promise<User | null>;
    create(user: CreateUserInput): Promise<User>;
    delete(id: string): Promise<void>;
    update(id: string, updates: Partial<User>): Promise<User>;
    findOneByTwoConditions(filter1: Partial<User>, filter2: Partial<User>): Promise<User | null>;
    incrementLoginAttempts(id: string): Promise<number>;
    /**
     * Atomically updates the first user matching `condition`.
     * Returns `null` when no user matches; a no-match must not throw.
     */
    findOneAndUpdate(condition: UserQuery, updates: Partial<User>): Promise<User | null>;
}


export interface RefreshTokenDatabaseAdapter {
    findOne(filter: Partial<RefreshToken>): Promise<RefreshToken | null>;
    create(token: RefreshToken): Promise<RefreshToken>;
    delete(token: string): Promise<void>;
    update(id: string, updates: Partial<RefreshToken>): Promise<RefreshToken>;
    /**
     * Atomically updates the first token matching `condition`.
     * Returns `null` when no token matches; a no-match must not throw.
     */
    findOneAndUpdate(condition: Partial<RefreshToken>, updation: Partial<RefreshToken>): Promise<RefreshToken | null>;
    deleteMany(filter: Partial<RefreshToken>): Promise<void>;
}



export interface EmailAdapter {
    sendEmailVerification(email: string, rawToken: string): Promise<void>;
    sendPasswordReset(email: string, rawToken: string): Promise<void>;
}

export interface AuditLogFilter {
    user?: string | null;
}

export interface AuditDatabaseAdapter {
    create(audit: Partial<AuditLogInterface>): Promise<AuditLogInterface>
    /**
     * Returns the logs matching `filter`, newest first.
     */
    find(filter: AuditLogFilter, options: { skip: number, limit: number }): Promise<AuditLogInterface[]>
    /**
     * Returns the number of logs matching `filter`.
     */
    count(filter: AuditLogFilter): Promise<number>
}