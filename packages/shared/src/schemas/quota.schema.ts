import { z } from 'zod';

// 单个模型的额度汇总 Schema
export const modelQuotaSummarySchema = z.object({
  totalAccounts: z.number().int().min(0),
  availableQuota: z.number().min(0),
  totalQuota: z.number().min(0),
  percentage: z.number().min(0).max(100),
});

// 额度汇总响应 Schema
export const quotaSummaryResponseSchema = z.object({
  claude: modelQuotaSummarySchema.nullable(),
  gemini: modelQuotaSummarySchema.nullable(),
  openai: modelQuotaSummarySchema.nullable(),
  lastUpdatedAt: z.string(),
});

// 类型导出
export type ModelQuotaSummarySchema = z.infer<typeof modelQuotaSummarySchema>;
export type QuotaSummaryResponseSchema = z.infer<typeof quotaSummaryResponseSchema>;
