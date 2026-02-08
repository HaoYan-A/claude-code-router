import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { QuotaProgressBar } from './QuotaProgressBar';
import { useAccountQuota, useRefreshQuota } from '@/lib/queries/accounts';
import type { AccountQuota } from '@claude-code-router/shared';

interface QuotaBreakdownCardProps {
  accountId: string;
}

// 聚合配额：Antigravity 按 Claude/Gemini 分类，OpenAI 按 5h/周限分类
function aggregateQuotas(quotas: AccountQuota[]) {
  if (!quotas || quotas.length === 0) return [];

  const result = [];

  // Antigravity: Claude / Gemini
  const claudeQuota = quotas.find((q) => q.modelName.toLowerCase().includes('claude'));
  const geminiQuota = quotas.find((q) => q.modelName.toLowerCase().includes('gemini'));
  if (claudeQuota) result.push({ ...claudeQuota, modelName: 'Claude' });
  if (geminiQuota) result.push({ ...geminiQuota, modelName: 'Gemini' });

  // OpenAI Codex: 5h / 周限
  const codex5h = quotas.find((q) => q.modelName === 'codex-5h');
  const codexWeekly = quotas.find((q) => q.modelName === 'codex-weekly');
  if (codex5h) result.push({ ...codex5h, modelName: '5h' });
  if (codexWeekly) result.push({ ...codexWeekly, modelName: '周限' });

  return result;
}

export function QuotaBreakdownCard({ accountId }: QuotaBreakdownCardProps) {
  const { data, isLoading } = useAccountQuota(accountId);
  const refreshMutation = useRefreshQuota();

  const quotas = data?.data || [];
  const aggregatedQuotas = aggregateQuotas(quotas);

  const handleRefresh = () => {
    refreshMutation.mutate(accountId);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">配额详情</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
          >
            {refreshMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : aggregatedQuotas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            暂无配额数据
          </p>
        ) : (
          aggregatedQuotas.map((quota) => (
            <QuotaProgressBar
              key={quota.id}
              percentage={quota.percentage}
              modelName={quota.modelName}
              resetTime={quota.resetTime}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
