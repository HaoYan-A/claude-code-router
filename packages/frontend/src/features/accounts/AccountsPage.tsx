import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import { useAccounts, useRefreshAllQuotas } from '@/lib/queries/accounts';
import {
  AccountSummaryStats,
  AccountCardGrid,
  AccountDetailPanel,
  AddAccountDialog,
  EditAccountDialog,
} from './components';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

export function AccountsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ThirdPartyAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<ThirdPartyAccount | null>(null);

  const { data, isLoading } = useAccounts();
  const refreshAllMutation = useRefreshAllQuotas();

  const accounts = data?.data.data ?? [];

  // Update selectedAccount when accounts change (e.g., after refresh)
  const currentSelectedAccount = selectedAccount
    ? accounts.find((a) => a.id === selectedAccount.id) || null
    : null;

  const handleSelectAccount = (account: ThirdPartyAccount) => {
    setSelectedAccount(account);
  };

  const handleRefreshAll = () => {
    refreshAllMutation.mutate();
  };

  const handleAccountDeleted = () => {
    setSelectedAccount(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Antigravity 账户</h1>
          <p className="text-muted-foreground mt-1">
            管理您的第三方 API 账户
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={refreshAllMutation.isPending}
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            刷新全部
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            添加账户
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <AccountSummaryStats accounts={accounts} />

      {/* Main Content - Grid + Detail Panel */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Account Cards Grid */}
        <div className="flex-1 overflow-auto p-1 -m-1">
          <AccountCardGrid
            accounts={accounts}
            selectedId={currentSelectedAccount?.id}
            onSelect={handleSelectAccount}
            onAddClick={() => setShowAddDialog(true)}
          />
        </div>

        {/* Detail Panel */}
        <div className="w-[400px] flex-shrink-0 overflow-auto">
          <AccountDetailPanel
            account={currentSelectedAccount}
            onEdit={() => currentSelectedAccount && setEditingAccount(currentSelectedAccount)}
            onDeleted={handleAccountDeleted}
          />
        </div>
      </div>

      {/* Dialogs */}
      <AddAccountDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      <EditAccountDialog
        open={!!editingAccount}
        onOpenChange={(open) => !open && setEditingAccount(null)}
        account={editingAccount}
      />
    </div>
  );
}
