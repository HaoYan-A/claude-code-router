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
    return <div>Loading...</div>;
  }

  const stats = data?.data;

  const cards = [
    {
      title: 'Total Requests',
      value: stats?.totalRequests ?? 0,
      icon: Activity,
      trend: 12,
    },
    {
      title: 'Success',
      value: stats?.successRequests ?? 0,
      icon: CheckCircle,
      iconClassName: 'text-emerald-500',
      trend: 8,
    },
    {
      title: 'Errors',
      value: stats?.errorRequests ?? 0,
      icon: XCircle,
      iconClassName: 'text-red-500',
      trend: -5,
    },
    {
      title: 'Total Tokens',
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
          Hi, Welcome back{' '}
          <span className="text-primary">{displayName}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here's what's happening with your API usage today.
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
            <CardTitle>Input Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(stats?.totalInputTokens ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Output Tokens</CardTitle>
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
