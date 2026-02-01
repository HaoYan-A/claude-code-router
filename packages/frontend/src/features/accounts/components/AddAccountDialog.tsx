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
          <DialogTitle>Add Antigravity Account</DialogTitle>
          <DialogDescription>
            Connect your Antigravity account to use its API quota
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'oauth' | 'manual')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="oauth" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              OAuth Authorization
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Manual Token
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
                    <span className="font-medium">Open Authorization Page</span>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">
                    Click the button below to open the Antigravity login page in a new window
                  </p>
                  <div className="flex items-center gap-2 pl-8">
                    <Button type="button" onClick={handleOpenOAuth} disabled={!oauthUrl}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Login
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
                    <span className="font-medium">Paste Callback URL</span>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">
                    After authorization, copy the URL from your browser and paste it below
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
                    <Label htmlFor="oauth-name">Name (optional)</Label>
                    <Input
                      id="oauth-name"
                      placeholder="e.g., My Work Account"
                      value={oauthName}
                      onChange={(e) => setOAuthName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="oauth-priority">Priority (1-100)</Label>
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
                      <Label htmlFor="oauth-schedulable">Schedulable</Label>
                      <div className="flex items-center h-10">
                        <Switch
                          id="oauth-schedulable"
                          checked={oauthSchedulable}
                          onCheckedChange={setOAuthSchedulable}
                        />
                        <span className="ml-2 text-sm text-muted-foreground">
                          {oauthSchedulable ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!codeUrl || isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Account'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form onSubmit={handleManualSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="refresh-token">Refresh Token</Label>
                  <Input
                    id="refresh-token"
                    type="password"
                    placeholder="Enter your refresh token"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    You can find your refresh token in your Antigravity account settings
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manual-name">Name (optional)</Label>
                  <Input
                    id="manual-name"
                    placeholder="e.g., Personal Account"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-priority">Priority (1-100)</Label>
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
                    <Label htmlFor="manual-schedulable">Schedulable</Label>
                    <div className="flex items-center h-10">
                      <Switch
                        id="manual-schedulable"
                        checked={manualSchedulable}
                        onCheckedChange={setManualSchedulable}
                      />
                      <span className="ml-2 text-sm text-muted-foreground">
                        {manualSchedulable ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!refreshToken || isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Account'
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
