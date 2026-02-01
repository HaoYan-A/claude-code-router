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

  const updateMutation = useUpdateAccount();

  // Sync form state when account changes
  useEffect(() => {
    if (account) {
      setName(account.name || '');
      setIsActive(account.isActive);
      setPriority(account.priority);
      setSchedulable(account.schedulable);
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
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>
            Update the account settings. Changes will take effect immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder="Account name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-active">Active</Label>
                <p className="text-sm text-muted-foreground">
                  Enable or disable this account
                </p>
              </div>
              <Switch
                id="edit-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-priority">Priority (1-100)</Label>
              <Input
                id="edit-priority"
                type="number"
                min={1}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Higher priority accounts are preferred when scheduling requests
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-schedulable">Schedulable</Label>
                <p className="text-sm text-muted-foreground">
                  Include in automatic request scheduling
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
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
