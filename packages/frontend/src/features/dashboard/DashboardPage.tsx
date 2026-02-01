import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogStats } from '@/lib/queries';
import { useAuthStore } from '@/stores/auth.store';
import { Activity, CheckCircle, XCircle, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendIndicatorProps {
  value: number;
  suffix?: string;
}

function TrendIndicator({ value, suffix = '%' }: TrendIndicatorProps) {
  const isPositive = value >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        isPositive ? 'text-emerald-600' : 'text-red-600'
      )}
    >
      <Icon className="h-3 w-3" />
      <span>
        {isPositive ? '+' : ''}
        {value}
        {suffix}
      </span>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useLogStats();
  const { user } = useAuthStore();

  const displayName = user?.name || user?.githubUsername || 'User';

  if (isLoading) {
    return <div>加载中...</div>;
  }

  const stats = data?.data;

  const cards = [
    {
      title: '总请求数',
      value: stats?.totalRequests ?? 0,
      icon: Activity,
      trend: 12,
    },
    {
      title: '成功',
      value: stats?.successRequests ?? 0,
      icon: CheckCircle,
      iconClassName: 'text-emerald-500',
      trend: 8,
    },
    {
      title: '错误',
      value: stats?.errorRequests ?? 0,
      icon: XCircle,
      iconClassName: 'text-red-500',
      trend: -5,
    },
    {
      title: '总 Token 数',
      value: (stats?.totalInputTokens ?? 0) + (stats?.totalOutputTokens ?? 0),
      icon: Zap,
      iconClassName: 'text-amber-500',
      trend: 15,
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
                <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
                <TrendIndicator value={card.trend} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
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
      </div>
    </div>
  );
}
