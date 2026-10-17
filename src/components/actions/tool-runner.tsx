"use client";

import * as React from "react";
import { Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";

interface RunResult {
  toolId: string;
  input: unknown;
  output: Record<string, unknown>;
  durationMs: number;
  testedAt: string;
  usedSampleInput: boolean;
}

/** Tool 单项测试：可编辑入参 JSON，结果直接展示真实数据返回 */
export function ToolRunner({
  toolId,
  sampleInput,
  disabled = false,
}: {
  toolId: string;
  sampleInput: unknown;
  disabled?: boolean;
}) {
  const { run, pending } = useApiAction();
  const [input, setInput] = React.useState(JSON.stringify(sampleInput, null, 2));
  const [result, setResult] = React.useState<RunResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRun() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input || "{}");
    } catch {
      setError("入参不是合法 JSON，请检查括号与引号");
      toast.error("入参不是合法 JSON");
      return;
    }
    setError(null);
    const payload = await run<{ data: RunResult }>(`/api/tools/${toolId}/test`, { body: { input: parsed } });
    if (!payload?.data) return;
    setResult(payload.data);
    toast.success(`运行成功：${payload.data.durationMs} ms`);
  }

  return (
    <div className="space-y-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">入参（JSON，默认使用注册表里的 sampleInput）</p>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setInput(JSON.stringify(sampleInput, null, 2));
              setResult(null);
              setError(null);
            }}
            disabled={pending}
          >
            <RotateCcw aria-hidden />
            重置示例
          </Button>
          <Button size="sm" onClick={handleRun} disabled={pending || disabled}>
            <Play aria-hidden />
            {pending ? "运行中…" : "运行测试"}
          </Button>
        </div>
      </div>

      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        spellCheck={false}
        aria-label="工具入参 JSON"
        aria-invalid={error ? true : undefined}
        className="scroll-area-thin min-h-[132px] resize-y font-mono text-[12px] leading-relaxed"
      />
      {error ? <p className="text-destructive text-[11px]">{error}</p> : null}
      {disabled ? <p className="text-muted-foreground text-[11px]">该工具已停用，仍可测试，但 Planner 不会拿到它。</p> : null}

      {result ? (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-medium">返回结果</span>
            <span className="tabular text-muted-foreground">{result.durationMs} ms</span>
            <span className="text-muted-foreground">
              {result.usedSampleInput ? "使用示例入参" : "使用自定义入参"} · 完成于{" "}
              {new Date(result.testedAt).toLocaleTimeString("zh-CN", { hour12: false })}
            </span>
          </div>
          <pre className="scroll-area-thin max-h-[380px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(result.output, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
