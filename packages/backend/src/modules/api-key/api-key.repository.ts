import { randomBytes, createHash } from 'crypto';
import type { ApiKey, ApiKeyModelMapping, Prisma } from '@prisma/client';
import type {
  CreateApiKeySchema,
  UpdateApiKeySchema,
  PaginationInput,
  ModelMapping,
} from '@claude-code-router/shared';
import { DEFAULT_MODEL_MAPPINGS, CLAUDE_MODEL_SLOTS } from '@claude-code-router/shared';
import { prisma } from '../../lib/prisma.js';
import { redis, cacheKeys } from '../../lib/redis.js';
import { generateRandomName } from '../../utils/name-generator.js';
import { modelMappingCache } from './model-mapping.cache.js';

const API_KEY_CACHE_TTL = 300; // 5 minutes

type ApiKeyWithMappings = ApiKey & { modelMappings: ApiKeyModelMapping[] };

export class ApiKeyRepository {
  async findById(id: string): Promise<ApiKeyWithMappings | null> {
    return prisma.apiKey.findUnique({
      where: { id },
      include: { modelMappings: true },
    });
  }

  async findByKeyHash(keyHash: string): Promise<ApiKeyWithMappings | null> {
    const cached = await redis.get(cacheKeys.apiKey(keyHash));
    if (cached) {
      return JSON.parse(cached);
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { modelMappings: true },
    });
    if (apiKey) {
      await redis.setex(cacheKeys.apiKey(keyHash), API_KEY_CACHE_TTL, JSON.stringify(apiKey));
    }
    return apiKey;
  }

  async findByUserId(
    userId: string,
    pagination: PaginationInput
  ): Promise<{ data: ApiKeyWithMappings[]; total: number }> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      prisma.apiKey.findMany({
        where: { userId },
        include: { modelMappings: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.apiKey.count({ where: { userId } }),
    ]);

    return { data, total };
  }

  async findByUserIdAndName(userId: string, name: string): Promise<ApiKey | null> {
    return prisma.apiKey.findUnique({
      where: { userId_name: { userId, name } },
    });
  }

  async findAll(
    pagination: PaginationInput,
    userId?: string
  ): Promise<{
    data: (ApiKeyWithMappings & { user: { id: string; githubUsername: string; avatarUrl: string | null } })[];
    total: number;
  }> {
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const whereClause = userId ? { userId } : {};

    const [data, total] = await Promise.all([
      prisma.apiKey.findMany({
        where: whereClause,
        include: {
          modelMappings: true,
          user: {
            select: {
              id: true,
              githubUsername: true,
              avatarUrl: true,
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.apiKey.count({ where: whereClause }),
    ]);

    return { data, total };
  }

  async create(
    userId: string,
    input: CreateApiKeySchema
  ): Promise<ApiKeyWithMappings & { key: string }> {
    const key = this.generateKey();
    const keyHash = this.hashKey(key);
    const keyPrefix = key.slice(0, 8);
    const name = input.name || generateRandomName();

    // 使用提供的映射或默认映射
    const mappings: ModelMapping[] = input.modelMappings || CLAUDE_MODEL_SLOTS.map((slot) => ({
      claudeModel: slot,
      platform: DEFAULT_MODEL_MAPPINGS[slot].platform,
      targetModel: DEFAULT_MODEL_MAPPINGS[slot].model,
    }));

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        keyPrefix,
        fullKey: key,
        expiresAt: input.expiresAt,
        modelMappings: {
          create: mappings.map((m) => ({
            claudeModel: m.claudeModel,
            platform: m.platform,
            targetModel: m.targetModel,
          })),
        },
      },
      include: { modelMappings: true },
    });

    // 更新内存缓存
    modelMappingCache.set(apiKey.id, mappings);

    return { ...apiKey, key };
  }

  async update(id: string, input: UpdateApiKeySchema): Promise<ApiKeyWithMappings> {
    const updateData: Prisma.ApiKeyUpdateInput = {};

    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
    }

    // 如果有模型映射更新，先删除旧的再创建新的
    if (input.modelMappings) {
      await prisma.apiKeyModelMapping.deleteMany({ where: { apiKeyId: id } });
      updateData.modelMappings = {
        create: input.modelMappings.map((m) => ({
          claudeModel: m.claudeModel,
          platform: m.platform,
          targetModel: m.targetModel,
        })),
      };
    }

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      include: { modelMappings: true },
    });

    // 清除 Redis 缓存
    await redis.del(cacheKeys.apiKey(apiKey.keyHash));

    // 更新或清除内存缓存
    if (input.modelMappings) {
      modelMappingCache.set(id, input.modelMappings);
    } else {
      modelMappingCache.delete(id);
    }

    return apiKey;
  }

  async updateLastUsed(id: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    const apiKey = await prisma.apiKey.delete({ where: { id } });
    await redis.del(cacheKeys.apiKey(apiKey.keyHash));
    modelMappingCache.delete(id);
  }

  async getModelMappings(apiKeyId: string): Promise<ModelMapping[]> {
    // 先查内存缓存
    const cached = modelMappingCache.get(apiKeyId);
    if (cached) {
      return cached;
    }

    // 从数据库加载
    const mappings = await prisma.apiKeyModelMapping.findMany({
      where: { apiKeyId },
    });

    const result: ModelMapping[] = mappings.map((m) => ({
      claudeModel: m.claudeModel as ModelMapping['claudeModel'],
      platform: m.platform as ModelMapping['platform'],
      targetModel: m.targetModel,
    }));

    // 存入缓存
    modelMappingCache.set(apiKeyId, result);

    return result;
  }

  async getFullKey(id: string): Promise<string | null> {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
      select: { fullKey: true },
    });
    return apiKey?.fullKey ?? null;
  }

  generateKey(): string {
    return `ccr_${randomBytes(32).toString('hex')}`;
  }

  hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}

export const apiKeyRepository = new ApiKeyRepository();
