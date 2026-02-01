import type { RequestLog, Prisma, RequestStatus } from '@prisma/client';
import type { LogFilterSchema, RequestLogSummary, StatsTimeRange } from '@claude-code-router/shared';
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
}

export const logRepository = new LogRepository();
