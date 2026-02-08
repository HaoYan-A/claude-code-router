import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useModelLeaderboard } from '@/lib/queries';
import type { LeaderboardTimeRange, ModelLeaderboardItem } from '@claude-code-router/shared';
import { Loader2, Boxes, Trophy, Medal, Award } from 'lucide-react';

const TIME_RANGE_LABELS: Record<LeaderboardTimeRange, string> = {
  day: '本日',
  week: '本周',
  month: '本月',
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Trophy className="h-5 w-5 text-yellow-500" />;
  }
  if (rank === 2) {
    return <Medal className="h-5 w-5 text-slate-400" />;
  }
  if (rank === 3) {
    return <Award className="h-5 w-5 text-amber-600" />;
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center text-sm font-medium text-muted-foreground">
      {rank}
    </span>
  );
}

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`;
}

function ModelRow({ item }: { item: ModelLeaderboardItem }) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-3 transition-colors">
      <div className="flex h-8 w-8 items-center justify-center">
        <RankIcon rank={item.rank} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{item.platform}</span>
          <span className="truncate font-medium">{item.model}</span>
        </div>
        <div className="text-sm text-muted-foreground">{formatCost(item.totalCost)}</div>
      </div>

      <div className="text-right">
        <div className="font-medium">{item.requestCount.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground">次请求</div>
      </div>
    </div>
  );
}

function ModelLeaderboardContent({ timeRange }: { timeRange: LeaderboardTimeRange }) {
  const { data, isLoading, isError } = useModelLeaderboard(timeRange);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Failed to load model leaderboard
      </div>
    );
  }

  const items = data?.data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        暂无排行数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ModelRow key={`${item.platform}|${item.model}`} item={item} />
      ))}
    </div>
  );
}

export function ModelLeaderboardCard() {
  const [timeRange, setTimeRange] = useState<LeaderboardTimeRange>('day');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Boxes className="h-5 w-5 text-muted-foreground" />
            平台模型排行榜
          </CardTitle>
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as LeaderboardTimeRange)}>
            <TabsList className="h-8">
              {(Object.keys(TIME_RANGE_LABELS) as LeaderboardTimeRange[]).map((range) => (
                <TabsTrigger key={range} value={range} className="text-xs px-2 py-1">
                  {TIME_RANGE_LABELS[range]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <ModelLeaderboardContent timeRange={timeRange} />
      </CardContent>
    </Card>
  );
}
