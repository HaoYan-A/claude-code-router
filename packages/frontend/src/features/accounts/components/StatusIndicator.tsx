import { cn } from '@/lib/utils';
import type { AccountStatus } from '@claude-code-router/shared';

interface StatusIndicatorProps {
  status: AccountStatus;
  showLabel?: boolean;
  className?: string;
}

const statusConfig: Record<
  AccountStatus,
  { color: string; animation?: string; label: string }
> = {
  created: {
    color: 'bg-yellow-400',
    label: 'Created',
  },
  active: {
    color: 'bg-green-500',
    animation: 'animate-pulse',
    label: 'Active',
  },
  expired: {
    color: 'bg-red-500',
    label: 'Expired',
  },
  error: {
    color: 'bg-red-500',
    animation: 'animate-ping',
    label: 'Error',
  },
};

export function StatusIndicator({ status, showLabel = false, className }: StatusIndicatorProps) {
  const config = statusConfig[status] || statusConfig.created;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="relative flex h-2.5 w-2.5">
        {config.animation && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              config.color,
              config.animation
            )}
          />
        )}
        <span
          className={cn(
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            config.color
          )}
        />
      </span>
      {showLabel && (
        <span className="text-sm text-muted-foreground">{config.label}</span>
      )}
    </div>
  );
}
