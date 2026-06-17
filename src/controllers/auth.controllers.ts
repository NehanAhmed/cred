import userModel from "../models/user.models";
import { Request, Response } from "express";
import { LoginRequest, RegisterRequest } from "../types/auth.types";
import { sendError, sendSuccess } from "../helpers/api.helpers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendEmailVerification, sendPasswordReset } from "../helpers/email.helpers";

const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
    try {
        const { username, email, password, bio, phoneNumber, gender } = req.body;

        const checkIfUserExists = await userModel.findOne({
            $or: [
                { email },
                { username }
            ]
        });
        if (checkIfUserExists) {
            return sendError(res, "User already exists", 400)
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await userModel.create({ username, email, password: hashedPassword, bio, phoneNumber, gender });
        const rawToken = crypto.randomBytes(32).toString('hex')
        user.verificationToken = crypto.createHash('sha256').update(rawToken).digest('hex')
        user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await user.save()
        await sendEmailVerification(user.email, rawToken)
        return sendSuccess(res, {}, "User registered successfully. Verify Your Email First.", 201)
    }
    catch (error) {
        return sendError(res, "Something went wrong", 500)
    }
};


const login = async (req: Request<{}, {}, LoginRequest>, res: Response) => {
    try {
        const { email, password, username } = req.body;
        const user = await userModel.findOne({
            $or: [
                { email },
                { username }
            ]
        });
        if (!user) {
            return sendError(res, "User not found", 404)
        }
        if (!user.isVerified) {
            return sendError(res, "Please verify your email first", 401)
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return sendError(res, "Invalid password", 401)
        }
        const token = jwt.sign({ id: user._id, email: user.email, username: user.username }, process.env.JWT_SECRET!, { expiresIn: '1d' });
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        })
        return sendSuccess(res, { user }, "User logged in successfully", 200)
    }
    catch (error) {
        console.log("An error Occured", error);
        return sendError(res, "Something went wrong", 500)
    }
}

const logout = async (req: Request, res: Response) => {
    try {
        res.clearCookie('token');
        return sendSuccess(res, null, "User logged out successfully", 200)
    }
    catch (error) {
        console.log("An error Occured", error);
        return sendError(res, "Something went wrong", 500)
    }
}

export const verifyEmail = async (req: Request<{ token: string }>, res: Response) => {
    try {
        const { token } = req.params;
        if (!token) {
            return sendError(res, "Token is required", 400)
        }
        const hashToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await userModel.findOne({
            verificationToken: hashToken,
            verificationTokenExpires: { $gt: new Date() }
        });
        if (!user) {
            return sendError(res, "Invalid or expired token", 400)
        }
        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await user.save();
        return sendSuccess(res, null, "Email verified successfully", 200)
    }
    catch (error) {
        console.log("An error Occured", error);
        return sendError(res, "Something went wrong", 500)
    }
}

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await userModel.findOne({ email });
        if (!user) {
            return sendSuccess(res, null, "If an account exists, a password reset link has been sent", 200)
        }
        const token = crypto.randomBytes(32).toString('hex');
        const hashToken = crypto.createHash('sha256').update(token).digest('hex');
        user.resetPasswordToken = hashToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000);
        await user.save();
        await sendPasswordReset(user.email, token);
        return sendSuccess(res, null, "If an account exists, a password reset link has been sent", 200)
    }
    catch (error) {
        console.log("An error Occured", error);
        return sendError(res, "Something went wrong", 500)
    }
}

export const resetPassword = async (req: Request<{ token: string }, {}, { password: string }>, res: Response) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        if (!token || !password) {
            return sendError(res, "Token and password are required", 400)
        }
        const hashToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await userModel.findOne({
            resetPasswordToken: hashToken,
            resetPasswordExpires: { $gt: new Date() }
        });
        if (!user) {
            return sendError(res, "Invalid or expired token", 400)
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
        return sendSuccess(res, null, "Password reset successfully", 200)
    }
    catch (error) {
        console.log("An error Occured", error);
        return sendError(res, "Something went wrong", 500)
    }
}

export default {
    register,
    login,
    logout,
    verifyEmail,
    forgotPassword,
    resetPassword
};

