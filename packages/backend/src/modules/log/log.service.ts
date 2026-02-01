import type { LogFilterSchema, StatsTimeRange } from '@claude-code-router/shared';
import { ErrorCodes } from '@claude-code-router/shared';
import { logRepository } from './log.repository.js';
import { AppError } from '../../middlewares/error.middleware.js';

export class LogService {
  async getById(id: string, userId?: string) {
    const log = await logRepository.findById(id);
    if (!log) {
      throw new AppError(404, ErrorCodes.INTERNAL_ERROR, 'Log not found');
    }
    if (userId && log.userId !== userId) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, 'Access denied');
    }
    return log;
  }

  async getAll(filter: LogFilterSchema) {
    const { data, total } = await logRepository.findMany(filter);
    return {
      data,
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages: Math.ceil(total / filter.pageSize),
    };
  }

  async getStats(userId?: string, timeRange: StatsTimeRange = 'total') {
    return logRepository.getStats(userId, timeRange);
  }
}

export const logService = new LogService();
