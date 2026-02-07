import { z } from 'zod';

// 平台类型
export const accountPlatformSchema = z.enum(['antigravity', 'kiro', 'openai']);

// 账号状态
export const accountStatusSchema = z.enum(['created', 'active', 'expired', 'error']);

// 账号额度 Schema
export const accountQuotaSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  modelName: z.string(),
  percentage: z.number().int().min(0).max(100),
  resetTime: z.string().nullable(),
  lastUpdatedAt: z.coerce.date(),
});

// 第三方账号响应 Schema
export const thirdPartyAccountSchema = z.object({
  id: z.string().uuid(),
  platform: accountPlatformSchema,
  platformId: z.string(),
  name: z.string().nullable(),
  tokenExpiresAt: z.coerce.date().nullable(),
  subscriptionTier: z.string().nullable(),
  subscriptionExpiresAt: z.coerce.date().nullable(),
  subscriptionRaw: z.unknown().nullable(),
  isActive: z.boolean(),
  status: accountStatusSchema,
  errorMessage: z.string().nullable(),
  priority: z.number().int().min(1).max(100),
  schedulable: z.boolean(),
  totalRequests: z.number().int(),
  totalInputTokens: z.number().int(),
  totalOutputTokens: z.number().int(),
  totalCacheTokens: z.number().int(),
  lastUsedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  quotas: z.array(accountQuotaSchema).optional(),
});

// 创建账号请求 Schema
export const createAccountSchema = z.object({
  platform: accountPlatformSchema,
  name: z.string().min(1).max(100).optional(),
  refreshToken: z.string().min(1),
  priority: z.number().int().min(1).max(100).default(50),
  schedulable: z.boolean().default(true),
});

// 更新账号请求 Schema
export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  schedulable: z.boolean().optional(),
  openaiBaseUrl: z.string().url().optional(),
  openaiApiKey: z.string().min(1).optional(),
});

// OAuth 授权 URL 响应 Schema
export const oauthUrlResponseSchema = z.object({
  url: z.string().url(),
});

// OAuth Code 交换请求 Schema
export const oauthExchangeSchema = z.object({
  codeUrl: z.string().url(),
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(1).max(100).default(50),
  schedulable: z.boolean().default(true),
});

// 账号列表查询参数 Schema
export const accountListQuerySchema = z.object({
  platform: accountPlatformSchema.optional(),
  status: accountStatusSchema.optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  schedulable: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// 可用账号查询参数 Schema
export const availableAccountQuerySchema = z.object({
  model: z.string().min(1),
});

// 平台模型 Schema
export const platformModelSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// 平台模型列表响应 Schema
export const platformModelsResponseSchema = z.record(z.string(), z.array(platformModelSchema));

// Kiro 导入请求 Schema（简化版：只需 refreshToken，自动刷新获取 accessToken）
export const importKiroAccountSchema = z.object({
  refreshToken: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  clientIdHash: z.string().min(1), // 用作 platformId
  region: z.string().min(1), // 如 "us-east-1"
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(1).max(100).default(50),
  schedulable: z.boolean().default(true),
});

// OpenAI 导入请求 Schema
export const importOpenAIAccountSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  priority: z.number().int().min(1).max(100).default(50),
  schedulable: z.boolean().default(true),
});

// 类型导出
export type AccountPlatformSchema = z.infer<typeof accountPlatformSchema>;
export type AccountStatusSchema = z.infer<typeof accountStatusSchema>;
export type AccountQuotaSchema = z.infer<typeof accountQuotaSchema>;
export type ThirdPartyAccountSchema = z.infer<typeof thirdPartyAccountSchema>;
export type CreateAccountSchema = z.infer<typeof createAccountSchema>;
export type UpdateAccountSchema = z.infer<typeof updateAccountSchema>;
export type OAuthUrlResponseSchema = z.infer<typeof oauthUrlResponseSchema>;
export type OAuthExchangeSchema = z.infer<typeof oauthExchangeSchema>;
export type AccountListQuerySchema = z.infer<typeof accountListQuerySchema>;
export type AvailableAccountQuerySchema = z.infer<typeof availableAccountQuerySchema>;
export type PlatformModelSchema = z.infer<typeof platformModelSchema>;
export type PlatformModelsResponseSchema = z.infer<typeof platformModelsResponseSchema>;
export type ImportKiroAccountSchema = z.infer<typeof importKiroAccountSchema>;
export type ImportOpenAIAccountSchema = z.infer<typeof importOpenAIAccountSchema>;
