import { RegisterRequest, User } from "./auth.types.js";

export interface DatabaseAdapter {
    findOne(filter: Partial<User>): Promise<User | null>;
    create(user: RegisterRequest & { verificationToken: string, verificationTokenExpires: Date }): Promise<User>;
    delete(id: string): Promise<void>;
    update(id: string, updates: Partial<User>): Promise<User>;
}


export interface EmailAdapter {
    sendEmailVerification(email: string, rawToken: string): Promise<void>;
}
