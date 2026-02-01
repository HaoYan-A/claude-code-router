import { AccountCard } from './AccountCard';
import { CloudOff } from 'lucide-react';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface AccountCardGridProps {
  accounts: ThirdPartyAccount[];
  selectedId?: string | null;
  onSelect?: (account: ThirdPartyAccount) => void;
  onAddClick?: () => void;
}

export function AccountCardGrid({
  accounts,
  selectedId,
  onSelect,
  onAddClick,
}: AccountCardGridProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <CloudOff className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">No accounts yet</p>
        <p className="text-sm mb-4">Add your first third-party account to get started</p>
        {onAddClick && (
          <button
            onClick={onAddClick}
            className="text-primary hover:underline text-sm font-medium"
          >
            + Add Account
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          selected={selectedId === account.id}
          onClick={() => onSelect?.(account)}
        />
      ))}
    </div>
  );
}
