"use client";

import * as React from "react";
import { AlertTriangle, ArrowRightLeft, Loader2, Play, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BatchStatus = "queued" | "running" | "done" | "error" | "cancelled";

interface CaseResult {
  caseId: string;
  caseName: string;
  question: string;
  status: "PASS" | "FAIL" | "REVIEW" | "ERROR";
  reason: string;
  keywordHits: string[];
  keywordMisses: string[];
  forbiddenHits: string[];
  expectedPrice: number | null;
  mentionedPrice: number | null;
  riskIssues: string[];
  inputRisk: { risky: boolean; signals: string[] };
  replySafety: { safe: boolean; issues: string[] };
  shouldSend: boolean;
  capabilityPath: { required: string[]; missing: string[]; forbidden: string[] };
  durationMs: number;
  runId: string | null;
  finalReply: string | null;
  riskVerdict: string | null;
}

export interface BatchView {
  id: string;
  name: string;
  versionLabel: string;
  changeNote: string;
  caseIds: string[];
  caseSetHash: string;
  evaluatorVersion: string;
  evaluatorHash: string;
  provider: string;
  model: string;
  status: BatchStatus;
  currentIndex: number;
  total: number;
  passed: number;
  failed: number;
  review: number;
  errors: number;
  caseResults: CaseResult[];
  createdAt: string;
  skillVersions: Record<string, string>;
  params: { temperature: number; maxTokens: number; plannerModel: string };
}

interface Comparison {
  comparable: boolean;
  reasons: string[];
  counts: {
    base: { total: number; passed: number; failed: number; review: number; errors: number; passRate: number };
    target: { total: number; passed: number; failed: number; review: number; errors: number; passRate: number };
  };
  fixed: { caseId: string; name: string; from: string; to: string }[];
  regressions: { caseId: string; name: string; from: string; to: string }[];
  newFailures: { caseId: string; name: string; status: string }[];
  changedReplies: { caseId: string; name: string; status: string }[];
  averageDuration: { base: number; target: number; delta: number };
  consistency: Record<string, boolean>;
}

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral" | "info"> = {
  PASS: "success",
  FAIL: "danger",
  REVIEW: "warning",
  ERROR: "neutral",
  queued: "neutral",
  running: "info",
  done: "success",
  error: "danger",
  cancelled: "neutral",
};

const TERMINAL: BatchStatus[] = ["done", "error", "cancelled"];

