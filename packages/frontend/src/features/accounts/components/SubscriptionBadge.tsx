import { cn } from '@/lib/utils';

interface SubscriptionBadgeProps {
  tier: string | null;
  className?: string;
}

const tierStyles: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  plus: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white',
  pro: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white',
  team: 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white',
  ultra: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white',
  max: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-black',
};

export function SubscriptionBadge({ tier, className }: SubscriptionBadgeProps) {
  const normalizedTier = tier?.toLowerCase() || 'free';
  const style = tierStyles[normalizedTier] || tierStyles.free;
  const displayTier = tier?.toUpperCase() || 'FREE';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        style,
        className
      )}
    >
      {displayTier}
    </span>
  );
}
