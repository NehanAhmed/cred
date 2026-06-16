import { NextFunction, Request, Response } from "express";
import { sendError } from "../helpers/api.helpers";
import jwt from "jsonwebtoken";

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    
    const token = req.cookies.token;
    if (!token) {
        return sendError(res, 'Unauthorized', 401);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!)
        req.user = decoded;
        next();
    } catch (error) {
        return sendError(res, 'Invalid token', 401);
    }
    

    
}