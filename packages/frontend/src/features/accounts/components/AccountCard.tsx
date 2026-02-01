import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SubscriptionBadge } from './SubscriptionBadge';
import { StatusIndicator } from './StatusIndicator';
import { QuotaProgressBar } from './QuotaProgressBar';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface AccountCardProps {
  account: ThirdPartyAccount;
  selected?: boolean;
  onClick?: () => void;
}

// 将模型聚合为 Claude 和 Gemini 两类
function aggregateQuotas(quotas: ThirdPartyAccount['quotas']) {
  if (!quotas || quotas.length === 0) return [];

  const claudeQuota = quotas.find((q) =>
    q.modelName.toLowerCase().includes('claude')
  );
  const geminiQuota = quotas.find((q) =>
    q.modelName.toLowerCase().includes('gemini')
  );

  const result = [];
  if (claudeQuota) {
    result.push({ ...claudeQuota, modelName: 'Claude' });
  }
  if (geminiQuota) {
    result.push({ ...geminiQuota, modelName: 'Gemini' });
  }
  return result;
}

export function AccountCard({ account, selected, onClick }: AccountCardProps) {
  const displayName = account.name || account.platformId.slice(0, 8);
  const initials = displayName.slice(0, 2).toUpperCase();
  const aggregatedQuotas = aggregateQuotas(account.quotas);

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200 hover:shadow-md border',
        selected && 'border-primary ring-2 ring-primary/20 scale-[1.02]',
        !account.isActive && 'opacity-60'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/40 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium truncate">{displayName}</span>
              <SubscriptionBadge tier={account.subscriptionTier} />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <StatusIndicator status={account.status} />
              <span className="truncate">{account.platformId}</span>
            </div>

            {/* 额度进度条 - 显示 Claude / Gemini 两类 */}
            <div className="space-y-2">
              {aggregatedQuotas.length > 0 ? (
                aggregatedQuotas.map((quota) => (
                  <QuotaProgressBar
                    key={quota.id}
                    percentage={quota.percentage}
                    modelName={quota.modelName}
                    resetTime={quota.resetTime}
                    compact
                    showLabel
                  />
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No quota data</div>
              )}
            </div>
          </div>
        </div>

        {/* 底部标签 */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
          <Badge variant={account.schedulable ? 'default' : 'secondary'} className="text-xs">
            {account.schedulable ? 'Schedulable' : 'Manual'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            Priority: {account.priority}
          </Badge>
          {account.errorMessage && (
            <Badge variant="destructive" className="text-xs truncate max-w-32">
              Error
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
