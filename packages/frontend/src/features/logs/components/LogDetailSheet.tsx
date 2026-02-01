import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLogDetail } from '@/lib/queries';
import { JsonViewer } from '@/components/ui/json-viewer';
import {
  Monitor,
  Server,
  Cloud,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface LogDetailSheetProps {
  logId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogDetailSheet({ logId, open, onOpenChange }: LogDetailSheetProps) {
  const { data, isLoading } = useLogDetail(logId);
  const log = data?.data;
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = async () => {
    if (!logId) return;
    await navigator.clipboard.writeText(logId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTokens = (tokens: number | null | undefined) => {
    if (tokens === null || tokens === undefined) return '-';
    return tokens.toLocaleString();
  };

  const formatTime = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatTimeOnly = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const getStatusDisplay = () => {
    if (!log) return { text: '-', color: 'text-muted-foreground' };
    if (log.status === 'success') {
      return { text: `成功 (${log.statusCode})`, color: 'text-green-600' };
    }
    if (log.status === 'error') {
      return { text: `失败 (${log.statusCode || 'Error'})`, color: 'text-red-600' };
    }
    return { text: '处理中', color: 'text-yellow-600' };
  };

  const countJsonKeys = (jsonStr: string | null | undefined): number => {
    if (!jsonStr) return 0;
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.keys(parsed).length;
      }
      return 0;
    } catch {
      return 0;
    }
  };

  const status = getStatusDisplay();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-[700px] !max-w-[700px] flex flex-col overflow-hidden p-0"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="text-xl">请求详情</SheetTitle>
          {logId && (
            <div className="flex items-center gap-2 mt-1">
              <code className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                {logId}
              </code>
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                onClick={handleCopyId}
              >
                {copiedId ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            加载中...
          </div>
        ) : log ? (
          <div className="flex-1 overflow-auto">
            {/* 请求流程 */}
            <section className="px-6 py-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">请求流程</h3>
              <div className="flex items-center justify-center gap-2 p-4 bg-muted/30 rounded-lg">
                <FlowNode icon={<Monitor className="h-6 w-6" />} label="客户端" />
                <FlowArrow />
                <FlowNode icon={<Server className="h-6 w-6" />} label="Claude Router" active />
                <FlowArrow />
                <FlowNode icon={<Cloud className="h-6 w-6" />} label={log.platform || '上游服务'} />
              </div>
            </section>

            {/* 请求概要 */}
            <section className="px-6 py-3">
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-3">请求概要</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px 16px' }}>
                  <SummaryItem label="状态" value={status.text} valueClass={status.color} />
                  <SummaryItem label="总耗时" value={formatDuration(log.durationMs)} />
                  <SummaryItem label="输入令牌" value={formatTokens(log.inputTokens)} />
                  <SummaryItem label="输出令牌" value={formatTokens(log.outputTokens)} />
                  <SummaryItem label="渠道" value={log.platform || '-'} />
                  <SummaryItem label="模型" value={log.model || '-'} mono />
                  <SummaryItem label="路径" value={log.path} mono />
                  <SummaryItem label="时间" value={formatTime(log.createdAt)} />
                </div>
              </div>
            </section>

            {/* 请求时间线 */}
            <section className="px-6 py-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">请求时间线</h3>
              <div className="space-y-0">
                {/* 客户端请求 */}
                <TimelineItem
                  color="blue"
                  label="客户端请求"
                  time={formatTimeOnly(log.createdAt)}
                >
                  <div className="text-sm space-y-1 mb-3">
                    <div>
                      <span className="text-muted-foreground">方法:</span>{' '}
                      <span className="font-medium">POST</span>
                      <span className="text-muted-foreground ml-4">路径:</span>{' '}
                      <span className="font-mono">/v1/messages</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">模型:</span>{' '}
                      <span className="font-mono">{log.model || '-'}</span>
                    </div>
                  </div>
                  <CollapsibleJson
                    title="请求头"
                    count={countJsonKeys(log.clientHeaders)}
                    data={log.clientHeaders}
                  />
                  <CollapsibleJson
                    title="请求体"
                    count={countJsonKeys(log.requestBody)}
                    data={log.requestBody}
                  />
                </TimelineItem>

                {/* 上游请求 */}
                <TimelineItem
                  color="purple"
                  label="上游请求"
                  time={formatTimeOnly(log.createdAt)}
                  offset="+0ms"
                >
                  <div className="text-sm space-y-1 mb-3">
                    <div>
                      <span className="text-muted-foreground">渠道:</span>{' '}
                      <span className="font-medium">{log.platform || '上游服务'}</span>
                      <span className="text-muted-foreground ml-4">模型:</span>{' '}
                      <span className="font-mono">{log.targetModel || '-'}</span>
                    </div>
                  </div>
                  <CollapsibleJson
                    title="请求头"
                    count={countJsonKeys(log.upstreamRequestHeaders)}
                    data={log.upstreamRequestHeaders}
                  />
                  <CollapsibleJson
                    title="请求体"
                    count={countJsonKeys(log.upstreamRequestBody)}
                    data={log.upstreamRequestBody}
                  />
                </TimelineItem>

                {/* 上游响应 */}
                <TimelineItem
                  color="purple"
                  label="上游响应"
                  time={formatTimeOnly(log.createdAt)}
                  offset={log.durationMs ? `+${log.durationMs}ms` : undefined}
                >
                  <CollapsibleJson
                    title="响应头"
                    count={countJsonKeys(log.upstreamResponseHeaders)}
                    data={log.upstreamResponseHeaders}
                  />
                  <CollapsibleJson
                    title="响应体"
                    count={countJsonKeys(log.upstreamResponseBody)}
                    data={log.upstreamResponseBody}
                  />
                </TimelineItem>

                {/* 客户端响应 */}
                <TimelineItem
                  color="blue"
                  label="客户端响应"
                  time={formatTimeOnly(log.createdAt)}
                  offset={log.durationMs ? `+${log.durationMs}ms` : undefined}
                  isLast
                >
                  <div className="text-sm space-y-1 mb-3">
                    <div>
                      <span className="text-muted-foreground">状态码:</span>{' '}
                      <span className={`font-medium ${log.statusCode && log.statusCode < 400 ? 'text-green-600' : 'text-red-600'}`}>
                        {log.statusCode || '-'}
                      </span>
                    </div>
                  </div>
                  <CollapsibleJson
                    title="响应头"
                    count={countJsonKeys(log.clientResponseHeaders)}
                    data={log.clientResponseHeaders}
                  />
                  <CollapsibleJson
                    title="响应体"
                    count={countJsonKeys(log.responseBody)}
                    data={log.responseBody}
                  />
                </TimelineItem>
              </div>
            </section>

            {/* 错误信息 */}
            {log.errorMessage && (
              <section className="px-6 py-4">
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 p-4">
                  <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                    错误信息
                  </div>
                  <pre className="text-sm text-red-600 dark:text-red-300 whitespace-pre-wrap break-all font-mono">
                    {log.errorMessage}
                  </pre>
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            日志不存在
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FlowNode({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 px-6 py-4 rounded-lg border ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background'
      }`}
    >
      <div className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
      <ArrowRight className="h-4 w-4" />
      <ArrowLeft className="h-4 w-4" />
    </div>
  );
}

function SummaryItem({
  label,
  value,
  valueClass,
  mono,
}: {
  label: string;
  value: string;
  valueClass?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium truncate ${mono ? 'font-mono text-xs' : ''} ${valueClass || ''}`}>
        {value}
      </div>
    </div>
  );
}

function TimelineItem({
  color,
  label,
  time,
  offset,
  isLast,
  children,
}: {
  color: 'blue' | 'purple';
  label: string;
  time: string;
  offset?: string;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  const dotColor = color === 'blue' ? '#3b82f6' : '#a855f7';
  const labelBg = color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';

  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      {/* 左侧：圆点 + 连接线 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
        <div style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          marginTop: '4px',
          flexShrink: 0,
        }} />
        {!isLast && (
          <div style={{
            width: '2px',
            flex: 1,
            backgroundColor: '#e5e7eb',
            marginTop: '4px',
          }} />
        )}
      </div>

      {/* 右侧：内容 */}
      <div style={{ flex: 1, paddingBottom: '20px' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${labelBg}`}>{label}</span>
          <span className="text-sm text-muted-foreground">{time}</span>
          {offset && <span className="text-xs text-muted-foreground">({offset})</span>}
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function CollapsibleJson({
  title,
  count,
  data,
}: {
  title: string;
  count: number;
  data: string | null | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data) return;
    try {
      const parsed = JSON.parse(data);
      await navigator.clipboard.writeText(JSON.stringify(parsed, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border rounded-lg mb-2">
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">{count} 项</span>
        </div>
        <button
          type="button"
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="border-t px-3 py-2">
          <JsonViewer data={data} maxHeight="300px" />
        </div>
      )}
    </div>
  );
}
