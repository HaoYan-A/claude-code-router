import type { LogFilterSchema, StatsTimeRange, LeaderboardTimeRange, LeaderboardItem, LeaderboardResponse } from '@claude-code-router/shared';
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

  /**
   * 用户名脱敏处理
   * @param username 原始用户名
   * @param isCurrentUser 是否为当前用户
   * @returns 脱敏后的用户名（当前用户显示完整名称）
   */
  private maskUsername(username: string, isCurrentUser: boolean): string {
    if (isCurrentUser) {
      return username;
    }
    // 保留前3个字符，后面用 *** 代替
    if (username.length <= 3) {
      return username.charAt(0) + '***';
    }
    return username.slice(0, 3) + '***';
  }

  /**
   * 获取用户消费排行榜
   * @param timeRange 时间范围
   * @param currentUserId 当前登录用户的 ID
   * @returns 排行榜数据
   */
  async getLeaderboard(timeRange: LeaderboardTimeRange, currentUserId: string): Promise<LeaderboardResponse> {
    const rawItems = await logRepository.getLeaderboard(timeRange);

    const items: LeaderboardItem[] = rawItems.map((item) => {
      const isCurrentUser = item.userId === currentUserId;
      return {
        rank: item.rank,
        userId: item.userId,
        username: this.maskUsername(item.username, isCurrentUser),
        avatarUrl: item.avatarUrl,
        totalCost: item.totalCost,
        requestCount: item.requestCount,
        isCurrentUser,
      };
    });

    return {
      timeRange,
      items,
    };
  }
}

export const logService = new LogService();
