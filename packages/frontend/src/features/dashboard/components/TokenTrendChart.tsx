import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useTokenTimeseries } from '@/lib/queries';
import type { ChartTimeRange } from '@claude-code-router/shared';
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Loader2 } from 'lucide-react';

const chartConfig = {
  inputTokens: {
    label: '输入 Token',
    color: 'hsl(var(--chart-1))',
  },
  outputTokens: {
    label: '输出 Token',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

function formatXAxis(time: string, timeRange: ChartTimeRange) {
  const d = new Date(time);
  if (timeRange === 'day') {
    return `${d.getHours().toString().padStart(2, '0')}:00`;
  }
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
}

interface TokenTrendChartProps {
  timeRange: ChartTimeRange;
}

export function TokenTrendChart({ timeRange }: TokenTrendChartProps) {
  const { data, isLoading } = useTokenTimeseries(timeRange);
  const items = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Token 用量趋势</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            暂无数据
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <LineChart data={items} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => formatXAxis(v, timeRange)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                  return v.toString();
                }}
              />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatXAxis(v, timeRange)} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="inputTokens"
                type="monotone"
                stroke="var(--color-inputTokens)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="outputTokens"
                type="monotone"
                stroke="var(--color-outputTokens)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
