import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useUpdateAccount } from '@/lib/queries/accounts';
import type { ThirdPartyAccount } from '@claude-code-router/shared';

interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ThirdPartyAccount | null;
}

export function EditAccountDialog({ open, onOpenChange, account }: EditAccountDialogProps) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(50);
  const [schedulable, setSchedulable] = useState(true);
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  const updateMutation = useUpdateAccount();

  const isOpenAI = account?.platform === 'openai';

  // Sync form state when account changes
  useEffect(() => {
    if (account) {
      setName(account.name || '');
      setIsActive(account.isActive);
      setPriority(account.priority);
      setSchedulable(account.schedulable);
      setOpenaiBaseUrl(account.openaiBaseUrl || '');
      setOpenaiApiKey(account.openaiApiKey || '');
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;

    await updateMutation.mutateAsync({
      id: account.id,
      data: {
        name: name || undefined,
        isActive,
        priority,
        schedulable,
        ...(isOpenAI && openaiBaseUrl ? { openaiBaseUrl } : {}),
        ...(isOpenAI && openaiApiKey ? { openaiApiKey } : {}),
      },
    });
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>编辑账户</DialogTitle>
          <DialogDescription>
            更新账户设置。更改将立即生效。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">名称</Label>
              <Input
                id="edit-name"
                placeholder="账户名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {isOpenAI && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-base-url">API Base URL</Label>
                  <Input
                    id="edit-base-url"
                    placeholder="https://api.openai.com/v1"
                    value={openaiBaseUrl}
                    onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-api-key">API Key</Label>
                  <Input
                    id="edit-api-key"
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-active">启用</Label>
                <p className="text-sm text-muted-foreground">
                  启用或禁用此账户
                </p>
              </div>
              <Switch
                id="edit-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-priority">优先级 (1-100)</Label>
              <Input
                id="edit-priority"
                type="number"
                min={1}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                调度请求时优先使用高优先级账户
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-schedulable">可调度</Label>
                <p className="text-sm text-muted-foreground">
                  包含在自动请求调度中
                </p>
              </div>
              <Switch
                id="edit-schedulable"
                checked={schedulable}
                onCheckedChange={setSchedulable}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              取消
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存更改'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
