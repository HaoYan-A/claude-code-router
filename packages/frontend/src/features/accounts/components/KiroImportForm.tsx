import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DialogFooter } from '@/components/ui/dialog';
import {
  Upload,
  FileJson,
  Check,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import { useImportKiroAccount } from '@/lib/queries/accounts';

interface KiroImportFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

// 解析后的 Auth Token 文件数据
interface ParsedAuthToken {
  refreshToken: string;
  clientIdHash: string;
  region: string;
}

// 解析后的 Client Config 文件数据
interface ParsedClientConfig {
  clientId: string;
  clientSecret: string;
}

export function KiroImportForm({ onSuccess, onCancel }: KiroImportFormProps) {
  // 文件状态
  const [authTokenFile, setAuthTokenFile] = useState<File | null>(null);
  const [clientConfigFile, setClientConfigFile] = useState<File | null>(null);
  const [parsedAuthToken, setParsedAuthToken] = useState<ParsedAuthToken | null>(null);
  const [parsedClientConfig, setParsedClientConfig] = useState<ParsedClientConfig | null>(null);

  // 错误状态
  const [authTokenError, setAuthTokenError] = useState<string | null>(null);
  const [clientConfigError, setClientConfigError] = useState<string | null>(null);

  // 配置状态
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(50);
  const [schedulable, setSchedulable] = useState(true);

  // 文件输入引用
  const authTokenInputRef = useRef<HTMLInputElement>(null);
  const clientConfigInputRef = useRef<HTMLInputElement>(null);

  const importKiro = useImportKiroAccount();

  // 解析 kiro-auth-token.json 文件
  const parseAuthTokenFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json.refreshToken || !json.clientIdHash || !json.region) {
        throw new Error('Missing required fields: refreshToken, clientIdHash, or region');
      }

      setParsedAuthToken({
        refreshToken: json.refreshToken,
        clientIdHash: json.clientIdHash,
        region: json.region,
      });
      setAuthTokenFile(file);
      setAuthTokenError(null);
    } catch (err) {
      setAuthTokenError(
        err instanceof SyntaxError
          ? 'Invalid JSON format'
          : err instanceof Error
          ? err.message
          : 'Failed to parse file'
      );
      setAuthTokenFile(null);
      setParsedAuthToken(null);
    }
  }, []);

  // 解析 {clientIdHash}.json 文件
  const parseClientConfigFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json.clientId || !json.clientSecret) {
        throw new Error('Missing required fields: clientId or clientSecret');
      }

      setParsedClientConfig({
        clientId: json.clientId,
        clientSecret: json.clientSecret,
      });
      setClientConfigFile(file);
      setClientConfigError(null);
    } catch (err) {
      setClientConfigError(
        err instanceof SyntaxError
          ? 'Invalid JSON format'
          : err instanceof Error
          ? err.message
          : 'Failed to parse file'
      );
      setClientConfigFile(null);
      setParsedClientConfig(null);
    }
  }, []);

  // 处理文件选择
  const handleAuthTokenChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        parseAuthTokenFile(file);
      }
    },
    [parseAuthTokenFile]
  );

  const handleClientConfigChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        parseClientConfigFile(file);
      }
    },
    [parseClientConfigFile]
  );

  // 处理拖拽
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleAuthTokenDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.json')) {
        parseAuthTokenFile(file);
      }
    },
    [parseAuthTokenFile]
  );

  const handleClientConfigDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.json')) {
        parseClientConfigFile(file);
      }
    },
    [parseClientConfigFile]
  );

  // 清除文件
  const clearAuthToken = useCallback(() => {
    setAuthTokenFile(null);
    setParsedAuthToken(null);
    setAuthTokenError(null);
    if (authTokenInputRef.current) {
      authTokenInputRef.current.value = '';
    }
  }, []);

  const clearClientConfig = useCallback(() => {
    setClientConfigFile(null);
    setParsedClientConfig(null);
    setClientConfigError(null);
    if (clientConfigInputRef.current) {
      clientConfigInputRef.current.value = '';
    }
  }, []);

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!parsedAuthToken || !parsedClientConfig) {
      return;
    }

    await importKiro.mutateAsync({
      refreshToken: parsedAuthToken.refreshToken,
      clientId: parsedClientConfig.clientId,
      clientSecret: parsedClientConfig.clientSecret,
      clientIdHash: parsedAuthToken.clientIdHash,
      region: parsedAuthToken.region,
      name: name || undefined,
      priority,
      schedulable,
    });

    onSuccess();
  };

  const canSubmit = parsedAuthToken && parsedClientConfig && !importKiro.isPending;
  const showPreview = parsedAuthToken || parsedClientConfig;

  // 文件上传区域组件
  const FileUploadZone = ({
    file,
    parsed,
    error,
    inputRef,
    onFileChange,
    onDrop,
    onClear,
  }: {
    file: File | null;
    parsed: boolean;
    error: string | null;
    inputRef: React.RefObject<HTMLInputElement>;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onDrop: (e: React.DragEvent) => void;
    onClear: () => void;
  }) => {
    if (file && parsed) {
      return (
        <div className="flex items-center gap-2 p-2 rounded border bg-muted/30">
          <FileJson className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm truncate flex-1">{file.name}</span>
          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={onClear}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <>
        <div
          className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer
            ${error
              ? 'border-destructive/50 bg-destructive/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
            }`}
          onDragOver={handleDragOver}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json"
            onChange={onFileChange}
            className="hidden"
          />
          <Upload className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">
            Drop or <span className="text-primary font-medium">browse</span>
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span>{error}</span>
          </div>
        )}
      </>
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {/* 文件上传区域 - 双列布局 */}
        <div className="grid grid-cols-2 gap-3">
          {/* Auth Token File */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium flex-shrink-0">
                1
              </div>
              <span className="font-medium text-xs truncate">Auth Token</span>
            </div>
            <code className="block text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate">
              kiro-auth-token.json
            </code>
            <FileUploadZone
              file={authTokenFile}
              parsed={!!parsedAuthToken}
              error={authTokenError}
              inputRef={authTokenInputRef}
              onFileChange={handleAuthTokenChange}
              onDrop={handleAuthTokenDrop}
              onClear={clearAuthToken}
            />
          </div>

          {/* Client Config File */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium flex-shrink-0">
                2
              </div>
              <span className="font-medium text-xs truncate">Client Config</span>
            </div>
            <code className="block text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground truncate">
              {'{clientIdHash}'}.json
            </code>
            <FileUploadZone
              file={clientConfigFile}
              parsed={!!parsedClientConfig}
              error={clientConfigError}
              inputRef={clientConfigInputRef}
              onFileChange={handleClientConfigChange}
              onDrop={handleClientConfigDrop}
              onClear={clearClientConfig}
            />
          </div>
        </div>

        {/* Preview Section */}
        {showPreview && (
          <div className="rounded-lg border p-3 bg-muted/20">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {parsedAuthToken && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Region:</span>
                    <code className="bg-muted px-1 rounded">{parsedAuthToken.region}</code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Refresh Token:</span>
                    <span className="flex items-center gap-0.5 text-green-600">
                      <Check className="h-3 w-3" />
                      <span>OK</span>
                    </span>
                  </div>
                </>
              )}
              {parsedClientConfig && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Client ID:</span>
                    <span className="flex items-center gap-0.5 text-green-600">
                      <Check className="h-3 w-3" />
                      <span>OK</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Client Secret:</span>
                    <span className="flex items-center gap-0.5 text-green-600">
                      <Check className="h-3 w-3" />
                      <span>OK</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Account Settings */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kiro-name" className="text-sm">Name (Optional)</Label>
            <Input
              id="kiro-name"
              placeholder="e.g., My Kiro Account"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kiro-priority" className="text-sm">Priority (1-100)</Label>
              <Input
                id="kiro-priority"
                type="number"
                min={1}
                max={100}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kiro-schedulable" className="text-sm">Schedulable</Label>
              <div className="flex items-center h-9">
                <Switch
                  id="kiro-schedulable"
                  checked={schedulable}
                  onCheckedChange={setSchedulable}
                />
                <span className="ml-2 text-sm text-muted-foreground">
                  {schedulable ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {importKiro.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            'Import Account'
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
