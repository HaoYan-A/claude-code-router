import type { Request, Response, NextFunction } from 'express';
import { ErrorCodes } from '@claude-code-router/shared';
import { apiKeyService } from '../api-key/api-key.service.js';
import { userRepository } from '../user/user.repository.js';
import { AppError } from '../../middlewares/error.middleware.js';

declare global {
  namespace Express {
    interface Request {
      proxyAuth?: {
        userId: string;
        apiKeyId: string;
      };
    }
  }
}

export async function proxyAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // 支持 x-api-key header（优先）或 Authorization: Bearer
  const xApiKey = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers.authorization;

  let apiKey: string | undefined;

  if (xApiKey) {
    apiKey = xApiKey;
  } else if (authHeader?.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  }

  if (!apiKey) {
    throw new AppError(401, ErrorCodes.UNAUTHORIZED, 'Missing or invalid API key');
  }

  try {
    const key = await apiKeyService.validateKey(apiKey);
    const user = await userRepository.findById(key.userId);

    if (!user || !user.isActive) {
      throw new AppError(401, ErrorCodes.USER_INACTIVE, 'User account is inactive');
    }

    req.proxyAuth = {
      userId: key.userId,
      apiKeyId: key.id,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, ErrorCodes.API_KEY_INVALID, 'Invalid API key');
  }
}
