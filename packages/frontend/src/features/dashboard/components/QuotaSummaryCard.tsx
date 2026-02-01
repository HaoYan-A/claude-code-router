import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuotaSummary } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { ModelQuotaSummary } from '@claude-code-router/shared';
import { Loader2, Sparkles, Zap } from 'lucide-react';

function getProgressColor(percentage: number): string {
  if (percentage > 50) {
    return 'bg-gradient-to-r from-primary to-emerald-400';
  }
  if (percentage > 20) {
    return 'bg-yellow-500';
  }
  return 'bg-red-500';
}

interface QuotaDisplayProps {
  label: string;
  icon: React.ReactNode;
  summary: ModelQuotaSummary | null;
}

function QuotaDisplay({ label, icon, summary }: QuotaDisplayProps) {
  if (!summary) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <p className="text-sm text-muted-foreground">暂无数据</p>
      </div>
    );
  }

  const progressColor = getProgressColor(summary.percentage);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {summary.totalAccounts} 个账号
        </span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', progressColor)}
          style={{ width: `${summary.percentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          可用: {summary.availableQuota} / {summary.totalQuota}
        </span>
        <span className={cn(
          'font-medium',
          summary.percentage > 50 ? 'text-emerald-500' : summary.percentage > 20 ? 'text-yellow-500' : 'text-red-500'
        )}>
          {summary.percentage}%
        </span>
      </div>
    </div>
  );
}

export function QuotaSummaryCard() {
  const { data, isLoading } = useQuotaSummary();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">额度汇总</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const summary = data?.data;

  // 如果没有任何数据，不显示卡片
  if (!summary?.claude && !summary?.gemini) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">额度汇总</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <QuotaDisplay
          label="Claude"
          icon={<Sparkles className="h-4 w-4 text-violet-500" />}
          summary={summary?.claude ?? null}
        />
        <QuotaDisplay
          label="Gemini"
          icon={<Zap className="h-4 w-4 text-blue-500" />}
          summary={summary?.gemini ?? null}
        />
      </CardContent>
    </Card>
  );
}
