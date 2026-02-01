import { z } from 'zod';
import { CLAUDE_MODEL_SLOTS, STATS_TIME_RANGES } from '../constants/models.js';

// 模型映射 Schema
export const modelMappingSchema = z.object({
  claudeModel: z.enum(CLAUDE_MODEL_SLOTS),
  platform: z.enum(['antigravity', 'kiro']),
  targetModel: z.string().min(1),
});

// 验证三个映射都存在
export const modelMappingsSchema = z
  .array(modelMappingSchema)
  .length(3)
  .refine(
    (mappings) => {
      const slots = mappings.map((m) => m.claudeModel);
      return CLAUDE_MODEL_SLOTS.every((slot) => slots.includes(slot));
    },
    { message: 'All three model slots (opus, sonnet, haiku) must be configured' }
  );

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  modelMappings: modelMappingsSchema.optional(),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  modelMappings: modelMappingsSchema.optional(),
});

export const apiKeyStatsQuerySchema = z.object({
  timeRange: z.enum(STATS_TIME_RANGES).default('month'),
  includeDaily: z.coerce.boolean().default(false),
});

export const apiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  isActive: z.boolean(),
  expiresAt: z.coerce.date().nullable(),
  lastUsedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const apiKeyWithMappingsResponseSchema = apiKeyResponseSchema.extend({
  modelMappings: z.array(modelMappingSchema),
});

export const apiKeyWithKeyResponseSchema = apiKeyWithMappingsResponseSchema.extend({
  key: z.string(),
});

export const apiKeyWithUserResponseSchema = apiKeyWithMappingsResponseSchema.extend({
  user: z.object({
    id: z.string().uuid(),
    githubUsername: z.string(),
    avatarUrl: z.string().nullable(),
  }),
});

export const modelUsageStatsSchema = z.object({
  model: z.string(),
  requestCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cost: z.number(),
});

export const apiKeyUsageStatsSchema = z.object({
  timeRange: z.enum(STATS_TIME_RANGES),
  totalRequests: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalCost: z.number(),
  byModel: z.array(modelUsageStatsSchema),
});

export const apiKeyDailyUsageSchema = z.object({
  date: z.string(),
  model: z.string(),
  requestCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cost: z.number(),
});

export type CreateApiKeySchema = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeySchema = z.infer<typeof updateApiKeySchema>;
export type ApiKeyStatsQuerySchema = z.infer<typeof apiKeyStatsQuerySchema>;
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;
export type ApiKeyWithMappingsResponse = z.infer<typeof apiKeyWithMappingsResponseSchema>;
export type ApiKeyWithKeyResponse = z.infer<typeof apiKeyWithKeyResponseSchema>;
export type ApiKeyWithUserResponse = z.infer<typeof apiKeyWithUserResponseSchema>;
export type ModelMappingSchema = z.infer<typeof modelMappingSchema>;
export type ApiKeyUsageStatsResponse = z.infer<typeof apiKeyUsageStatsSchema>;
export type ApiKeyDailyUsageResponse = z.infer<typeof apiKeyDailyUsageSchema>;
