/**
 * 额度汇总相关类型定义
 */

// 单个模型的额度汇总
export interface ModelQuotaSummary {
  totalAccounts: number; // 有该模型额度的账号数
  availableQuota: number; // 可用额度总和 (如 0.2*10 = 2.0)
  totalQuota: number; // 账号总数（相当于总额度）
  percentage: number; // 可用百分比 (0-100)
}

// 额度汇总响应
export interface QuotaSummaryResponse {
  claude: ModelQuotaSummary | null;
  gemini: ModelQuotaSummary | null;
  lastUpdatedAt: string;
}
