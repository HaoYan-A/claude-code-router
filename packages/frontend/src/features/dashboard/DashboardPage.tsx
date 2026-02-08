import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import type { ChartTimeRange } from '@claude-code-router/shared';
import { TokenTrendChart } from './components/TokenTrendChart';
import { StatusPieChart } from './components/StatusPieChart';
import { CostBreakdownChart } from './components/CostBreakdownChart';
import { QuotaSummaryCard } from './components/QuotaSummaryCard';
import { LeaderboardCard } from './components/LeaderboardCard';
import { ModelLeaderboardCard } from './components/ModelLeaderboardCard';

const TIME_RANGES: { value: ChartTimeRange; label: string }[] = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
];

export function DashboardPage() {
  const { user } = useAuthStore();
  const [timeRange, setTimeRange] = useState<ChartTimeRange>('day');

  const displayName = user?.name || user?.githubUsername || 'User';

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            你好，欢迎回来{' '}
            <span className="text-primary">{displayName}</span>
          </h1>
          <p className="mt-1 text-muted-foreground">
            以下是您的 API 使用情况。
          </p>
        </div>
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
          {TIME_RANGES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all',
                timeRange === item.value
                  ? 'bg-background text-foreground shadow'
                  : 'hover:text-foreground'
              )}
              onClick={() => setTimeRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <TokenTrendChart timeRange={timeRange} />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatusPieChart timeRange={timeRange} />
        <CostBreakdownChart timeRange={timeRange} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <LeaderboardCard timeRange={timeRange} />
        <ModelLeaderboardCard timeRange={timeRange} />
        <QuotaSummaryCard />
      </div>
    </div>
  );
}
