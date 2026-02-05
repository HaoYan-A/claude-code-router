import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogStats } from '@/lib/queries';
import { useAuthStore } from '@/stores/auth.store';
import { Activity, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuotaSummaryCard } from './components/QuotaSummaryCard';
import { LeaderboardCard } from './components/LeaderboardCard';

export function DashboardPage() {
  const { data, isLoading } = useLogStats('day');
  const { user } = useAuthStore();

  const displayName = user?.name || user?.githubUsername || 'User';

  if (isLoading) {
    return <div>加载中...</div>;
  }

  const stats = data?.data;

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const cards = [
    {
      title: '请求数',
      value: stats?.totalRequests ?? 0,
      formattedValue: (stats?.totalRequests ?? 0).toLocaleString(),
      icon: Activity,
    },
    {
      title: '成功',
      value: stats?.successRequests ?? 0,
      formattedValue: (stats?.successRequests ?? 0).toLocaleString(),
      icon: CheckCircle,
      iconClassName: 'text-emerald-500',
    },
    {
      title: '错误',
      value: stats?.errorRequests ?? 0,
      formattedValue: (stats?.errorRequests ?? 0).toLocaleString(),
      icon: XCircle,
      iconClassName: 'text-red-500',
    },
    {
      title: '费用',
      value: stats?.totalCost ?? 0,
      formattedValue: formatCost(stats?.totalCost ?? 0),
      icon: DollarSign,
      iconClassName: 'text-green-500',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          你好，欢迎回来{' '}
          <span className="text-primary">{displayName}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          以下是您今天的 API 使用情况。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon
                  className={cn('h-4 w-4', card.iconClassName || 'text-muted-foreground')}
                />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.formattedValue}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>输入 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(stats?.totalInputTokens ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>输出 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(stats?.totalOutputTokens ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <QuotaSummaryCard />
      </div>

      <div className="mt-8">
        <LeaderboardCard />
      </div>
    </div>
  );
}
