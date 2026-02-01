import { Card, CardContent } from '@/components/ui/card';
import { Users, CheckCircle, Percent, Activity } from 'lucide-react';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface AccountSummaryStatsProps {
  accounts: ThirdPartyAccount[];
}

export function AccountSummaryStats({ accounts }: AccountSummaryStatsProps) {
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.status === 'active').length;
  const avgQuota =
    accounts.length > 0
      ? Math.round(
          accounts.reduce((sum, a) => {
            const quotas = a.quotas || [];
            if (quotas.length === 0) return sum;
            const avgAccountQuota =
              quotas.reduce((q, quota) => q + quota.percentage, 0) / quotas.length;
            return sum + avgAccountQuota;
          }, 0) / accounts.length
        )
      : 0;
  const totalRequests = accounts.reduce((sum, a) => sum + a.totalRequests, 0);

  const stats = [
    {
      label: 'Total Accounts',
      value: totalAccounts,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Active',
      value: activeAccounts,
      icon: CheckCircle,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    {
      label: 'Avg Quota',
      value: `${avgQuota}%`,
      icon: Percent,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Total Requests',
      value: totalRequests.toLocaleString(),
      icon: Activity,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`rounded-lg p-2.5 ${stat.bg}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
