"use client";

import * as React from "react";
import { CircleCheck, CircleX, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useApiAction } from "@/hooks/use-api-action";
import { formatDateTime } from "@/lib/format";

interface DiagnosticsCheck {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

interface DiagnosticsReport {
  ok: boolean;
  dataDir: string;
  startedAt: string;
  finishedAt: string;
  checks: DiagnosticsCheck[];
  metrics: {
    reads: number;
    writes: number;
    lockAcquisitions: number;
    lockContentions: number;
    maxLockQueueDepth: number;
  };
}

export function DiagnosticsRunner() {
  const { run, pending } = useApiAction();
  const [report, setReport] = React.useState<DiagnosticsReport | null>(null);

  async function handleRun() {
    const payload = await run<{ data: DiagnosticsReport }>("/api/diagnostics/store", { method: "POST" });
    if (!payload?.data) return;
    setReport(payload.data);
    if (payload.data.ok) toast.success("存储自检全部通过：原子写、文件锁与契约校验均生效");
    else toast.warning("存储自检存在未通过项，请查看明细");
  }

  return (
    <div className="space-y-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-medium">存储层自检</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            在 selftest.json 沙箱上验证原子写、24 路并发锁、失败回滚与契约校验；不会修改业务数据。
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRun} disabled={pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
          {pending ? "自检中…" : "运行自检"}
        </Button>
      </div>

      {report ? (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span
              className={
                report.ok
                  ? "inline-flex items-center gap-1 rounded-md bg-emerald-600/12 px-1.5 py-0.5 font-medium text-emerald-700"
                  : "inline-flex items-center gap-1 rounded-md bg-rose-600/12 px-1.5 py-0.5 font-medium text-rose-700"
              }
            >
              {report.ok ? <CircleCheck className="size-3" aria-hidden /> : <CircleX className="size-3" aria-hidden />}
              {report.ok ? "全部通过" : "存在失败项"}
            </span>
            <span className="text-muted-foreground">
              {report.checks.filter((check) => check.ok).length}/{report.checks.length} 项通过 · 完成于{" "}
              {formatDateTime(report.finishedAt)}
            </span>
          </div>

          <ul className="divide-y rounded-md border">
            {report.checks.map((check) => (
              <li key={check.name} className="flex items-start gap-2 px-2.5 py-1.5">
                {check.ok ? (
                  <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-700" />
                ) : (
                  <CircleX aria-hidden className="mt-0.5 size-3.5 shrink-0 text-rose-700" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] font-medium">
                    {check.name}
                    <span className="text-muted-foreground tabular ml-1.5 font-normal">{check.durationMs} ms</span>
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-snug break-words">{check.detail}</p>
                </div>
                <span className="text-muted-foreground shrink-0 text-[10.5px]">{check.ok ? "通过" : "未通过"}</span>
              </li>
            ))}
          </ul>

          <p className="text-muted-foreground tabular text-[10.5px]">
            本次统计：读取 {report.metrics.reads} 次 · 写入 {report.metrics.writes} 次 · 取锁 {report.metrics.lockAcquisitions} 次 ·
            锁竞争 {report.metrics.lockContentions} 次 · 最大队列 {report.metrics.maxLockQueueDepth}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-[11px]">还没有运行过自检。点击右上角「运行自检」查看结果。</p>
      )}
    </div>
  );
}
