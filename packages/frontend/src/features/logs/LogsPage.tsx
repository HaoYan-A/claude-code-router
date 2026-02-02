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
import { useLogs } from '@/lib/queries';
import { CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { LogDetailSheet } from './components/LogDetailSheet';
import { useAuthStore } from '@/stores/auth.store';

export function LogsPage() {
  const [page, setPage] = useState(1);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const { data, isLoading } = useLogs({ page, pageSize: 20 });
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const logs = data?.data.data ?? [];
  const totalPages = data?.data.totalPages ?? 1;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const formatTokens = (tokens: number | null) => {
    if (tokens === null || tokens === undefined) return '-';
    return tokens.toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <h1 className="text-3xl font-bold">请求日志</h1>
      </div>

      {/* Table Container */}
      <div className="flex-1 min-h-0 rounded-md border overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-[50px]">状态</TableHead>
                {isAdmin && <TableHead>用户</TableHead>}
                {isAdmin && <TableHead>API Key</TableHead>}
                {isAdmin && <TableHead>账户</TableHead>}
                <TableHead>模型</TableHead>
                <TableHead>目标模型</TableHead>
                <TableHead className="text-right">输入</TableHead>
                <TableHead className="text-right">输出</TableHead>
                <TableHead className="text-right">缓存</TableHead>
                <TableHead className="text-right">耗时</TableHead>
                <TableHead className="text-center">状态码</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>{getStatusIcon(log.status)}</TableCell>
                  {isAdmin && (
                    <TableCell className="max-w-[120px] truncate">
                      <span className="font-medium text-sm">
                        {log.userName || log.userId.slice(-8)}
                      </span>
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell className="max-w-[120px] truncate">
                      <span className="font-medium text-sm">
                        {log.apiKeyName || log.apiKeyId.slice(-8)}
                      </span>
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell className="max-w-[150px] truncate text-sm">
                      {log.accountName || '-'}
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm">
                    {log.model || '-'}
                  </TableCell>
                  <TableCell className="font-mono text-sm max-w-[150px] truncate">
                    {log.targetModel || '-'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTokens(log.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTokens(log.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTokens(log.cacheReadTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatDuration(log.durationMs)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {log.statusCode || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedLogId(log.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </div>

      {/* Pagination */}
      <div className="shrink-0 mt-4 flex justify-center gap-2">
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

      <LogDetailSheet
        logId={selectedLogId}
        open={!!selectedLogId}
        onOpenChange={(open) => !open && setSelectedLogId(null)}
      />
    </div>
  );
}
