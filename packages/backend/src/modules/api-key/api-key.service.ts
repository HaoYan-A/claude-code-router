import type {
  CreateApiKeySchema,
  UpdateApiKeySchema,
  PaginationInput,
  StatsTimeRange,
  ApiKeyUsageStats,
  ApiKeyDailyUsage,
  ModelMapping,
} from '@claude-code-router/shared';
import { ErrorCodes } from '@claude-code-router/shared';
import { apiKeyRepository } from './api-key.repository.js';
import { apiKeyUsageRepository } from './api-key-usage.repository.js';
import { AppError } from '../../middlewares/error.middleware.js';

function transformMappings(
  mappings: { claudeModel: string; platform: string; targetModel: string; reasoningEffort?: string | null }[]
): ModelMapping[] {
  return mappings.map((m) => ({
    claudeModel: m.claudeModel as ModelMapping['claudeModel'],
    platform: m.platform as ModelMapping['platform'],
    targetModel: m.targetModel,
    reasoningEffort: m.reasoningEffort ?? undefined,
  }));
}

export class ApiKeyService {
  async getById(id: string, userId: string) {
    const apiKey = await apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new AppError(404, ErrorCodes.API_KEY_NOT_FOUND, 'API key not found');
    }
    if (apiKey.userId !== userId) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, 'Access denied');
    }
    return {
      ...apiKey,
      modelMappings: transformMappings(apiKey.modelMappings),
    };
  }

  async getByUserId(userId: string, pagination: PaginationInput) {
    const { data, total } = await apiKeyRepository.findByUserId(userId, pagination);
    return {
      data: data.map((key) => ({
        ...key,
        modelMappings: transformMappings(key.modelMappings),
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };
  }

  async create(userId: string, input: CreateApiKeySchema) {
    // 检查名称唯一性（如果提供了名称）
    if (input.name) {
      const existing = await apiKeyRepository.findByUserIdAndName(userId, input.name);
      if (existing) {
        throw new AppError(400, ErrorCodes.DUPLICATE_KEY_NAME, 'API key name already exists');
      }
    }

    const result = await apiKeyRepository.create(userId, input);
    return {
      ...result,
      modelMappings: transformMappings(result.modelMappings),
    };
  }

  async update(id: string, userId: string, input: UpdateApiKeySchema) {
    const existing = await this.getById(id, userId);

    // 检查名称唯一性（如果更新名称）
    if (input.name && input.name !== existing.name) {
      const duplicate = await apiKeyRepository.findByUserIdAndName(userId, input.name);
      if (duplicate && duplicate.id !== id) {
        throw new AppError(400, ErrorCodes.DUPLICATE_KEY_NAME, 'API key name already exists');
      }
    }

    const result = await apiKeyRepository.update(id, input);
    return {
      ...result,
      modelMappings: transformMappings(result.modelMappings),
    };
  }

  async delete(id: string, userId: string) {
    await this.getById(id, userId);
    await apiKeyRepository.delete(id);
  }

  async getStats(
    id: string,
    userId: string,
    timeRange: StatsTimeRange,
    includeDaily: boolean
  ): Promise<{ stats: ApiKeyUsageStats; daily?: ApiKeyDailyUsage[] }> {
    await this.getById(id, userId);

    const stats = await apiKeyUsageRepository.getStats(id, timeRange);
    const result: { stats: ApiKeyUsageStats; daily?: ApiKeyDailyUsage[] } = { stats };

    if (includeDaily) {
      result.daily = await apiKeyUsageRepository.getDailyUsage(id, timeRange);
    }

    return result;
  }

  async getModelMappings(apiKeyId: string): Promise<ModelMapping[]> {
    return apiKeyRepository.getModelMappings(apiKeyId);
  }

  async getFullKey(id: string, userId: string): Promise<string> {
    const apiKey = await apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new AppError(404, ErrorCodes.API_KEY_NOT_FOUND, 'API key not found');
    }
    if (apiKey.userId !== userId) {
      throw new AppError(403, ErrorCodes.FORBIDDEN, 'Access denied');
    }

    const fullKey = await apiKeyRepository.getFullKey(id);
    if (!fullKey) {
      throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Full key not available for this API key');
    }

    return fullKey;
  }

  async validateKey(key: string) {
    const keyHash = apiKeyRepository.hashKey(key);
    const apiKey = await apiKeyRepository.findByKeyHash(keyHash);

    if (!apiKey) {
      throw new AppError(401, ErrorCodes.API_KEY_INVALID, 'Invalid API key');
    }

    if (!apiKey.isActive) {
      throw new AppError(401, ErrorCodes.API_KEY_INACTIVE, 'API key is inactive');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new AppError(401, ErrorCodes.API_KEY_EXPIRED, 'API key has expired');
    }

    await apiKeyRepository.updateLastUsed(apiKey.id);
    return {
      ...apiKey,
      modelMappings: transformMappings(apiKey.modelMappings),
    };
  }

  // ==================== Admin 方法 ====================

  async getAllAdmin(pagination: PaginationInput, userId?: string) {
    const { data, total } = await apiKeyRepository.findAll(pagination, userId);
    return {
      data: data.map((key) => ({
        ...key,
        modelMappings: transformMappings(key.modelMappings),
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
    };
  }

  async getByIdAdmin(id: string) {
    const apiKey = await apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new AppError(404, ErrorCodes.API_KEY_NOT_FOUND, 'API key not found');
    }
    return {
      ...apiKey,
      modelMappings: transformMappings(apiKey.modelMappings),
    };
  }

  async updateAdmin(id: string, input: UpdateApiKeySchema) {
    const existing = await this.getByIdAdmin(id);

    // 检查名称唯一性（如果更新名称）
    if (input.name && input.name !== existing.name) {
      const duplicate = await apiKeyRepository.findByUserIdAndName(existing.userId, input.name);
      if (duplicate && duplicate.id !== id) {
        throw new AppError(400, ErrorCodes.DUPLICATE_KEY_NAME, 'API key name already exists');
      }
    }

    const result = await apiKeyRepository.update(id, input);
    return {
      ...result,
      modelMappings: transformMappings(result.modelMappings),
    };
  }

  async deleteAdmin(id: string) {
    await this.getByIdAdmin(id);
    await apiKeyRepository.delete(id);
  }

  async getStatsAdmin(
    id: string,
    timeRange: StatsTimeRange,
    includeDaily: boolean
  ): Promise<{ stats: ApiKeyUsageStats; daily?: ApiKeyDailyUsage[] }> {
    await this.getByIdAdmin(id);

    const stats = await apiKeyUsageRepository.getStats(id, timeRange);
    const result: { stats: ApiKeyUsageStats; daily?: ApiKeyDailyUsage[] } = { stats };

    if (includeDaily) {
      result.daily = await apiKeyUsageRepository.getDailyUsage(id, timeRange);
    }

    return result;
  }

  async getFullKeyAdmin(id: string): Promise<string> {
    const apiKey = await apiKeyRepository.findById(id);
    if (!apiKey) {
      throw new AppError(404, ErrorCodes.API_KEY_NOT_FOUND, 'API key not found');
    }

    const fullKey = await apiKeyRepository.getFullKey(id);
    if (!fullKey) {
      throw new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Full key not available for this API key');
    }

    return fullKey;
  }
}

export const apiKeyService = new ApiKeyService();
