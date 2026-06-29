import { NextFunction, Request, Response } from 'express';
import { sendError } from '../helpers/api.helpers';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types/jwt.types';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token;
  if (!token) {
    return sendError(res, 'Unauthorized', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    if (decoded.tokenType !== 'access' || !decoded.id || !decoded.email || !decoded.username) {
      return sendError(res, 'Invalid token', 401);
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      iat: decoded.iat,
      exp: decoded.exp,
    };
    next();
  } catch {
    return sendError(res, 'Invalid token', 401);
  }
};
