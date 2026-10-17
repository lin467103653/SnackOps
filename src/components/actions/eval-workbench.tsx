"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Loader2, Pencil, Play, Plus, Power, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiAction } from "@/hooks/use-api-action";

export interface EvalCaseRow {
  id: string;
  name: string;
  question: string;
  category: string;
  difficulty: "简单" | "中等" | "困难";
  riskLevel: "low" | "medium" | "high";
  expectedBehavior: string;
  expectedReply: string;
  expectedKeywords: string[];
  keywordMode: "AND" | "OR";
  forbiddenWords: string[];
  expectedPrice: number | null;
  priceTolerance: number;
  expectRiskPassed: boolean;
  requiredCapabilities: string[];
  forbiddenCapabilities: string[];
  evalDimension: string;
  llmJudgePrompt: string | null;
  tags: string[];
  sourceRunId: string | null;
  createdAt: string;
  enabled: boolean;
}

interface ScoreResult {
  status: "PASS" | "FAIL" | "REVIEW" | "ERROR";
  passed: boolean;
  reason: string;
  evidence: string[];
  keywordHits: string[];
  keywordMisses: string[];
  forbiddenHits: string[];
  expectedPrice: number | null;
  mentionedPrice: number | null;
  riskIssues: string[];
  capabilityHits: { required: string[]; missing: string[]; forbidden: string[] };
  inputRisk: { risky: boolean; signals: string[] };
  replySafety: { safe: boolean; issues: string[] };
  shouldSend: boolean;
  durationMs: number;
  runId: string;
}

interface RunView {
  id: string;
  status: string;
  question: string;
  finalReply: string | null;
  provider: string;
  model: string;
  durationMs: number;
  steps: { stepId: string; type: string; name: string; status: string; durationMs: number; error: string | null }[];
}

const EMPTY: FormState = {
  name: "",
  question: "",
  category: "商品推荐",
  difficulty: "中等" as const,
  riskLevel: "low" as const,
  expectedBehavior: "",
  expectedReply: "",
  expectedKeywords: "",
  keywordMode: "AND" as const,
  forbiddenWords: "",
  expectedPrice: "",
  expectRiskPassed: "true",
  requiredCapabilities: "",
  forbiddenCapabilities: "",
  evalDimension: "准确性",
  tags: "",
  enabled: true,
};

type FormState = {
  name: string;
  question: string;
  category: string;
  difficulty: "简单" | "中等" | "困难";
  riskLevel: "low" | "medium" | "high";
  expectedBehavior: string;
  expectedReply: string;
  expectedKeywords: string;
  keywordMode: "AND" | "OR";
  forbiddenWords: string;
  expectedPrice: string;
  expectRiskPassed: string;
  requiredCapabilities: string;
  forbiddenCapabilities: string;
  evalDimension: string;
  tags: string;
  enabled: boolean;
};

function parseAgentStream(text: string) {
  return text
    .split("\n\n")
    .map((frame) => frame.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; [key: string]: unknown });
}

