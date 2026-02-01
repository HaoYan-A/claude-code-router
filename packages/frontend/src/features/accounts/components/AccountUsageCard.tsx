import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface AccountUsageCardProps {
  account: ThirdPartyAccount;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function AccountUsageCard({ account }: AccountUsageCardProps) {
  const stats = [
    {
      label: 'Total Requests',
      value: account.totalRequests.toLocaleString(),
      icon: Activity,
      color: 'text-blue-500',
    },
    {
      label: 'Input Tokens',
      value: formatTokens(account.totalInputTokens),
      icon: ArrowDown,
      color: 'text-green-500',
    },
    {
      label: 'Output Tokens',
      value: formatTokens(account.totalOutputTokens),
      icon: ArrowUp,
      color: 'text-purple-500',
    },
    {
      label: 'Cache Tokens',
      value: formatTokens(account.totalCacheTokens),
      icon: Clock,
      color: 'text-orange-500',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Usage Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                <span className="text-xs">{stat.label}</span>
              </div>
              <p className="text-lg font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        {account.lastUsedAt && (
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            Last used: {new Date(account.lastUsedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