export function EvalBatchPanel({ cases, initialBatches }: { cases: { id: string; name: string; question: string; enabled: boolean }[]; initialBatches: BatchView[] }) {
  const [selected, setSelected] = React.useState<string[]>(cases.filter((item) => item.enabled).map((item) => item.id));
  const [name, setName] = React.useState("");
  const [versionLabel, setVersionLabel] = React.useState("baseline-v1");
  const [changeNote, setChangeNote] = React.useState("");
  const [batches, setBatches] = React.useState<BatchView[]>(initialBatches);
  const [activeId, setActiveId] = React.useState<string | null>(initialBatches[0]?.id ?? null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pollNote, setPollNote] = React.useState<string | null>(null);

  const [baseId, setBaseId] = React.useState(initialBatches[1]?.id ?? "");
  const [targetId, setTargetId] = React.useState(initialBatches[0]?.id ?? "");
  const [comparison, setComparison] = React.useState<Comparison | null>(null);
  const [compareError, setCompareError] = React.useState<string | null>(null);

  const active = batches.find((batch) => batch.id === activeId) ?? null;
  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch("/api/eval/batch", { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; data?: { items: BatchView[] } };
      if (payload.ok && payload.data) setBatches(payload.data.items);
    } catch {
      /* 忽略：下次轮询再试 */
    }
  }, []);
  const [pollingBatchId, setPollingBatchId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pollingBatchId) return;
    let stopped = false;

    const tick = async () => {
      const response = await fetch(`/api/eval/batch/${pollingBatchId}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: { batch: BatchView } }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !payload || payload.ok === false) {
        if (!stopped) {
          setError(payload && "error" in payload ? payload.error : `查询批次失败（HTTP ${response.status}）`);
          setPollingBatchId(null);
        }
        return;
      }

      const batch = payload.data.batch;
      setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);

      if (TERMINAL.includes(batch.status)) {
        setPollNote(batch.status === "done" ? "批次已完成" : `批次结束：${batch.status}`);
        setPollingBatchId(null);
        void refresh();
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 1200);
    const guard = window.setTimeout(() => {
      setPollNote("轮询超过 5 分钟已停止，可点「刷新」查看最新进度");
      setPollingBatchId(null);
    }, 5 * 60_000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(guard);
    };
  }, [pollingBatchId, refresh]);
  async function startBatch() {
    setCreating(true);
    setError(null);
    setPollNote(null);
    try {
      const response = await fetch("/api/eval/batch/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          versionLabel: versionLabel.trim() || undefined,
          changeNote: changeNote.trim() || undefined,
          caseIds: selected,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: { batchId: string; batch: BatchView; reused: boolean } }
        | { ok: false; error: string; invalidCaseIds?: string[] }
        | null;

      if (!response.ok || !payload || payload.ok === false) {
        const message = payload && "error" in payload ? payload.error : `创建批次失败（HTTP ${response.status}）`;
        setError(message);
        return;
      }

      const batch = payload.data.batch;
      setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)]);
      setActiveId(batch.id);
      setPollNote(payload.data.reused ? "已复用正在运行的同一批次（避免重复请求）" : "批次已创建，正在执行…");
      setPollingBatchId(batch.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "网络错误");
    } finally {
      setCreating(false);
    }
  }

  async function compare() {
    setCompareError(null);
    setComparison(null);
    if (!baseId || !targetId || baseId === targetId) {
      setCompareError("请选择两个不同的批次");
      return;
    }
    const response = await fetch(`/api/eval/compare?base=${encodeURIComponent(baseId)}&target=${encodeURIComponent(targetId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok: true; data: Comparison }
      | { ok: false; error: string }
      | null;
    if (!response.ok || !payload || payload.ok === false) {
      setCompareError(payload && "error" in payload ? payload.error : `对比失败（HTTP ${response.status}）`);
      return;
    }
    setComparison(payload.data);
  }

  const finished = batches.filter((batch) => TERMINAL.includes(batch.status));

  return (
    <div className="space-y-3">
      <div className="bg-card space-y-2 rounded-lg border p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold">创建批次</h3>
          <Badge variant="warning">规则评测，Judge 未启用</Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="batch-name">批次名称（可选）</Label>
            <Input id="batch-name" value={name} onChange={(event) => setName(event.target.value)} className="h-8 text-[12px]" placeholder="留空自动生成" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="batch-version">版本标签</Label>
            <Input id="batch-version" value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} className="h-8 font-mono text-[12px]" placeholder="baseline-v1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="batch-note">变更说明</Label>
            <Input id="batch-note" value={changeNote} onChange={(event) => setChangeNote(event.target.value)} className="h-8 text-[12px]" placeholder="如：风控话术修复" />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium">选择用例</span>
            <button
              type="button"
              className="text-primary text-[11px] underline-offset-4 hover:underline"
              onClick={() => setSelected(cases.filter((item) => item.enabled).map((item) => item.id))}
            >
              全选启用项
            </button>
            <button type="button" className="text-muted-foreground text-[11px] underline-offset-4 hover:underline" onClick={() => setSelected([])}>
              清空
            </button>
            <span className="text-muted-foreground text-[11px]">
              已选 {selected.length} / {cases.length}
            </span>
          </div>
          <div className="scroll-area-thin max-h-[150px] overflow-auto rounded-md border p-2">
            {cases.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-1.5 py-0.5 text-[11.5px]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.includes(item.id)}
                  onChange={() =>
                    setSelected((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))
                  }
                />
                <span className="min-w-0 break-words">
                  {item.name}
                  {!item.enabled ? <span className="text-muted-foreground">（停用）</span> : null}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={startBatch} disabled={creating || selected.length === 0}>
            {creating ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
            {creating ? "创建中…" : "运行批次"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw aria-hidden />
            刷新列表
          </Button>
          {pollNote ? <span className="text-muted-foreground text-[11px]">{pollNote}</span> : null}
          <span className="text-muted-foreground text-[11px]">执行中请勿重复点击（相同用例会复用同一批次）</span>
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 rounded-md border border-rose-300/70 bg-rose-50 px-2.5 py-1.5 text-[11.5px] text-rose-900">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        ) : null}
      </div>

      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-2">
          <h3 className="text-[13px] font-semibold">批次</h3>
          <p className="text-muted-foreground text-[10.5px]">点任意一行查看逐条结果；分数为本次真实执行的结果</p>
        </div>
        {batches.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-[11.5px]">还没有批次。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">批次</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>结果</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => (
                <TableRow key={batch.id} className={batch.id === activeId ? "bg-muted/40" : undefined}>
                  <TableCell className="pl-4">
                    <button type="button" className="text-left" onClick={() => setActiveId(batch.id)}>
                      <span className="text-[12.5px] font-medium">{batch.name}</span>
                      <span className="text-muted-foreground ml-1 font-mono text-[10px]">{batch.versionLabel}</span>
                      <p className="text-muted-foreground font-mono text-[10px]">
                        {batch.id} · {batch.provider}/{batch.model}
                      </p>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_TONE[batch.status] ?? "neutral"}>{batch.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-[11px]">
                    {batch.currentIndex}/{batch.total}
                  </TableCell>
                  <TableCell className="text-[10.5px]">
                    <span className="text-emerald-700">P {batch.passed}</span> · <span className="text-rose-700">F {batch.failed}</span> ·{" "}
                    <span className="text-amber-700">R {batch.review}</span> · <span className="text-muted-foreground">E {batch.errors}</span>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button size="xs" variant="ghost" onClick={() => setActiveId(batch.id)}>
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {active ? (
        <div className="bg-card overflow-hidden rounded-lg border">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
            <h3 className="text-[13px] font-semibold">{active.name}</h3>
            <Badge variant={STATUS_TONE[active.status] ?? "neutral"}>{active.status}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {active.versionLabel}
            </Badge>
            <Badge variant="warning">规则评测（{active.evaluatorVersion}），Judge 未启用</Badge>
            <span className="text-muted-foreground text-[10.5px]">
              caseSetHash {active.caseSetHash} · evaluator {active.evaluatorHash} · {active.provider}/{active.model}
            </span>
            {active.changeNote ? <span className="text-muted-foreground text-[10.5px]">备注：{active.changeNote}</span> : null}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">用例 / 问题</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>失败原因</TableHead>
                <TableHead>证据</TableHead>
                <TableHead className="pr-4 text-right">runId</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.caseResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground px-4 py-3 text-[11.5px]">
                    还没有结果（批次刚开始或排队中）。
                  </TableCell>
                </TableRow>
              ) : (
                active.caseResults.map((result) => (
                  <TableRow key={`${result.caseId}-${result.runId ?? "error"}`}>
                    <TableCell className="max-w-[260px] pl-4">
                      <p className="text-[12px] font-medium">{result.caseName}</p>
                      <p className="text-muted-foreground line-clamp-2 text-[10.5px]">{result.question}</p>
                      <details className="mt-0.5">
                        <summary className="text-muted-foreground cursor-pointer text-[10px] select-none">最终回复</summary>
                        <pre className="scroll-area-thin mt-1 max-h-[160px] overflow-auto rounded border bg-muted/30 p-1.5 text-[10.5px] whitespace-pre-wrap">
                          {result.finalReply ?? "（无回复）"}
                        </pre>
                      </details>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[result.status] ?? "neutral"}>{result.status}</Badge>
                      <p className="tabular text-muted-foreground mt-0.5 text-[10px]">{result.durationMs} ms</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-[10.5px] leading-relaxed">
                      <span className={result.status === "PASS" ? "text-emerald-700" : "text-rose-700"}>{result.reason}</span>
                    </TableCell>
                    <TableCell className="max-w-[280px] text-[10px] leading-relaxed">
                      <p>关键词 ✓{result.keywordHits.join("、") || "—"} / ✗{result.keywordMisses.join("、") || "—"}</p>
                      <p>禁词：{result.forbiddenHits.join("、") || "—"}</p>
                      <p>
                        价格：期望 {result.expectedPrice ?? "不校验"} / 提及 {result.mentionedPrice ?? "无"}
                      </p>
                      <p>
                        风险：{result.riskVerdict ?? "未审查"} · 输入风险 {result.inputRisk.risky ? "有" : "无"} · 可发送{" "}
                        {result.shouldSend ? "是" : "否"}
                      </p>
                      <p>
                        能力：必需 {result.capabilityPath.required.join("、") || "—"} · 缺 {result.capabilityPath.missing.join("、") || "无"}
                      </p>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {result.runId ? (
                        <a href={`/runs/${result.runId}`} className="text-primary font-mono text-[10px] underline-offset-4 hover:underline">
                          {result.runId.slice(-10)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <div className="bg-card space-y-2 rounded-lg border p-3.5">
        <h3 className="text-[13px] font-semibold">版本对比</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={baseId} onValueChange={setBaseId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="选择基线批次" />
            </SelectTrigger>
            <SelectContent>
              {finished.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.versionLabel} · {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="选择目标批次" />
            </SelectTrigger>
            <SelectContent>
              {finished.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.versionLabel} · {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={compare} disabled={finished.length < 2}>
            <ArrowRightLeft aria-hidden />
            对比
          </Button>
        </div>
        {finished.length < 2 ? (
          <p className="text-muted-foreground text-[11px]">至少需要两个已结束的批次才能对比。</p>
        ) : null}
        {compareError ? <p className="text-[11.5px] text-rose-700">{compareError}</p> : null}

        {comparison ? (
          <div className="space-y-2">
            {!comparison.comparable ? (
              <div className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
                <p className="font-medium">不可直接比较</p>
                <ul className="mt-0.5 list-disc pl-4">
                  {comparison.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-300/70 bg-emerald-50 px-2.5 py-2 text-[11.5px] text-emerald-900">
                用例集、评分器与运行条件一致，可以直接比较
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {(["base", "target"] as const).map((side) => {
                const counts = comparison.counts[side];
                return (
                  <div key={side} className="rounded-md border p-2 text-[11px]">
                    <p className="font-medium">{side === "base" ? "基线" : "目标"}</p>
                    <p className="text-muted-foreground">
                      通过率 {Math.round(counts.passRate * 100)}%（{counts.passed}/{counts.passed + counts.failed + counts.review}，ERROR 不计入分母）
                    </p>
                    <p>
                      PASS {counts.passed} · FAIL {counts.failed} · REVIEW {counts.review} · ERROR {counts.errors}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2 text-[11px] sm:grid-cols-2">
              <div>
                <p className="text-emerald-700 font-medium">已修复 {comparison.fixed.length}</p>
                <ul className="list-disc pl-4">
                  {comparison.fixed.map((item) => (
                    <li key={item.caseId}>
                      {item.name}（{item.from} → {item.to}）
                    </li>
                  ))}
                  {comparison.fixed.length === 0 ? <li className="text-muted-foreground">无</li> : null}
                </ul>
              </div>
              <div>
                <p className="text-rose-700 font-medium">
                  新增失败 {comparison.newFailures.length} · 回归 {comparison.regressions.length}
                </p>
                <ul className="list-disc pl-4">
                  {comparison.newFailures.map((item) => (
                    <li key={item.caseId}>
                      {item.name}（{item.status}）
                    </li>
                  ))}
                  {comparison.regressions.map((item) => (
                    <li key={`r-${item.caseId}`}>
                      {item.name}（{item.from} → {item.to}）
                    </li>
                  ))}
                  {comparison.newFailures.length + comparison.regressions.length === 0 ? <li className="text-muted-foreground">无</li> : null}
                </ul>
              </div>
            </div>

            <div className="text-[11px]">
              <p className="text-muted-foreground">
                状态不变但回复改变：{comparison.changedReplies.length} 条 · 平均耗时 {comparison.averageDuration.base} ms →{" "}
                {comparison.averageDuration.target} ms（{comparison.averageDuration.delta >= 0 ? "+" : ""}
                {comparison.averageDuration.delta} ms）
              </p>
              <ul className="list-disc pl-4">
                {comparison.changedReplies.map((item) => (
                  <li key={item.caseId}>
                    {item.name}（{item.status}）
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
