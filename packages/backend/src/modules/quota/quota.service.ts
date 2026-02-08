import type { QuotaSummaryResponse, ModelQuotaSummary } from '@claude-code-router/shared';
import { prisma } from '../../lib/prisma.js';

export class QuotaService {
  async getSummary(): Promise<QuotaSummaryResponse> {
    // 获取所有活跃账号的额度信息
    const quotas = await prisma.accountQuota.findMany({
      where: {
        account: {
          isActive: true,
          status: 'active',
        },
      },
      include: {
        account: {
          select: { id: true },
        },
      },
    });

    // 按模型类别分组汇总
    const claudeQuotas: { accountId: string; percentage: number }[] = [];
    const geminiQuotas: { accountId: string; percentage: number }[] = [];
    const openaiQuotas: { accountId: string; percentage: number }[] = [];

    for (const quota of quotas) {
      const modelLower = quota.modelName.toLowerCase();
      if (modelLower.includes('claude')) {
        claudeQuotas.push({ accountId: quota.accountId, percentage: quota.percentage });
      } else if (modelLower.includes('gemini')) {
        geminiQuotas.push({ accountId: quota.accountId, percentage: quota.percentage });
      } else if (modelLower.includes('codex-5h') || modelLower.includes('codex-weekly') || modelLower.includes('openai')) {
        openaiQuotas.push({ accountId: quota.accountId, percentage: quota.percentage });
      }
    }

    // 计算汇总
    const claudeSummary = this.calculateSummary(claudeQuotas);
    const geminiSummary = this.calculateSummary(geminiQuotas);
    const openaiSummary = this.calculateSummary(openaiQuotas);

    return {
      claude: claudeSummary,
      gemini: geminiSummary,
      openai: openaiSummary,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  private calculateSummary(
    quotas: { accountId: string; percentage: number }[]
  ): ModelQuotaSummary | null {
    if (quotas.length === 0) {
      return null;
    }

    // 去重账号（每个账号只计算一次）
    const accountMap = new Map<string, number>();
    for (const q of quotas) {
      const existing = accountMap.get(q.accountId);
      // 如果同一个账号有多个 Claude/Gemini 模型，取最高的
      if (existing === undefined || q.percentage > existing) {
        accountMap.set(q.accountId, q.percentage);
      }
    }

    const totalAccounts = accountMap.size;
    const totalQuota = totalAccounts; // 每个账号算 1 份额度

    // 计算可用额度: 所有账号百分比之和 / 100
    let percentageSum = 0;
    for (const p of accountMap.values()) {
      percentageSum += p;
    }

    const availableQuota = percentageSum / 100;
    const percentage = totalAccounts > 0 ? Math.round(percentageSum / totalAccounts) : 0;

    return {
      totalAccounts,
      availableQuota: Math.round(availableQuota * 10) / 10, // 保留一位小数
      totalQuota,
      percentage,
    };
  }
}

export const quotaService = new QuotaService();
