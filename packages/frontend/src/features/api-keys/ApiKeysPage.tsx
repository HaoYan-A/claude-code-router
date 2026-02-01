import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiKeys, useDeleteApiKey, useAdminApiKeys, useAdminDeleteApiKey } from '@/lib/queries';
import { Plus, Trash2, Edit, BarChart3, Key, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { CreateApiKeyDialog, EditApiKeyDialog, ApiKeyStatsCard } from './components';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiKeyWithMappingsResponse, ApiKeyWithUserResponse } from '@claude-code-router/shared';

function CopyKeyButton({ apiKeyId }: { apiKeyId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === 'loading') return;

    setStatus('loading');
    try {
      const response = await api.get<{ success: boolean; data: { key: string } }>(
        `/api-keys/${apiKeyId}/key`
      );
      await navigator.clipboard.writeText(response.data.key);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      title={status === 'error' ? '复制失败' : '复制完整密钥'}
      className="h-6 w-6"
    >
      {status === 'success' ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

export function ApiKeysPage() {
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyWithMappingsResponse | ApiKeyWithUserResponse | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  // 根据角色选择不同的 API，只执行对应的请求
  const userApiKeys = useApiKeys(page, 20, !isAdmin);
  const adminApiKeys = useAdminApiKeys(page, 20, undefined, isAdmin);
  const userDeleteMutation = useDeleteApiKey();
  const adminDeleteMutation = useAdminDeleteApiKey();

  const { data, isLoading } = isAdmin ? adminApiKeys : userApiKeys;
  const deleteMutation = isAdmin ? adminDeleteMutation : userDeleteMutation;

  const handleDelete = async (id: string) => {
    if (window.confirm('确定要删除这个 API 密钥吗？')) {
      await deleteMutation.mutateAsync(id);
      if (selectedKeyId === id) {
        setSelectedKeyId(null);
      }
    }
  };

  if (isLoading) {
    return <div>加载中...</div>;
  }

  const apiKeys = data?.data.data ?? [];
  const totalPages = data?.data.totalPages ?? 1;

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Left Panel - API Key List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">API 密钥 {isAdmin && '(所有用户)'}</h1>
          {!isAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              创建密钥
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead>用户</TableHead>}
                <TableHead>名称</TableHead>
                <TableHead>密钥前缀</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最后使用</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Key className="h-8 w-8" />
                      <p>暂无 API 密钥</p>
                      {!isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                          创建你的第一个密钥
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                apiKeys.map((key) => {
                  const keyWithUser = key as ApiKeyWithUserResponse;
                  return (
                  <TableRow
                    key={key.id}
                    className={selectedKeyId === key.id ? 'bg-muted/50' : 'cursor-pointer'}
                    onClick={() => setSelectedKeyId(key.id)}
                  >
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {keyWithUser.user?.avatarUrl && (
                            <img
                              src={keyWithUser.user.avatarUrl}
                              alt={keyWithUser.user.githubUsername}
                              className="h-6 w-6 rounded-full"
                            />
                          )}
                          <span className="text-sm">{keyWithUser.user?.githubUsername}</span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="rounded bg-muted px-2 py-1 text-sm">
                          {key.keyPrefix}...
                        </code>
                        <CopyKeyButton apiKeyId={key.id} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          key.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {key.isActive ? '已启用' : '已禁用'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : '从未使用'}
                    </TableCell>
                    <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKeyId(key.id);
                          }}
                          title="查看统计"
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingKey(key);
                          }}
                          title="编辑"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(key.id);
                          }}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <span className="flex items-center px-4 text-sm">
              第 {page} 页，共 {totalPages} 页
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* Right Panel - Details & Stats */}
      <div className="w-[400px] flex-shrink-0">
        {selectedKeyId ? (
          <div className="space-y-4">
            <ApiKeyStatsCard apiKeyId={selectedKeyId} isAdmin={isAdmin} />

            {/* Model Mappings */}
            {apiKeys.find((k) => k.id === selectedKeyId)?.modelMappings && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">模型映射</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {apiKeys
                      .find((k) => k.id === selectedKeyId)
                      ?.modelMappings.map((mapping) => (
                        <div
                          key={mapping.claudeModel}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="font-medium capitalize">{mapping.claudeModel}</span>
                          <span className="text-muted-foreground">
                            {mapping.platform}/{mapping.targetModel}
                          </span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>选择一个 API 密钥查看统计信息</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      {!isAdmin && <CreateApiKeyDialog open={showCreate} onOpenChange={setShowCreate} />}
      <EditApiKeyDialog
        open={!!editingKey}
        onOpenChange={(open) => !open && setEditingKey(null)}
        apiKey={editingKey}
        isAdmin={isAdmin}
      />
    </div>
  );
}
