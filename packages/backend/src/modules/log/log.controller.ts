import type { Request, Response } from 'express';
import type { LogFilterSchema } from '@claude-code-router/shared';
import { logStatsQuerySchema, leaderboardQuerySchema } from '@claude-code-router/shared';
import { logService } from './log.service.js';

export class LogController {
  async getAll(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as LogFilterSchema;
    const filter = {
      ...query,
      userId: req.auth!.role === 'admin' ? query.userId : req.auth!.userId,
    };
    const result = await logService.getAll(filter);
    res.json({ success: true, data: result });
  }

  async getById(req: Request, res: Response): Promise<void> {
    const userId = req.auth!.role === 'admin' ? undefined : req.auth!.userId;
    const log = await logService.getById(req.params.id, userId);
    res.json({ success: true, data: log });
  }

  async getStats(req: Request, res: Response): Promise<void> {
    const userId = req.auth!.role === 'admin' ? undefined : req.auth!.userId;
    const { timeRange } = logStatsQuerySchema.parse(req.query);
    const stats = await logService.getStats(userId, timeRange);
    res.json({ success: true, data: stats });
  }

  async getLeaderboard(req: Request, res: Response): Promise<void> {
    const { timeRange } = leaderboardQuerySchema.parse(req.query);
    const currentUserId = req.auth!.userId;
    const leaderboard = await logService.getLeaderboard(timeRange, currentUserId);
    res.json({ success: true, data: leaderboard });
  }
}

export const logController = new LogController();
