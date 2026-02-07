import type { ClaudeModelSlot, PlatformId, StatsTimeRange } from '../constants/models.js';

export interface ModelMapping {
  claudeModel: ClaudeModelSlot;
  platform: PlatformId;
  targetModel: string;
  reasoningEffort?: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyWithMappings extends ApiKey {
  modelMappings: ModelMapping[];
}

export interface ApiKeyWithKey extends ApiKeyWithMappings {
  key: string;
}

export interface ApiKeyWithUser extends ApiKeyWithMappings {
  user: {
    id: string;
    githubUsername: string;
    avatarUrl: string | null;
  };
}

export interface ModelUsageStats {
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface ApiKeyUsageStats {
  timeRange: StatsTimeRange;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byModel: ModelUsageStats[];
}

export interface ApiKeyDailyUsage {
  date: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export type CreateApiKeyInput = {
  name?: string;
  expiresAt?: Date | null;
  modelMappings?: ModelMapping[];
};

export type UpdateApiKeyInput = {
  name?: string;
  isActive?: boolean;
  modelMappings?: ModelMapping[];
};
