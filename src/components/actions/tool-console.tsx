"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Play, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface ToolConsoleOption {
  id: string;
  name: string;
  kind: string;
  version: string;
  enabled: boolean;
  sampleInput: unknown;
}

interface TestResult {
  toolId: string;
  input: unknown;
  output: Record<string, unknown>;
  durationMs: number;
  testedAt: string;
  usedSampleInput: boolean;
}

/**
 * Tool 测试台：所有结果都来自 POST /api/tools/[id]/test 的返回，
 * 客户端只负责展示，不构造任何「成功」文案。
 */
export function ToolConsole({ tools }: { tools: ToolConsoleOption[] }) {
  const first = tools[0];
  const [toolId, setToolId] = React.useState(first?.id ?? "");
  const [input, setInput] = React.useState(JSON.stringify(first?.sampleInput ?? {}, null, 2));
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<TestResult | null>(null);
  const [error, setError] = React.useState<{ message: string; hint: string | null } | null>(null);

  const current = tools.find((tool) => tool.id === toolId);

  function selectTool(nextId: string) {
    setToolId(nextId);
    const next = tools.find((tool) => tool.id === nextId);
    setInput(JSON.stringify(next?.sampleInput ?? {}, null, 2));
    setResult(null);
    setError(null);
  }

  async function handleRun() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input || "{}");
    } catch {
      setError({ message: "入参不是合法 JSON", hint: "检查括号与引号后重试" });
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(toolId)}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: parsed }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; data: TestResult }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !body || body.ok === false) {
        setError({
          message: body && "error" in body ? body.error : `测试失败（HTTP ${response.status}）`,
          hint: null,
        });
        setResult(null);
        return;
      }
      setResult(body.data);
    } catch (fetchError) {
      setError({ message: fetchError instanceof Error ? fetchError.message : "网络错误", hint: null });
    } finally {
      setPending(false);
    }
  }

  if (tools.length === 0) {
    return <p className="text-muted-foreground px-4 py-3 text-[11.5px]">没有可测试的 Tool。</p>;
  }

  return (
    <div className="space-y-2.5 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-1">
          <Label htmlFor="tool-console-select">选择 Tool</Label>
          <Select value={toolId} onValueChange={selectTool}>
            <SelectTrigger id="tool-console-select" size="sm" className="w-full">
              <SelectValue placeholder="选择 Tool" />
            </SelectTrigger>
            <SelectContent>
              {tools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}（{tool.id}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current ? (
            <p className="text-muted-foreground text-[10.5px]">
              {current.kind} · v{current.version} · {current.enabled ? "已启用" : "已停用（仍可测试）"}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label htmlFor="tool-console-input">入参 JSON</Label>
          <Textarea
            id="tool-console-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            className="scroll-area-thin min-h-[96px] resize-y font-mono text-[11.5px] leading-relaxed"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">
          请求：<span className="font-mono">POST /api/tools/{toolId}/test</span> · 服务端真实读 data/*.json
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setInput(JSON.stringify(current?.sampleInput ?? {}, null, 2));
              setResult(null);
              setError(null);
            }}
            disabled={pending}
          >
            <RotateCcw aria-hidden />
            重置示例
          </Button>
          <Button size="sm" onClick={handleRun} disabled={pending || !toolId}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
            {pending ? "运行中…" : "运行测试"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-300/70 bg-rose-50 px-2.5 py-2 text-[11.5px] text-rose-900">
          <p className="flex items-center gap-1 font-medium">
            <AlertTriangle aria-hidden className="size-3.5" />
            {error.message}
          </p>
          {error.hint ? <p className="mt-0.5 text-[11px] text-rose-700">{error.hint}</p> : null}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Badge variant="success">服务端返回成功</Badge>
            <span className="tabular text-muted-foreground">{result.durationMs} ms</span>
            <span className="text-muted-foreground">
              {result.usedSampleInput ? "示例入参" : "自定义入参"} · {new Date(result.testedAt).toLocaleTimeString("zh-CN", { hour12: false })}
            </span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">真实输入</p>
              <pre className="scroll-area-thin max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10.5px] leading-relaxed">
                {JSON.stringify({ tool: result.toolId, input: result.input }, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">真实输出</p>
              <pre className="scroll-area-thin max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10.5px] leading-relaxed">
                {JSON.stringify(result.output, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
