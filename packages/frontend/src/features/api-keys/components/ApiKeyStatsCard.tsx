import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiKeyStats, useAdminApiKeyStats } from '@/lib/queries';
import { Activity, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { StatsTimeRange } from '@claude-code-router/shared';

interface ApiKeyStatsCardProps {
  apiKeyId: string;
  isAdmin?: boolean;
}

const TIME_RANGE_LABELS: Record<StatsTimeRange, string> = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
  total: 'All Time',
};

export function ApiKeyStatsCard({ apiKeyId, isAdmin = false }: ApiKeyStatsCardProps) {
  const [timeRange, setTimeRange] = useState<StatsTimeRange>('month');
  const userStats = useApiKeyStats(apiKeyId, timeRange);
  const adminStats = useAdminApiKeyStats(apiKeyId, timeRange);
  const { data, isLoading } = isAdmin ? adminStats : userStats;

  const stats = data?.data.stats;

  const formatCost = (cost: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(cost);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            Loading stats...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            No statistics available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Usage Statistics</CardTitle>
          <Tabs value={timeRange} onValueChange={(v: string) => setTimeRange(v as StatsTimeRange)}>
            <TabsList className="h-8">
              {(['day', 'week', 'month', 'total'] as StatsTimeRange[]).map((range) => (
                <TabsTrigger key={range} value={range} className="text-xs px-2">
                  {TIME_RANGE_LABELS[range]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              Requests
            </div>
            <div className="text-2xl font-bold">{formatNumber(stats.totalRequests)}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              Total Cost
            </div>
            <div className="text-2xl font-bold">{formatCost(stats.totalCost)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowUpRight className="h-4 w-4" />
              Input Tokens
            </div>
            <div className="text-lg font-semibold">{formatNumber(stats.totalInputTokens)}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowDownRight className="h-4 w-4" />
              Output Tokens
            </div>
            <div className="text-lg font-semibold">{formatNumber(stats.totalOutputTokens)}</div>
          </div>
        </div>

        {stats.byModel.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2">By Model</div>
            <div className="space-y-2">
              {stats.byModel.map((modelStats) => (
                <div
                  key={modelStats.model}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{modelStats.model}</span>
                  <div className="flex items-center gap-4">
                    <span>{formatNumber(modelStats.requestCount)} req</span>
                    <span className="font-medium">{formatCost(modelStats.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
