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
import { useUpdateApiKey, useAdminUpdateApiKey } from '@/lib/queries';
import { ModelMappingForm } from './ModelMappingForm';
import type {
  ApiKeyWithMappingsResponse,
  ApiKeyWithUserResponse,
  ModelMappingSchema,
} from '@claude-code-router/shared';

interface EditApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: ApiKeyWithMappingsResponse | ApiKeyWithUserResponse | null;
  isAdmin?: boolean;
}

export function EditApiKeyDialog({ open, onOpenChange, apiKey, isAdmin = false }: EditApiKeyDialogProps) {
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [mappings, setMappings] = useState<ModelMappingSchema[]>([]);

  const userUpdateMutation = useUpdateApiKey();
  const adminUpdateMutation = useAdminUpdateApiKey();
  const updateMutation = isAdmin ? adminUpdateMutation : userUpdateMutation;

  useEffect(() => {
    if (apiKey) {
      setName(apiKey.name);
      setIsActive(apiKey.isActive);
      setMappings(apiKey.modelMappings);
    }
  }, [apiKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;

    await updateMutation.mutateAsync({
      id: apiKey.id,
      data: {
        name,
        isActive,
        modelMappings: mappings,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit API Key</DialogTitle>
          <DialogDescription>Update your API key settings and model mappings.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editKeyName">Name</Label>
              <Input
                id="editKeyName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isActive">Active</Label>
              <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <ModelMappingForm value={mappings} onChange={setMappings} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
