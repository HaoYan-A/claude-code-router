import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLeaderboard } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { LeaderboardTimeRange, LeaderboardItem } from '@claude-code-router/shared';
import { Loader2, Trophy, Medal, Award, User } from 'lucide-react';

// 排名图标组件
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

// 单个排行项组件
function LeaderboardItem({ item }: { item: LeaderboardItem }) {
  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg p-3 transition-colors',
        item.isCurrentUser && 'bg-primary/10 border border-primary/20'
      )}
    >
      {/* 排名 */}
      <div className="flex h-8 w-8 items-center justify-center">
        <RankIcon rank={item.rank} />
      </div>

      {/* 头像 */}
      <Avatar className="h-9 w-9">
        {item.avatarUrl ? (
          <AvatarImage src={item.avatarUrl} alt={item.username} />
        ) : null}
        <AvatarFallback>
          <User className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>

      {/* 用户名和请求数 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('font-medium truncate', item.isCurrentUser && 'text-primary')}>
            {item.username}
          </span>
          {item.isCurrentUser && (
            <span className="text-xs text-primary">(你)</span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {item.requestCount.toLocaleString()} 次请求
        </div>
      </div>

      {/* 费用 */}
      <div className={cn('text-right font-medium', item.isCurrentUser && 'text-primary')}>
        {formatCost(item.totalCost)}
      </div>
    </div>
  );
}

// 排行榜内容组件
function LeaderboardContent({ timeRange }: { timeRange: LeaderboardTimeRange }) {
  const { data, isLoading, isError } = useLeaderboard(timeRange);

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
        Failed to load leaderboard
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
        <LeaderboardItem key={item.userId} item={item} />
      ))}
    </div>
  );
}

export function LeaderboardCard({ timeRange }: { timeRange: LeaderboardTimeRange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-yellow-500" />
          平台用量排行榜
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LeaderboardContent timeRange={timeRange} />
      </CardContent>
    </Card>
  );
}
