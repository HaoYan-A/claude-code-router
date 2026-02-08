import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import { ExternalLink, Copy, Check, Loader2 } from 'lucide-react';
import { useCodexOAuthUrl, useCodexOAuthExchange } from '@/lib/queries/accounts';

interface CodexOAuthFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function CodexOAuthForm({ onSuccess, onCancel }: CodexOAuthFormProps) {
  const [codeUrl, setCodeUrl] = useState('');
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(50);
  const [schedulable, setSchedulable] = useState(true);
  const [copied, setCopied] = useState(false);

  const { data: oauthData } = useCodexOAuthUrl();
  const oauthExchange = useCodexOAuthExchange();

  const oauthUrl = oauthData?.data.url;

  const handleCopyUrl = () => {
    if (oauthUrl) {
      navigator.clipboard.writeText(oauthUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenOAuth = () => {
    if (oauthUrl) {
      window.open(oauthUrl, '_blank', 'width=600,height=700');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await oauthExchange.mutateAsync({
      codeUrl,
      name: name || undefined,
      priority,
      schedulable,
    });
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* Step 1: Open OAuth */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              1
            </div>
            <span className="font-medium">打开授权页面</span>
          </div>
          <p className="text-sm text-muted-foreground pl-8">
            点击下方按钮在新窗口中打开 OpenAI 授权页面
          </p>
          <div className="flex items-center gap-2 pl-8">
            <Button type="button" onClick={handleOpenOAuth} disabled={!oauthUrl}>
              <ExternalLink className="mr-2 h-4 w-4" />
              打开授权
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopyUrl}
              disabled={!oauthUrl}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Step 2: Paste callback URL */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              2
            </div>
            <span className="font-medium">粘贴回调 URL</span>
          </div>
          <p className="text-sm text-muted-foreground pl-8">
            授权完成后，复制浏览器中的 URL 并粘贴到下方
          </p>
          <div className="pl-8">
            <Input
              placeholder="http://localhost:1455/auth/callback?code=..."
              value={codeUrl}
              onChange={(e) => setCodeUrl(e.target.value)}
            />
          </div>
        </div>

        {/* Account Settings */}
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="codex-name">名称（可选）</Label>
            <Input
              id="codex-name"
              placeholder="例如：My Codex Account"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codex-priority">优先级 (1-100)</Label>
              <Input
                id="codex-priority"
                type="number"
                min={1}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codex-schedulable">可调度</Label>
              <div className="flex items-center h-10">
                <Switch
                  id="codex-schedulable"
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
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={!codeUrl || oauthExchange.isPending}>
          {oauthExchange.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              添加中...
            </>
          ) : (
            '添加账户'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
