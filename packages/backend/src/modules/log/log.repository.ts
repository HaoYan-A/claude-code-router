import type { RequestLog, Prisma, RequestStatus } from '@prisma/client';
import type { LogFilterSchema, RequestLogSummary, StatsTimeRange, LeaderboardTimeRange } from '@claude-code-router/shared';
import { prisma } from '../../lib/prisma.js';

export class LogRepository {
  async findById(id: string): Promise<RequestLog | null> {
    return prisma.requestLog.findUnique({ where: { id } });
  }

  async findByIdWithDetails(id: string): Promise<RequestLog | null> {
    return prisma.requestLog.findUnique({
      where: { id },
    });
  }

  async findMany(filter: LogFilterSchema): Promise<{ data: RequestLogSummary[]; total: number }> {
    const { page, pageSize, userId, apiKeyId, status, startDate, endDate } = filter;
    const skip = (page - 1) * pageSize;

    const where: Prisma.RequestLogWhereInput = {};

    if (userId) where.userId = userId;
    if (apiKeyId) where.apiKeyId = apiKeyId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [rawData, total] = await Promise.all([
      prisma.requestLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          apiKeyId: true,
          accountId: true,
          model: true,
          platform: true,
          targetModel: true,
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          durationMs: true,
          statusCode: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              githubUsername: true,
            },
          },
          apiKey: {
            select: {
              name: true,
            },
          },
          account: {
            select: {
              name: true,
              platformId: true,
            },
          },
        },
      }),
      prisma.requestLog.count({ where }),
    ]);

    const data: RequestLogSummary[] = rawData.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: log.user?.githubUsername ?? null,
      apiKeyId: log.apiKeyId,
      apiKeyName: log.apiKey?.name ?? null,
      model: log.model,
      platform: log.platform,
      targetModel: log.targetModel,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      cacheReadTokens: log.cacheReadTokens,
      durationMs: log.durationMs,
      statusCode: log.statusCode,
      status: log.status,
      createdAt: log.createdAt,
      accountId: log.accountId,
      accountName: log.account?.name ?? log.account?.platformId ?? null,
    }));

    return { data, total };
  }

  async create(data: {
    userId: string;
    apiKeyId: string;
    method: string;
    path: string;
    clientIp?: string;
    userAgent?: string;
    requestBody?: string;
    model?: string;
    clientHeaders?: string;
    upstreamRequestHeaders?: string;
    upstreamRequestBody?: string;
  }): Promise<RequestLog> {
    return prisma.requestLog.create({
      data: {
        ...data,
        status: 'pending',
      },
    });
  }

  async update(
    id: string,
    data: {
      status?: RequestStatus;
      statusCode?: number;
      responseBody?: string;
      errorMessage?: string;
      inputTokens?: number;
      outputTokens?: number;
      durationMs?: number;
      targetModel?: string;
      platform?: string;
      accountId?: string;
      upstreamRequestHeaders?: string;
      upstreamRequestBody?: string;
      upstreamResponseHeaders?: string;
      upstreamResponseBody?: string;
      clientResponseHeaders?: string;
      cacheReadTokens?: number;
      cacheCreationTokens?: number;
      rawInputTokens?: number;
      rawOutputTokens?: number;
      rawCacheTokens?: number;
    }
  ): Promise<RequestLog> {
    return prisma.requestLog.update({
      where: { id },
      data,
    });
  }

  async getStats(userId?: string, timeRange: StatsTimeRange = 'total') {
    const where: Prisma.RequestLogWhereInput = userId ? { userId } : {};

    // 添加时间过滤
    if (timeRange !== 'total') {
      const now = new Date();
      let startDate: Date;
      if (timeRange === 'day') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeRange === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        // month
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      where.createdAt = { gte: startDate };
    }

    const [total, success, error, aggregates] = await Promise.all([
      prisma.requestLog.count({ where }),
      prisma.requestLog.count({ where: { ...where, status: 'success' } }),
      prisma.requestLog.count({ where: { ...where, status: 'error' } }),
      prisma.requestLog.aggregate({
        where,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cost: true,
        },
      }),
    ]);

    return {
      totalRequests: total,
      successRequests: success,
      errorRequests: error,
      totalInputTokens: aggregates._sum.inputTokens ?? 0,
      totalOutputTokens: aggregates._sum.outputTokens ?? 0,
      totalCost: aggregates._sum.cost?.toNumber() ?? 0,
    };
  }

  private getLeaderboardStartDate(timeRange: LeaderboardTimeRange): Date {
    const now = new Date();

    if (timeRange === 'day') {
      // 本日：今天0点开始
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (timeRange === 'week') {
      // 本周：周一0点开始
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 周日为0，需要特殊处理
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    }

    // 本月：本月1号0点开始
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * 获取用户消费排行榜数据
   * @param timeRange 时间范围：day=本日, week=本周, month=本月
   * @returns 按费用降序排列的前5名用户
   */
  async getLeaderboard(timeRange: LeaderboardTimeRange) {
    const startDate = this.getLeaderboardStartDate(timeRange);

    // 使用 groupBy 按 userId 聚合
    const aggregatedData = await prisma.requestLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: startDate },
        status: 'success',
      },
      _sum: {
        cost: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          cost: 'desc',
        },
      },
      take: 5,
    });

    // 获取用户信息
    const userIds = aggregatedData.map((item) => item.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        githubUsername: true,
        avatarUrl: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return aggregatedData.map((item, index) => {
      const user = userMap.get(item.userId);
      return {
        rank: index + 1,
        userId: item.userId,
        username: user?.githubUsername ?? 'Unknown',
        avatarUrl: user?.avatarUrl ?? null,
        totalCost: item._sum.cost?.toNumber() ?? 0,
        requestCount: item._count.id,
      };
    });
  }

  async getModelLeaderboard(timeRange: LeaderboardTimeRange) {
    const startDate = this.getLeaderboardStartDate(timeRange);

    return prisma.requestLog.groupBy({
      by: ['platform', 'targetModel', 'model'],
      where: {
        createdAt: { gte: startDate },
        status: 'success',
        platform: { not: null },
        OR: [{ targetModel: { not: null } }, { model: { not: null } }],
      },
      _sum: {
        cost: true,
      },
      _count: {
        id: true,
      },
      orderBy: [{ _count: { id: 'desc' } }, { _sum: { cost: 'desc' } }],
      take: 100,
    });
  }
}

export const logRepository = new LogRepository();
