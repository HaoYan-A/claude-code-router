import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BarChart3 } from 'lucide-react';
import { SubscriptionBadge } from './SubscriptionBadge';
import { StatusIndicator } from './StatusIndicator';
import { QuotaBreakdownCard } from './QuotaBreakdownCard';
import { AccountUsageCard } from './AccountUsageCard';
import { AccountActionsCard } from './AccountActionsCard';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface AccountDetailPanelProps {
  account: ThirdPartyAccount | null;
  onEdit?: () => void;
  onDeleted?: () => void;
}

export function AccountDetailPanel({ account, onEdit, onDeleted }: AccountDetailPanelProps) {
  if (!account) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center text-muted-foreground py-16">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>选择一个账户查看详情</p>
        </CardContent>
      </Card>
    );
  }

  const displayName = account.name || account.platformId.slice(0, 8);
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      {/* Account Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/40 text-primary font-semibold text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-lg truncate">{displayName}</span>
                <SubscriptionBadge tier={account.subscriptionTier} />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <StatusIndicator status={account.status} showLabel />
                <span className="text-muted-foreground">|</span>
                <span className="truncate">{account.platform}</span>
              </div>

              {account.errorMessage && (
                <p className="mt-2 text-sm text-destructive break-words whitespace-pre-wrap">
                  {account.errorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">平台 ID</span>
              <p className="font-mono text-xs mt-1 truncate">{account.platformId}</p>
            </div>
            <div>
              <span className="text-muted-foreground">创建时间</span>
              <p className="mt-1">{new Date(account.createdAt).toLocaleDateString()}</p>
            </div>
            {account.subscriptionExpiresAt && (
              <div>
                <span className="text-muted-foreground">订阅到期</span>
                <p className="mt-1">
                  {new Date(account.subscriptionExpiresAt).toLocaleDateString()}
                </p>
              </div>
            )}
            {account.tokenExpiresAt && (
              <div>
                <span className="text-muted-foreground">令牌到期</span>
                <p className="mt-1">
                  {new Date(account.tokenExpiresAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quota Breakdown */}
      <QuotaBreakdownCard accountId={account.id} />

      {/* Usage Stats */}
      <AccountUsageCard account={account} />

      {/* Actions */}
      <AccountActionsCard account={account} onEdit={onEdit} onDeleted={onDeleted} />
    </div>
  );
}
