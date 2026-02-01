import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExternalLink, Copy, Check, Loader2, KeyRound, Globe } from 'lucide-react';
import { useOAuthUrl, useOAuthExchange, useCreateAccount } from '@/lib/queries/accounts';

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  const [tab, setTab] = useState<'oauth' | 'manual'>('oauth');

  // OAuth state
  const [codeUrl, setCodeUrl] = useState('');
  const [oauthName, setOAuthName] = useState('');
  const [oauthPriority, setOAuthPriority] = useState(50);
  const [oauthSchedulable, setOAuthSchedulable] = useState(true);

  // Manual state
  const [refreshToken, setRefreshToken] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPriority, setManualPriority] = useState(50);
  const [manualSchedulable, setManualSchedulable] = useState(true);

  const [copied, setCopied] = useState(false);

  const { data: oauthData } = useOAuthUrl();
  const oauthExchange = useOAuthExchange();
  const createAccount = useCreateAccount();

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

  const handleOAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await oauthExchange.mutateAsync({
      codeUrl,
      name: oauthName || undefined,
      priority: oauthPriority,
      schedulable: oauthSchedulable,
    });
    handleClose();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAccount.mutateAsync({
      platform: 'antigravity',
      refreshToken,
      name: manualName || undefined,
      priority: manualPriority,
      schedulable: manualSchedulable,
    });
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setTab('oauth');
      setCodeUrl('');
      setOAuthName('');
      setOAuthPriority(50);
      setOAuthSchedulable(true);
      setRefreshToken('');
      setManualName('');
      setManualPriority(50);
      setManualSchedulable(true);
    }, 200);
  };

  const isPending = oauthExchange.isPending || createAccount.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>添加 Antigravity 账户</DialogTitle>
          <DialogDescription>
            连接您的 Antigravity 账户以使用其 API 配额
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'oauth' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="oauth" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              OAuth 授权
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              手动令牌
            </TabsTrigger>
          </TabsList>

          <TabsContent value="oauth" className="mt-4">
            <form onSubmit={handleOAuthSubmit}>
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
                    点击下方按钮在新窗口中打开 Antigravity 登录页面
                  </p>
                  <div className="flex items-center gap-2 pl-8">
                    <Button type="button" onClick={handleOpenOAuth} disabled={!oauthUrl}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      打开登录
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
                      placeholder="https://console.anthropic.com/...?code=..."
                      value={codeUrl}
                      onChange={(e) => setCodeUrl(e.target.value)}
                    />
                  </div>
                </div>

                {/* Account Settings */}
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="oauth-name">名称（可选）</Label>
                    <Input
                      id="oauth-name"
                      placeholder="例如：我的工作账户"
                      value={oauthName}
                      onChange={(e) => setOAuthName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="oauth-priority">优先级 (1-100)</Label>
                      <Input
                        id="oauth-priority"
                        type="number"
                        min={1}
                        max={100}
                        value={oauthPriority}
                        onChange={(e) => setOAuthPriority(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="oauth-schedulable">可调度</Label>
                      <div className="flex items-center h-10">
                        <Switch
                          id="oauth-schedulable"
                          checked={oauthSchedulable}
                          onCheckedChange={setOAuthSchedulable}
                        />
                        <span className="ml-2 text-sm text-muted-foreground">
                          {oauthSchedulable ? '是' : '否'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  取消
                </Button>
                <Button type="submit" disabled={!codeUrl || isPending}>
                  {isPending ? (
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
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form onSubmit={handleManualSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="refresh-token">刷新令牌</Label>
                  <Input
                    id="refresh-token"
                    type="password"
                    placeholder="输入您的刷新令牌"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    您可以在 Antigravity 账户设置中找到刷新令牌
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manual-name">名称（可选）</Label>
                  <Input
                    id="manual-name"
                    placeholder="例如：个人账户"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-priority">优先级 (1-100)</Label>
                    <Input
                      id="manual-priority"
                      type="number"
                      min={1}
                      max={100}
                      value={manualPriority}
                      onChange={(e) => setManualPriority(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-schedulable">可调度</Label>
                    <div className="flex items-center h-10">
                      <Switch
                        id="manual-schedulable"
                        checked={manualSchedulable}
                        onCheckedChange={setManualSchedulable}
                      />
                      <span className="ml-2 text-sm text-muted-foreground">
                        {manualSchedulable ? '是' : '否'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  取消
                </Button>
                <Button type="submit" disabled={!refreshToken || isPending}>
                  {isPending ? (
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
