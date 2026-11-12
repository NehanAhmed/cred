import { RegisterRequest, User } from "./auth.types.js";

export interface DatabaseAdapter {
    findOne(email:string,username:string): Promise<User | null>;
    create(user:RegisterRequest & { verificationToken: string,verificationTokenExpires: Date }): Promise<User>; 
    delete(_id:string): Promise<void>;
}

export interface EmailAdapter {
    sendEmailVerification(email:string,rawToken:string): Promise<void>;
}
