import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useImportOpenAIAccount } from '@/lib/queries/accounts';

interface OpenAIImportFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function OpenAIImportForm({ onSuccess, onCancel }: OpenAIImportFormProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(50);
  const [schedulable, setSchedulable] = useState(true);

  const importOpenAI = useImportOpenAIAccount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await importOpenAI.mutateAsync({
      apiBaseUrl,
      apiKey,
      name: name || undefined,
      priority,
      schedulable,
    });

    onSuccess();
  };

  const canSubmit = apiBaseUrl && apiKey && !importOpenAI.isPending;

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="openai-base-url">API Base URL</Label>
          <Input
            id="openai-base-url"
            type="text"
            placeholder="https://api.openai.com/v1"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            OpenAI API 的基础 URL，支持兼容 OpenAI 格式的第三方服务
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="openai-api-key">API Key</Label>
          <Input
            id="openai-api-key"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="openai-name">名称（可选）</Label>
          <Input
            id="openai-name"
            placeholder="例如：My OpenAI Account"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="openai-priority">优先级 (1-100)</Label>
            <Input
              id="openai-priority"
              type="number"
              min={1}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openai-schedulable">可调度</Label>
            <div className="flex items-center h-10">
              <Switch
                id="openai-schedulable"
                checked={schedulable}
                onCheckedChange={setSchedulable}
              />
              <span className="ml-2 text-sm text-muted-foreground">
                {schedulable ? '是' : '否'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {importOpenAI.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              导入中...
            </>
          ) : (
            '导入账户'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
