import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Edit, Trash2, Key, Loader2 } from 'lucide-react';
import { useRefreshQuota, useRefreshToken, useDeleteAccount } from '@/lib/queries/accounts';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface AccountActionsCardProps {
  account: ThirdPartyAccount;
  onEdit?: () => void;
  onDeleted?: () => void;
}

export function AccountActionsCard({ account, onEdit, onDeleted }: AccountActionsCardProps) {
  const refreshQuotaMutation = useRefreshQuota();
  const refreshTokenMutation = useRefreshToken();
  const deleteMutation = useDeleteAccount();

  const handleRefreshQuota = () => {
    refreshQuotaMutation.mutate(account.id);
  };

  const handleRefreshToken = () => {
    refreshTokenMutation.mutate(account.id);
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this account? This action cannot be undone.')) {
      await deleteMutation.mutateAsync(account.id);
      onDeleted?.();
    }
  };

  const isRefreshing = refreshQuotaMutation.isPending || refreshTokenMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleRefreshQuota}
          disabled={isRefreshing}
        >
          {refreshQuotaMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh Quota
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleRefreshToken}
          disabled={isRefreshing}
        >
          {refreshTokenMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Key className="mr-2 h-4 w-4" />
          )}
          Refresh Token
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={onEdit}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit Account
        </Button>

        <Button
          variant="destructive"
          className="w-full justify-start"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete Account
        </Button>
      </CardContent>
    </Card>
  );
}
