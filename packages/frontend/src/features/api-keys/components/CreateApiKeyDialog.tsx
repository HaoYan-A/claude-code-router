import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, Check } from 'lucide-react';
import { useCreateApiKey } from '@/lib/queries';
import { ModelMappingForm } from './ModelMappingForm';
import {
  CLAUDE_MODEL_SLOTS,
  DEFAULT_MODEL_MAPPINGS,
  type ModelMappingSchema,
} from '@claude-code-router/shared';

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getDefaultMappings = (): ModelMappingSchema[] =>
  CLAUDE_MODEL_SLOTS.map((slot) => ({
    claudeModel: slot,
    platform: DEFAULT_MODEL_MAPPINGS[slot].platform,
    targetModel: DEFAULT_MODEL_MAPPINGS[slot].model,
  }));

export function CreateApiKeyDialog({ open, onOpenChange }: CreateApiKeyDialogProps) {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [name, setName] = useState('');
  const [mappings, setMappings] = useState<ModelMappingSchema[]>(getDefaultMappings);
  const [createdKey, setCreatedKey] = useState('');
  const [copied, setCopied] = useState(false);

  const createMutation = useCreateApiKey();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createMutation.mutateAsync({
      name: name || undefined,
      modelMappings: mappings,
    });
    setCreatedKey(result.data.key);
    setStep('success');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep('form');
      setName('');
      setMappings(getDefaultMappings());
      setCreatedKey('');
      setCopied(false);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Configure your API key and model mappings. Leave the name empty for auto-generation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="keyName">Name (optional)</Label>
                  <Input
                    id="keyName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Production Key"
                  />
                </div>
                <ModelMappingForm value={mappings} onChange={setMappings} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Key'}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>API Key Created</DialogTitle>
              <DialogDescription>
                Please save this key now. You won't be able to see it again.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="rounded-md bg-muted p-4">
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-background p-2 text-sm">
                    {createdKey}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
