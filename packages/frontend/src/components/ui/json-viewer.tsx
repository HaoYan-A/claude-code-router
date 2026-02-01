import * as React from 'react';
import { Check, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface JsonViewerProps {
  data: string | null | undefined;
  className?: string;
  maxHeight?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  title?: string;
}

export function JsonViewer({
  data,
  className,
  maxHeight = '400px',
  collapsible = false,
  defaultCollapsed = false,
  title,
}: JsonViewerProps) {
  const [copied, setCopied] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const formattedContent = React.useMemo(() => {
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }, [data]);

  const highlightedContent = React.useMemo(() => {
    if (!formattedContent) return null;
    return highlightJson(formattedContent);
  }, [formattedContent]);

  const handleCopy = async () => {
    if (!formattedContent) return;
    try {
      await navigator.clipboard.writeText(formattedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 忽略复制失败
    }
  };

  if (!data) {
    return (
      <div className={cn('text-sm text-muted-foreground italic', className)}>
        No data
      </div>
    );
  }

  const content = (
    <div
      className="overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs"
      style={{ maxHeight }}
    >
      <pre className="whitespace-pre-wrap break-all">
        {highlightedContent}
      </pre>
    </div>
  );

  if (collapsible && title) {
    return (
      <div className={cn('rounded-lg border', className)}>
        <div className="flex items-center justify-between px-3 py-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground/80"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {title}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {!collapsed && <div className="border-t px-3 py-2">{content}</div>}
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute right-2 top-2 h-7 px-2 opacity-70 hover:opacity-100"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      {content}
    </div>
  );
}

function highlightJson(json: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < json.length) {
    const char = json[i];

    // 字符串
    if (char === '"') {
      const start = i;
      i++;
      while (i < json.length && json[i] !== '"') {
        if (json[i] === '\\') i++;
        i++;
      }
      i++;
      const str = json.slice(start, i);

      // 检查是否是对象的 key（后面跟着冒号）
      const afterStr = json.slice(i).match(/^\s*:/);
      if (afterStr) {
        tokens.push(
          <span key={key++} className="text-blue-600 dark:text-blue-400">
            {str}
          </span>
        );
      } else {
        tokens.push(
          <span key={key++} className="text-green-600 dark:text-green-400">
            {str}
          </span>
        );
      }
      continue;
    }

    // 数字
    if (/[\d\-]/.test(char)) {
      const start = i;
      if (char === '-') i++;
      while (i < json.length && /[\d.eE+\-]/.test(json[i])) {
        i++;
      }
      const num = json.slice(start, i);
      tokens.push(
        <span key={key++} className="text-amber-600 dark:text-amber-400">
          {num}
        </span>
      );
      continue;
    }

    // 布尔值和 null
    const remaining = json.slice(i);
    const boolMatch = remaining.match(/^(true|false|null)/);
    if (boolMatch) {
      tokens.push(
        <span key={key++} className="text-purple-600 dark:text-purple-400">
          {boolMatch[1]}
        </span>
      );
      i += boolMatch[1].length;
      continue;
    }

    // 其他字符（括号、冒号、逗号等）
    tokens.push(<span key={key++}>{char}</span>);
    i++;
  }

  return tokens;
}
