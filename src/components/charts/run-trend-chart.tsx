"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/empty-state";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RunTrendPoint } from "@/lib/queries";

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function TrendTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<TooltipEntry>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.find((item) => item.dataKey === "total")?.value ?? 0;
  const success = payload.find((item) => item.dataKey === "success")?.value ?? 0;
  const rate = payload.find((item) => item.dataKey === "successRate")?.value ?? 0;

  return (
    <div className="bg-card rounded-md border px-2.5 py-2 text-[11px] shadow-md">
      <p className="text-muted-foreground mb-1 font-medium">{String(label)}</p>
      <p className="text-foreground">
        运行 <span className="tabular font-semibold">{String(total)}</span> 次 · 成功{" "}
        <span className="tabular font-semibold">{String(success)}</span> 次
      </p>
      <p className="text-muted-foreground">成功率 {formatPercent(Number(rate))}</p>
    </div>
  );
}

export function RunTrendChart({ data, className }: { data: RunTrendPoint[]; className?: string }) {
  const hasData = data.some((point) => point.total > 0);
  const peak = data.reduce((max, point) => (point.total > max.total ? point : max), data[0]);
  const totalRuns = data.reduce((total, point) => total + point.total, 0);
  const latestRate = data.at(-1)?.successRate ?? 0;

  if (!hasData) {
    return (
      <EmptyState
        title="最近 14 天没有运行记录"
        description="Agent 还没有被触发过。可以先在评测页跑一个批次，或在工单页接管一条会话来产生数据。"
        className={className}
      />
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-1 inline-block size-2 rounded-full" aria-hidden />
          <span className="text-muted-foreground">每日运行量</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-chart-2 inline-block size-2 rounded-full" aria-hidden />
          <span className="text-muted-foreground">成功率</span>
        </span>
        <span className="text-muted-foreground ml-auto">
          14 天合计 <span className="tabular text-foreground font-medium">{totalRuns}</span> 次 · 峰值{" "}
          <span className="tabular text-foreground font-medium">{peak?.total ?? 0}</span> 次（{peak?.label}） · 最新成功率{" "}
          <span className="tabular text-foreground font-medium">{formatPercent(latestRate)}</span>
        </span>
      </div>
      <div className="h-[210px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="snackops-run-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              width={38}
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 1]}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border)" }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="total"
              name="运行量"
              stroke="var(--color-chart-1)"
              strokeWidth={1.8}
              fill="url(#snackops-run-fill)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="successRate"
              name="成功率"
              stroke="var(--color-chart-2)"
              strokeWidth={1.6}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
