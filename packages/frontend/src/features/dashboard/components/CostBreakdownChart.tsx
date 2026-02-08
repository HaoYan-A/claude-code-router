import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useCostBreakdown } from '@/lib/queries';
import type { ChartTimeRange } from '@claude-code-router/shared';
import { PieChart, Pie, Cell, Label } from 'recharts';
import { Loader2 } from 'lucide-react';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--muted-foreground))',
];

interface CostBreakdownChartProps {
  timeRange: ChartTimeRange;
}

export function CostBreakdownChart({ timeRange }: CostBreakdownChartProps) {
  const { data, isLoading } = useCostBreakdown(timeRange);
  const items = data?.data ?? [];

  const chartData = useMemo(
    () =>
      items.map((item, i) => ({
        name: item.model,
        value: item.cost,
        fill: COLORS[i % COLORS.length],
      })),
    [items]
  );

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    items.forEach((item, i) => {
      config[item.model] = {
        label: item.model,
        color: COLORS[i % COLORS.length],
      };
    });
    return config;
  }, [items]);

  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">费用组成</CardTitle>
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
          <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="name"
                    hideLabel
                    formatter={(value) => `$${Number(value).toFixed(4)}`}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                strokeWidth={5}
              >
                {chartData.map((entry, i) => (
                  <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                            ${totalCost.toFixed(2)}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground text-sm">
                            总费用
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
        {items.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
            {items.map((item, i) => (
              <div key={item.model} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground">{item.model}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
