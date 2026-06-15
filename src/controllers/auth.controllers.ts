import userModel from "../models/user.models";
import { Request, Response } from "express";
import { LoginRequest, RegisterRequest } from "../types/auth.types";
import { sendError, sendSuccess } from "../helpers/api.helpers";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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
        return sendSuccess(res, user, "User registered successfully", 201)
    }
    catch (error) {
        return sendError(res, "Something went wrong", 500)
    }
};


const login = async(req: Request<{}, {}, LoginRequest>, res: Response) => {
    try {
        const { email, password,username } = req.body;
        const user = await userModel.findOne({ 
            $or: [
                { email },
                { username }
            ]
         });
        if (!user) {
            return sendError(res, "User not found", 404)
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return sendError(res, "Invalid password", 401)
        }
        const token = jwt.sign({ id: user._id,email: user.email,username:user.username }, process.env.JWT_SECRET!, { expiresIn: '1d' });
        res.cookie('token',token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        })
        return sendSuccess(res, { user}, "User logged in successfully", 200)
    }
    catch (error) {
        console.log("An error Occured",error);
        return sendError(res, "Something went wrong", 500)
    }
}

const logout = async(req: Request, res: Response) => {
    try {
        res.clearCookie('token');
        return sendSuccess(res, null, "User logged out successfully", 200)
    }
    catch (error) {
        console.log("An error Occured",error);
        return sendError(res, "Something went wrong", 500)
    }
}

export default {
    register,
    login,
    logout
};

