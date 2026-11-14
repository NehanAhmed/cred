import { RefreshToken, RegisterRequest, User } from "./auth.types.js";

export interface UserDatabaseAdapter {
    findOne(filter: Partial<User>): Promise<User | null>;
    create(user: RegisterRequest & { verificationToken: string, verificationTokenExpires: Date }): Promise<User>;
    delete(id: string): Promise<void>;
    update(id: string, updates: Partial<User>): Promise<User>;
    findOneByTwoConditions(filter1: Partial<User>, filter2: Partial<User>): Promise<User | null>;
    incrementLoginAttempts(id: string): Promise<number>;
}

export interface RefreshTokenDatabaseAdapter {
    findOne(filter: Partial<RefreshToken>): Promise<RefreshToken | null>;
    create(token: RefreshToken): Promise<RefreshToken>;
    delete(token: string): Promise<void>;
    update(id: string, updates: Partial<RefreshToken>): Promise<RefreshToken>;
    findOneAndUpdate(condition: Partial<RefreshToken>, updation: Partial<RefreshToken>): Promise<RefreshToken>;
    deleteMany(filter: Partial<RefreshToken>): Promise<void>;
}



export interface EmailAdapter {
    sendEmailVerification(email: string, rawToken: string): Promise<void>;
}
