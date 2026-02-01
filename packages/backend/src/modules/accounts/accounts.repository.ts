import type { ThirdPartyAccount, AccountQuota, Prisma, AccountPlatform, AccountStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { redis, cacheKeys } from '../../lib/redis.js';

const ACCOUNT_CACHE_TTL = 300; // 5 minutes
const QUOTA_CACHE_TTL = 60; // 1 minute

export interface AccountListParams {
  platform?: AccountPlatform;
  status?: AccountStatus;
  isActive?: boolean;
  schedulable?: boolean;
  page: number;
  limit: number;
}

export interface AccountWithQuotas extends ThirdPartyAccount {
  quotas: AccountQuota[];
}

export class AccountsRepository {
  async findById(id: string): Promise<AccountWithQuotas | null> {
    const cached = await redis.get(cacheKeys.account(id));
    if (cached) {
      return JSON.parse(cached);
    }

    const account = await prisma.thirdPartyAccount.findUnique({
      where: { id },
      include: { quotas: true },
    });

    if (account) {
      await redis.setex(cacheKeys.account(id), ACCOUNT_CACHE_TTL, JSON.stringify(account));
    }
    return account;
  }

  async findByPlatformId(platform: AccountPlatform, platformId: string): Promise<AccountWithQuotas | null> {
    return prisma.thirdPartyAccount.findUnique({
      where: { platform_platformId: { platform, platformId } },
      include: { quotas: true },
    });
  }

  async findMany(params: AccountListParams): Promise<{ data: AccountWithQuotas[]; total: number }> {
    const { platform, status, isActive, schedulable, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ThirdPartyAccountWhereInput = {};
    if (platform !== undefined) where.platform = platform;
    if (status !== undefined) where.status = status;
    if (isActive !== undefined) where.isActive = isActive;
    if (schedulable !== undefined) where.schedulable = schedulable;

    const [data, total] = await Promise.all([
      prisma.thirdPartyAccount.findMany({
        where,
        include: { quotas: true },
        skip,
        take: limit,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.thirdPartyAccount.count({ where }),
    ]);

    return { data, total };
  }

  async findAvailableForModel(modelName: string): Promise<AccountWithQuotas[]> {
    // 查找符合条件的账号：激活、状态正常、可调度、且该模型额度 > 0
    // 按 ID 排序，保证轮询顺序稳定
    return prisma.thirdPartyAccount.findMany({
      where: {
        isActive: true,
        status: 'active',
        schedulable: true,
        quotas: {
          some: {
            modelName,
            percentage: { gt: 0 },
          },
        },
      },
      include: { quotas: true },
      orderBy: [{ id: 'asc' }],
    });
  }

  async create(data: Prisma.ThirdPartyAccountCreateInput): Promise<AccountWithQuotas> {
    return prisma.thirdPartyAccount.create({
      data,
      include: { quotas: true },
    });
  }

  async update(id: string, data: Prisma.ThirdPartyAccountUpdateInput): Promise<AccountWithQuotas> {
    const account = await prisma.thirdPartyAccount.update({
      where: { id },
      data,
      include: { quotas: true },
    });

    await redis.del(cacheKeys.account(id));
    return account;
  }

  async delete(id: string): Promise<void> {
    await prisma.thirdPartyAccount.delete({ where: { id } });
    await Promise.all([
      redis.del(cacheKeys.account(id)),
      redis.del(cacheKeys.accountQuota(id)),
    ]);
  }

  async upsertQuota(
    accountId: string,
    modelName: string,
    percentage: number,
    resetTime: string | null
  ): Promise<AccountQuota> {
    const quota = await prisma.accountQuota.upsert({
      where: { accountId_modelName: { accountId, modelName } },
      create: {
        accountId,
        modelName,
        percentage,
        resetTime,
        lastUpdatedAt: new Date(),
      },
      update: {
        percentage,
        resetTime,
        lastUpdatedAt: new Date(),
      },
    });

    await redis.del(cacheKeys.accountQuota(accountId));
    await redis.del(cacheKeys.account(accountId));
    return quota;
  }

  async getQuotas(accountId: string): Promise<AccountQuota[]> {
    const cached = await redis.get(cacheKeys.accountQuota(accountId));
    if (cached) {
      return JSON.parse(cached);
    }

    const quotas = await prisma.accountQuota.findMany({
      where: { accountId },
    });

    await redis.setex(cacheKeys.accountQuota(accountId), QUOTA_CACHE_TTL, JSON.stringify(quotas));
    return quotas;
  }

  async updateUsageStats(
    id: string,
    stats: {
      totalRequests?: number;
      totalInputTokens?: number;
      totalOutputTokens?: number;
      totalCacheTokens?: number;
      lastUsedAt?: Date;
    }
  ): Promise<void> {
    await prisma.thirdPartyAccount.update({
      where: { id },
      data: {
        totalRequests: stats.totalRequests !== undefined ? { increment: stats.totalRequests } : undefined,
        totalInputTokens: stats.totalInputTokens !== undefined ? { increment: stats.totalInputTokens } : undefined,
        totalOutputTokens: stats.totalOutputTokens !== undefined ? { increment: stats.totalOutputTokens } : undefined,
        totalCacheTokens: stats.totalCacheTokens !== undefined ? { increment: stats.totalCacheTokens } : undefined,
        lastUsedAt: stats.lastUsedAt,
      },
    });
    await redis.del(cacheKeys.account(id));
  }
}

export const accountsRepository = new AccountsRepository();