export function EvalWorkbench({ cases, skills, tools }: { cases: EvalCaseRow[]; skills: { id: string; name: string }[]; tools: { id: string; name: string }[] }) {
  const { run, pending } = useApiAction();
  const router = useRouter();

  const [category, setCategory] = React.useState("all");
  const [difficulty, setDifficulty] = React.useState("all");
  const [risk, setRisk] = React.useState("all");
  const [dimension, setDimension] = React.useState("all");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [runView, setRunView] = React.useState<RunView | null>(null);
  const [score, setScore] = React.useState<ScoreResult | null>(null);
  const [runError, setRunError] = React.useState<{ message: string; hint: string | null } | null>(null);

  const categories = [...new Set(cases.map((item) => item.category))];
  const visible = cases.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (difficulty === "all" || item.difficulty === difficulty) &&
      (risk === "all" || item.riskLevel === risk) &&
      (dimension === "all" || item.evalDimension === dimension),
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(item: EvalCaseRow) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      question: item.question,
      category: item.category,
      difficulty: item.difficulty,
      riskLevel: item.riskLevel,
      expectedBehavior: item.expectedBehavior,
      expectedReply: item.expectedReply,
      expectedKeywords: item.expectedKeywords.join("，"),
      keywordMode: item.keywordMode,
      forbiddenWords: item.forbiddenWords.join("，"),
      expectedPrice: item.expectedPrice === null ? "" : String(item.expectedPrice),
      expectRiskPassed: String(item.expectRiskPassed),
      requiredCapabilities: item.requiredCapabilities.join("，"),
      forbiddenCapabilities: item.forbiddenCapabilities.join("，"),
      evalDimension: item.evalDimension,
      tags: item.tags.join("，"),
      enabled: item.enabled,
    });
    setFormOpen(true);
  }

  const split = (value: string) =>
    value
      .split(/[，,、\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = {
      name: form.name.trim(),
      question: form.question.trim(),
      category: form.category.trim(),
      difficulty: form.difficulty,
      riskLevel: form.riskLevel,
      expectedBehavior: form.expectedBehavior.trim(),
      expectedReply: form.expectedReply,
      expectedKeywords: split(form.expectedKeywords),
      keywordMode: form.keywordMode,
      forbiddenWords: split(form.forbiddenWords),
      expectedPrice: form.expectedPrice.trim() === "" ? null : Number(form.expectedPrice),
      expectRiskPassed: form.expectRiskPassed === "true",
      requiredCapabilities: split(form.requiredCapabilities),
      forbiddenCapabilities: split(form.forbiddenCapabilities),
      evalDimension: form.evalDimension,
      tags: split(form.tags),
      enabled: form.enabled,
    };

    const payload = editingId
      ? await run(`/api/eval/cases/${editingId}`, { method: "PATCH", body, successMessage: "用例已更新" })
      : await run("/api/eval/cases", { body, successMessage: "用例已创建" });

    if (payload) {
      setFormOpen(false);
      setEditingId(null);
      router.refresh();
    }
  }

  async function toggleEnabled(item: EvalCaseRow) {
    const payload = await run(`/api/eval/cases/${item.id}`, {
      method: "PATCH",
      body: { enabled: !item.enabled },
      successMessage: item.enabled ? "已停用" : "已启用",
    });
    if (payload) router.refresh();
  }

  async function duplicate(item: EvalCaseRow) {
    const payload = await run(`/api/eval/cases/${item.id}`, {
      method: "PATCH",
      body: { duplicate: true },
      successMessage: "已复制用例",
    });
    if (payload) router.refresh();
  }

  async function remove(item: EvalCaseRow) {
    const payload = await run(`/api/eval/cases/${item.id}`, {
      method: "DELETE",
      successMessage: "已删除用例",
    });
    if (payload) router.refresh();
  }

  async function runCase(item: EvalCaseRow) {
    setRunningId(item.id);
    setRunError(null);
    setScore(null);
    setRunView(null);

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: item.question, source: "eval", conversationId: `eval-${item.id}` }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string; hint?: string } | null;
        setRunError({ message: body?.error ?? `运行失败（HTTP ${response.status}）`, hint: body?.hint ?? null });
        toast.error("Agent 运行失败");
        return;
      }

      const events = parseAgentStream(await response.text());
      const done = events.find((event) => event.type === "done") as { runId?: string; status?: string } | undefined;
      if (!done?.runId) {
        setRunError({ message: "SSE 未返回 runId", hint: null });
        return;
      }

      const scored = await fetch("/api/eval/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: item.id, runId: done.runId }),
      });
      const payload = (await scored.json().catch(() => null)) as
        | { ok: true; data: { score: ScoreResult; run: RunView } }
        | { ok: false; error: string }
        | null;

      if (!scored.ok || !payload || payload.ok === false) {
        setRunError({ message: payload && "error" in payload ? payload.error : `评分失败（HTTP ${scored.status}）`, hint: null });
        return;
      }

      setRunView(payload.data.run);
      setScore(payload.data.score);
      toast.success(`评分：${payload.data.score.status}`);
      router.refresh();
    } catch (error) {
      setRunError({ message: error instanceof Error ? error.message : "网络错误", hint: null });
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={openCreate}>
          <Plus aria-hidden />
          新增用例
        </Button>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categories.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger size="sm" className="w-[120px]">
            <SelectValue placeholder="难度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部难度</SelectItem>
            {["简单", "中等", "困难"].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger size="sm" className="w-[120px]">
            <SelectValue placeholder="风险" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部风险</SelectItem>
            {["low", "medium", "high"].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dimension} onValueChange={setDimension}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="维度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部维度</SelectItem>
            {["准确性", "安全性", "完整性", "语气", "效率"].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground text-[11px]">
          共 {visible.length} / {cases.length} 条
        </span>
      </div>

      {formOpen ? (
        <form onSubmit={submitForm} className="bg-card space-y-2 rounded-lg border p-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">{editingId ? "编辑用例" : "新增用例"}</h3>
            <Button type="button" size="xs" variant="ghost" onClick={() => setFormOpen(false)}>
              <X aria-hidden />
              关闭
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ec-name">名称</Label>
              <Input id="ec-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-[12px]" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-category">分类 / 场景</Label>
              <Input id="ec-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-8 text-[12px]" required />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ec-question">问题</Label>
            <Textarea id="ec-question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} className="min-h-[52px] text-[12px]" required />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="ec-difficulty">难度</Label>
              <Select value={form.difficulty} onValueChange={(value) => setForm({ ...form, difficulty: value as FormState["difficulty"] })}>
                <SelectTrigger id="ec-difficulty" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["简单", "中等", "困难"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-risk">风险等级</Label>
              <Select value={form.riskLevel} onValueChange={(value) => setForm({ ...form, riskLevel: value as FormState["riskLevel"] })}>
                <SelectTrigger id="ec-risk" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-dim">评测维度</Label>
              <Select value={form.evalDimension} onValueChange={(value) => setForm({ ...form, evalDimension: value })}>
                <SelectTrigger id="ec-dim" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["准确性", "安全性", "完整性", "语气", "效率"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ec-behavior">期望行为</Label>
            <Textarea id="ec-behavior" value={form.expectedBehavior} onChange={(e) => setForm({ ...form, expectedBehavior: e.target.value })} className="min-h-[48px] text-[12px]" required />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ec-keywords">期望关键词（逗号分隔）</Label>
              <Input id="ec-keywords" value={form.expectedKeywords} onChange={(e) => setForm({ ...form, expectedKeywords: e.target.value })} className="h-8 text-[12px]" placeholder="辣，元" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-mode">关键词模式</Label>
              <Select value={form.keywordMode} onValueChange={(value) => setForm({ ...form, keywordMode: value as "AND" | "OR" })}>
                <SelectTrigger id="ec-mode" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND（全部命中）</SelectItem>
                  <SelectItem value="OR">OR（命中任一）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ec-forbidden">禁词（逗号分隔）</Label>
              <Input id="ec-forbidden" value={form.forbiddenWords} onChange={(e) => setForm({ ...form, forbiddenWords: e.target.value })} className="h-8 text-[12px]" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-price">期望价格（元，留空不校验）</Label>
              <Input id="ec-price" type="number" step="0.01" value={form.expectedPrice} onChange={(e) => setForm({ ...form, expectedPrice: e.target.value })} className="h-8 tabular text-[12px]" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ec-risk-pass">风控期望</Label>
              <Select value={form.expectRiskPassed} onValueChange={(value) => setForm({ ...form, expectRiskPassed: value })}>
                <SelectTrigger id="ec-risk-pass" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">回复应通过风控（可发送）</SelectItem>
                  <SelectItem value="false">回复应被拦截</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-tags">标签（逗号分隔）</Label>
              <Input id="ec-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="h-8 text-[12px]" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ec-required">必需能力（逗号分隔）</Label>
              <Input
                id="ec-required"
                value={form.requiredCapabilities}
                onChange={(e) => setForm({ ...form, requiredCapabilities: e.target.value })}
                className="h-8 text-[12px]"
                placeholder={`如 ${skills[0]?.id ?? "recommendation"}，${tools[0]?.id ?? "calculate_price"}`}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ec-forbidden-cap">禁用能力（逗号分隔）</Label>
              <Input
                id="ec-forbidden-cap"
                value={form.forbiddenCapabilities}
                onChange={(e) => setForm({ ...form, forbiddenCapabilities: e.target.value })}
                className="h-8 text-[12px]"
              />
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-[11.5px]">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            保存后启用
          </label>

          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
              {editingId ? "保存修改" : "创建用例"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="bg-card overflow-hidden rounded-lg border">
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-4 py-4 text-[11.5px]">当前筛选下没有用例。清空筛选或新增一条。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">用例</TableHead>
                <TableHead>分类 / 难度</TableHead>
                <TableHead>校验条件</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-[320px] pl-4">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[12.5px] font-medium">{item.name}</span>
                      <Badge variant="outline" className="font-mono text-[9.5px]">
                        {item.id}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-[11px] leading-snug">{item.question}</p>
                  </TableCell>
                  <TableCell className="text-[11px]">
                    <Badge variant="outline">{item.category}</Badge>
                    <span className="text-muted-foreground ml-1">{item.difficulty}</span>
                    <p className="text-muted-foreground mt-0.5">
                      风险 {item.riskLevel} · {item.evalDimension}
                    </p>
                  </TableCell>
                  <TableCell className="text-[10.5px] leading-relaxed">
                    <p>
                      关键词 {item.keywordMode}：{item.expectedKeywords.join(" / ") || "—"}
                    </p>
                    <p>禁词：{item.forbiddenWords.join(" / ") || "—"}</p>
                    <p>
                      价格：{item.expectedPrice === null ? "不校验" : `${item.expectedPrice} 元`} · 风控：
                      {item.expectRiskPassed ? "应放行" : "应拦截"}
                    </p>
                    <p>能力：{item.requiredCapabilities.join(" / ") || "—"}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.enabled ? "success" : "neutral"}>{item.enabled ? "启用" : "停用"}</Badge>
                    {item.llmJudgePrompt ? <Badge variant="warning">LLM 评判</Badge> : null}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button size="xs" variant="outline" disabled={runningId !== null || !item.enabled} onClick={() => runCase(item)}>
                        {runningId === item.id ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
                        单测
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil aria-hidden />
                        编辑
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => duplicate(item)} disabled={pending}>
                        <Copy aria-hidden />
                        复制
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => toggleEnabled(item)} disabled={pending}>
                        <Power aria-hidden />
                        {item.enabled ? "停用" : "启用"}
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => remove(item)} disabled={pending}>
                        <Trash2 aria-hidden />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {runError ? (
        <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-rose-900">
            <AlertTriangle aria-hidden className="size-3.5" />
            单测失败：{runError.message}
          </p>
          {runError.hint ? <p className="mt-1 text-[11px] text-rose-700">{runError.hint}</p> : null}
        </div>
      ) : null}

      {score && runView ? (
        <div className="bg-card space-y-2 rounded-lg border p-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={score.status === "PASS" ? "success" : score.status === "FAIL" ? "danger" : score.status === "REVIEW" ? "warning" : "neutral"}
            >
              {score.status}
            </Badge>
            <span className="text-muted-foreground text-[11px]">
              runId <span className="font-mono">{score.runId}</span> · {score.durationMs} ms · {runView.provider}/{runView.model}
            </span>
            <Badge variant="outline">{runView.status}</Badge>
            <Badge variant={score.shouldSend ? "success" : "danger"}>{score.shouldSend ? "可发送" : "不可发送"}</Badge>
            {score.inputRisk.risky ? <Badge variant="warning">用户输入有风险信号</Badge> : null}
          </div>

          <p className="text-[12px] leading-relaxed">{score.reason}</p>

          <div className="grid gap-2 lg:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">最终回复（本次真实生成）</p>
              <pre className="scroll-area-thin max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-2 text-[11.5px] leading-relaxed whitespace-pre-wrap">
                {runView.finalReply ?? "（无回复）"}
              </pre>
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-[10.5px] tracking-wide uppercase">评分证据</p>
              <ul className="space-y-0.5 text-[11px]">
                <li>关键词命中：{score.keywordHits.join("、") || "—"}</li>
                <li>关键词缺失：{score.keywordMisses.join("、") || "—"}</li>
                <li>禁词命中：{score.forbiddenHits.join("、") || "—"}</li>
                <li>
                  价格：期望 {score.expectedPrice ?? "不校验"} / 回复提及 {score.mentionedPrice ?? "无"}
                </li>
                <li>安全：{score.replySafety.safe ? "通过" : score.replySafety.issues.join("；")}</li>
                <li>
                  能力：必需 {score.capabilityHits.required.join("、") || "—"} · 缺失{" "}
                  {score.capabilityHits.missing.join("、") || "无"} · 禁用{" "}
                  {score.capabilityHits.forbidden.join("、") || "无"}
                </li>
              </ul>
              <details>
                <summary className="text-muted-foreground cursor-pointer text-[10.5px] select-none">展开 Trace（{runView.steps.length} 步）</summary>
                <ul className="scroll-area-thin mt-1 max-h-[180px] space-y-0.5 overflow-auto text-[10.5px]">
                  {runView.steps.map((step) => (
                    <li key={step.stepId} className="flex items-center gap-1.5">
                      <span className="font-mono text-[9.5px]">{step.stepId}</span>
                      <span className="min-w-0 flex-1 truncate">{step.name}</span>
                      <Badge variant={step.status === "success" ? "success" : step.status === "skipped" ? "neutral" : "danger"}>{step.status}</Badge>
                      <span className="tabular text-muted-foreground">{step.durationMs} ms</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>

          <p className="text-muted-foreground text-[10.5px]">
            {score.status === "ERROR"
              ? "ERROR 表示运行/模型侧失败，不计入产品失败率。"
              : score.status === "REVIEW"
                ? "REVIEW 表示规则通过但配置了模型评判，单独统计，不当作 PASS/FAIL。"
                : "评分基于本次 RunRecord 的最终回复与 Trace，可用上面的 runId 到运行详情复查。"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
