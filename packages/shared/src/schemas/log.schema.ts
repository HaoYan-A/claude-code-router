import { z } from 'zod';
import { paginationSchema, dateRangeSchema } from './common.schema.js';

export const requestStatusSchema = z.enum(['success', 'error', 'pending']);

export const logFilterSchema = paginationSchema.merge(dateRangeSchema).extend({
  userId: z.string().uuid().optional(),
  apiKeyId: z.string().uuid().optional(),
  status: requestStatusSchema.optional(),
});

export const requestLogResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  apiKeyId: z.string().uuid(),
  method: z.string(),
  path: z.string(),
  status: requestStatusSchema,
  statusCode: z.number().nullable(),
  requestBody: z.string().nullable(),
  responseBody: z.string().nullable(),
  errorMessage: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  durationMs: z.number().nullable(),
  clientIp: z.string().nullable(),
  userAgent: z.string().nullable(),
  model: z.string().nullable(),
  targetModel: z.string().nullable(),
  platform: z.string().nullable(),
  accountId: z.string().nullable(),
  createdAt: z.coerce.date(),
  // 新增字段
  clientHeaders: z.string().nullable(),
  upstreamRequestHeaders: z.string().nullable(),
  upstreamRequestBody: z.string().nullable(),
  upstreamResponseHeaders: z.string().nullable(),
  upstreamResponseBody: z.string().nullable(),
  clientResponseHeaders: z.string().nullable(),
  cacheReadTokens: z.number().nullable(),
  cacheCreationTokens: z.number().nullable(),
  rawInputTokens: z.number().nullable(),
  rawOutputTokens: z.number().nullable(),
  rawCacheTokens: z.number().nullable(),
});

// 列表摘要 schema (用于列表页)
export const requestLogSummarySchema = z.object({
  id: z.string().uuid(),
  apiKeyId: z.string().uuid(),
  apiKeyName: z.string().nullable(),
  model: z.string().nullable(),
  platform: z.string().nullable(),
  targetModel: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  cacheReadTokens: z.number().nullable(),
  durationMs: z.number().nullable(),
  statusCode: z.number().nullable(),
  status: requestStatusSchema,
  createdAt: z.coerce.date(),
  // 账号信息
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
});

export const paginatedLogsResponseSchema = z.object({
  data: z.array(requestLogSummarySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export type LogFilterSchema = z.infer<typeof logFilterSchema>;
export type RequestLogResponse = z.infer<typeof requestLogResponseSchema>;
export type RequestLogSummary = z.infer<typeof requestLogSummarySchema>;
export type PaginatedLogsResponse = z.infer<typeof paginatedLogsResponseSchema>;
