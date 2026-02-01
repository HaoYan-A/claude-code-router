import { cn } from '@/lib/utils';

interface QuotaProgressBarProps {
  percentage: number;
  modelName?: string;
  resetTime?: string | null;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}

function getProgressColor(percentage: number): string {
  if (percentage > 50) {
    return 'bg-gradient-to-r from-primary to-emerald-400';
  }
  if (percentage > 20) {
    return 'bg-yellow-500';
  }
  return 'bg-red-500';
}

/**
 * 格式化剩余时间
 * - 小于1小时: "xx分钟"
 * - 小于1天: "xx小时"
 * - 大于等于1天: "x天xx小时"
 */
function formatResetTime(resetTime: string | null | undefined): string | null {
  if (!resetTime) return null;

  try {
    const resetDate = new Date(resetTime);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    // 如果已经过期
    if (diffMs <= 0) {
      return '现在';
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const remainingHours = diffHours % 24;

    if (diffMinutes < 60) {
      return `${diffMinutes}分钟`;
    }
    if (diffDays === 0) {
      return `${diffHours}小时`;
    }
    if (remainingHours === 0) {
      return `${diffDays}天`;
    }
    return `${diffDays}天${remainingHours}小时`;
  } catch {
    return resetTime; // 如果解析失败，返回原始值
  }
}

export function QuotaProgressBar({
  percentage,
  modelName,
  resetTime,
  compact = false,
  showLabel = false,
  className,
}: QuotaProgressBarProps) {
  const progressColor = getProgressColor(percentage);
  const safePercentage = Math.max(0, Math.min(100, percentage));
  const formattedResetTime = formatResetTime(resetTime);

  if (compact) {
    return (
      <div className={cn('space-y-0.5', className)}>
        {showLabel && modelName && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground capitalize">{modelName}</span>
            <span className="text-muted-foreground">
              {safePercentage}%
              {formattedResetTime && <span className="ml-1">· {formattedResetTime}</span>}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300', progressColor)}
              style={{ width: `${safePercentage}%` }}
            />
          </div>
          {!showLabel && (
            <span className="text-xs text-muted-foreground w-8 text-right">
              {safePercentage}%
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {modelName && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium capitalize">{modelName}</span>
          <span className="text-muted-foreground">{safePercentage}%</span>
        </div>
      )}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', progressColor)}
          style={{ width: `${safePercentage}%` }}
        />
      </div>
      {formattedResetTime && (
        <p className="text-xs text-muted-foreground">
          重置时间: {formattedResetTime}
        </p>
      )}
    </div>
  );
}
