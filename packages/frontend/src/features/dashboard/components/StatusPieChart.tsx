import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useLogStats } from '@/lib/queries';
import type { ChartTimeRange } from '@claude-code-router/shared';
import { PieChart, Pie, Cell, Label } from 'recharts';
import { Loader2 } from 'lucide-react';

const chartConfig = {
  success: {
    label: '成功',
    color: 'hsl(var(--chart-1))',
  },
  error: {
    label: '错误',
    color: 'hsl(var(--chart-5))',
  },
} satisfies ChartConfig;

interface StatusPieChartProps {
  timeRange: ChartTimeRange;
}

export function StatusPieChart({ timeRange }: StatusPieChartProps) {
  const { data, isLoading } = useLogStats(timeRange);
  const stats = data?.data;

  const chartData = [
    { name: 'success', value: stats?.successRequests ?? 0, fill: 'var(--color-success)' },
    { name: 'error', value: stats?.errorRequests ?? 0, fill: 'var(--color-error)' },
  ];

  const total = (stats?.successRequests ?? 0) + (stats?.errorRequests ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">请求状态分布</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            暂无数据
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                strokeWidth={5}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                            {total.toLocaleString()}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground text-sm">
                            总请求
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        {total > 0 && (
          <div className="mt-2 flex justify-center gap-6 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-1))' }} />
              <span className="text-muted-foreground">成功 {stats?.successRequests?.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-5))' }} />
              <span className="text-muted-foreground">错误 {stats?.errorRequests?.toLocaleString()}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
