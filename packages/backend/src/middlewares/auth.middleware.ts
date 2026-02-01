import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthContext, JwtPayload } from '@claude-code-router/shared';
import { ErrorCodes } from '@claude-code-router/shared';
import { env } from '../config/env.js';
import { AppError } from './error.middleware.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, ErrorCodes.UNAUTHORIZED, 'Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.auth = {
      userId: payload.sub,
      role: payload.role,
      isAdmin: payload.isAdmin ?? false,
      githubUsername: payload.githubUsername,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, ErrorCodes.TOKEN_EXPIRED, 'Access token has expired');
    }
    throw new AppError(401, ErrorCodes.TOKEN_INVALID, 'Invalid access token');
  }
}

export function adminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.auth?.role !== 'admin') {
    throw new AppError(403, ErrorCodes.FORBIDDEN, 'Admin access required');
  }
  next();
}
