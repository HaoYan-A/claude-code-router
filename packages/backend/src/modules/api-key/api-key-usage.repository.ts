import type { Decimal } from '@prisma/client/runtime/library';
import type { StatsTimeRange, ApiKeyUsageStats, ApiKeyDailyUsage } from '@claude-code-router/shared';
import { prisma } from '../../lib/prisma.js';

export class ApiKeyUsageRepository {
  async incrementDailyUsage(
    apiKeyId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cost: number
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.apiKeyDailyUsage.upsert({
      where: {
        apiKeyId_date_model: {
          apiKeyId,
          date: today,
          model,
        },
      },
      create: {
        apiKeyId,
        date: today,
        model,
        requestCount: 1,
        inputTokens,
        outputTokens,
        cost,
      },
      update: {
        requestCount: { increment: 1 },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        cost: { increment: cost },
      },
    });
  }

  async getStats(apiKeyId: string, timeRange: StatsTimeRange): Promise<ApiKeyUsageStats> {
    const startDate = this.getStartDate(timeRange);

    const whereClause = {
      apiKeyId,
      ...(startDate && { date: { gte: startDate } }),
    };

    const [aggregated, byModel] = await Promise.all([
      prisma.apiKeyDailyUsage.aggregate({
        where: whereClause,
        _sum: {
          requestCount: true,
          inputTokens: true,
          outputTokens: true,
          cost: true,
        },
      }),
      prisma.apiKeyDailyUsage.groupBy({
        by: ['model'],
        where: whereClause,
        _sum: {
          requestCount: true,
          inputTokens: true,
          outputTokens: true,
          cost: true,
        },
      }),
    ]);

    return {
      timeRange,
      totalRequests: aggregated._sum.requestCount ?? 0,
      totalInputTokens: aggregated._sum.inputTokens ?? 0,
      totalOutputTokens: aggregated._sum.outputTokens ?? 0,
      totalCost: this.decimalToNumber(aggregated._sum.cost),
      byModel: byModel.map((item) => ({
        model: item.model,
        requestCount: item._sum.requestCount ?? 0,
        inputTokens: item._sum.inputTokens ?? 0,
        outputTokens: item._sum.outputTokens ?? 0,
        cost: this.decimalToNumber(item._sum.cost),
      })),
    };
  }

  async getDailyUsage(
    apiKeyId: string,
    timeRange: StatsTimeRange
  ): Promise<ApiKeyDailyUsage[]> {
    const startDate = this.getStartDate(timeRange);

    const whereClause = {
      apiKeyId,
      ...(startDate && { date: { gte: startDate } }),
    };

    const records = await prisma.apiKeyDailyUsage.findMany({
      where: whereClause,
      orderBy: { date: 'asc' },
    });

    return records.map((record) => ({
      date: record.date.toISOString().split('T')[0],
      model: record.model,
      requestCount: record.requestCount,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      cost: this.decimalToNumber(record.cost),
    }));
  }

  private getStartDate(timeRange: StatsTimeRange): Date | null {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    switch (timeRange) {
      case 'day':
        return now;
      case 'week':
        now.setDate(now.getDate() - 7);
        return now;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        return now;
      case 'total':
        return null;
    }
  }

  private decimalToNumber(decimal: Decimal | null): number {
    if (!decimal) return 0;
    return Number(decimal);
  }
}

export const apiKeyUsageRepository = new ApiKeyUsageRepository();
