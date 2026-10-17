"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Bot, CirclePlay, ClipboardList, Loader2, Send, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { useAgentStream } from "@/hooks/use-agent-stream";

export interface WorkspaceLlmInfo {
  configured: boolean;
  label: string;
  model: string;
  provider: string | null;
  fixture: boolean;
  hint: string | null;
}

const EXAMPLES = [
  { label: "推荐", text: "想买点办公室零食，预算 50 元以内，不要坚果，有什么推荐？" },
  { label: "价格", text: "买 8 件蜂蜜黄油夏威夷果，用 SG199-30 这张券，满 299 减 50 的活动能一起用吗？到手多少钱？" },
  { label: "物流", text: "我的订单 SG2026101210007 显示签收了但我没收到，物流停在哪个环节？" },
  { label: "诈骗", text: "客服说我中奖了，让我先转 200 元保证金到指定账户才能领奖，是真的吗？" },
];

export function AgentWorkspace({
  llm,
  skills,
  tools,
  recentRuns,
}: {
  llm: WorkspaceLlmInfo;
  skills: { id: string; name: string }[];
  tools: { id: string; name: string }[];
  recentRuns: { id: string; question: string; status: string; createdAt: string; riskVerdict: string | null }[];
}) {
  const router = useRouter();
  const { state, start } = useAgentStream();
  const [question, setQuestion] = React.useState(EXAMPLES[0]!.text);

  const skillName = new Map(skills.map((skill) => [skill.id, skill.name]));
  const toolName = new Map(tools.map((tool) => [tool.id, tool.name]));
  const busy = state.running;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 2) {
      toast.error("请先输入问题");
      return;
    }
    await start({ question: trimmed, source: "workspace" });
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <form onSubmit={handleSubmit} className="bg-card rounded-lg border p-4 shadow-none">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="workspace-question" className="text-[13px] font-medium">
              问点什么
            </Label>
            <div className="flex flex-wrap items-center gap-1">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => setQuestion(example.text)}
                  className="border-border text-muted-foreground hover:bg-accent rounded-md border px-2 py-0.5 text-[11px] transition-colors"
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            id="workspace-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：想买点办公室零食，预算 50 以内，不要坚果"
            className="min-h-[86px] text-[13px]"
            maxLength={600}
            disabled={busy}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-[11px]">
              {question.length}/600 · 会经过 Planner → 校验 → Skill/Tool → 风险审查
            </p>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              {busy ? "运行中…" : "运行 Agent"}
            </Button>
          </div>
        </form>

        {state.error ? (
          <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-rose-900">
              <AlertTriangle aria-hidden className="size-4" />
              运行没有完成
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-rose-800">{state.error}</p>
            {state.errorHint ? <p className="mt-1 text-[11.5px] text-rose-700">{state.errorHint}</p> : null}
            <p className="mt-1.5 text-[11px] text-rose-700">
              没有生成回复就是没有生成，不会伪造成功。可以修改问题重试，或到
              <Link href="/settings" className="underline underline-offset-2">
                运行时配置
              </Link>
              检查 Provider。
            </p>
          </div>
        ) : null}

        {state.plan ? (
          <section className="bg-card rounded-lg border shadow-none">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <ClipboardList aria-hidden className="text-muted-foreground size-4" />
                <h2 className="text-[13px] font-semibold">Plan</h2>
                {state.planParseOk === false ? <Badge variant="danger">JSON 解析失败，已降级</Badge> : null}
                {state.plan.degradation?.handoff ? <Badge variant="warning">Planner 声明转人工</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">风险 {state.plan.riskAssessment.level}</Badge>
                {state.plan.riskAssessment.needsRiskCheck ? <Badge variant="warning">需要风险审查</Badge> : null}
              </div>
            </header>
            <div className="space-y-2.5 px-4 py-3">
              <div>
                <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">必需能力</p>
                <div className="flex flex-wrap gap-1">
                  {state.mandatoryCapabilities.map((capability) => (
                    <TagBadge key={capability}>{capability}</TagBadge>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">选中 Skill</p>
                  <div className="flex flex-wrap gap-1">
                    {state.plan.selectedSkills.length === 0 ? (
                      <span className="text-muted-foreground text-[11px]">无</span>
                    ) : (
                      state.plan.selectedSkills.map((id) => (
                        <TagBadge key={id} title={id}>
                          <Sparkles aria-hidden className="size-3" />
                          {skillName.get(id) ?? id}
                        </TagBadge>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">选中 Tool</p>
                  <div className="flex flex-wrap gap-1">
                    {state.plan.selectedTools.length === 0 ? (
                      <span className="text-muted-foreground text-[11px]">无</span>
                    ) : (
                      state.plan.selectedTools.map((id) => (
                        <TagBadge key={id} title={id}>
                          <Wrench aria-hidden className="size-3" />
                          {toolName.get(id) ?? id}
                        </TagBadge>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[11.5px] leading-relaxed">
                <span className="text-muted-foreground">推理：</span>
                {state.plan.reasoning}
              </p>
              {state.plan.degradation ? (
                <p className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
                  降级执行：{state.plan.degradation.reason ?? "未说明原因"}
                  {state.plan.degradation.handoff ? "（转人工）" : ""}
                </p>
              ) : null}
              {state.planParseError ? (
                <p className="text-[11.5px] text-rose-700">解析错误：{state.planParseError}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {state.validation ? (
          <section className="bg-card rounded-lg border shadow-none">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck aria-hidden className="text-muted-foreground size-4" />
                <h2 className="text-[13px] font-semibold">Plan 校验</h2>
              </div>
              <StatusBadge status={state.validation.ok ? "success" : "error"} />
            </header>
            <ul className="divide-y text-[11.5px]">
              {state.validation.errors.length === 0 && state.validation.warnings.length === 0 ? (
                <li className="text-muted-foreground px-4 py-2">没有发现问题：能力覆盖、启用状态、必需 Tool 都通过。</li>
              ) : null}
              {state.validation.errors.map((error) => (
                <li key={error} className="flex gap-1.5 px-4 py-1.5 text-rose-800">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {error}
                </li>
              ))}
              {state.validation.warnings.map((warning) => (
                <li key={warning} className="flex gap-1.5 px-4 py-1.5 text-amber-800">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {state.steps.length > 0 ? (
          <section className="bg-card rounded-lg border shadow-none">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">执行 Trace</h2>
              <span className="text-muted-foreground text-[11px]">{state.steps.length} 步</span>
            </header>
            <ol className="divide-y">
              {state.steps.map((step) => (
                <li key={step.stepId} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground font-mono text-[10px]">{step.stepId}</span>
                    <TagBadge>{step.type}</TagBadge>
                    <span className="text-[12.5px]">{step.name}</span>
                    <StatusBadge status={step.status} className="ml-auto" />
                    <span className="tabular text-muted-foreground text-[10.5px]">{step.durationMs} ms</span>
                  </div>
                  {step.error ? <p className="mt-1 text-[11px] text-rose-700">{step.error}</p> : null}
                  {step.type === "tool" && step.output ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px]">
                      返回：{JSON.stringify(step.output).slice(0, 220)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {state.riskResult ? (
          <section className="bg-card rounded-lg border shadow-none">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck aria-hidden className="text-muted-foreground size-4" />
                <h2 className="text-[13px] font-semibold">风险审查</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={state.riskResult.verdict} />
                <span className="text-muted-foreground text-[10.5px]">by {state.riskResult.checkedBy}</span>
              </div>
            </header>
            <div className="space-y-1.5 px-4 py-3 text-[11.5px]">
              <p className="text-muted-foreground">{state.riskResult.note}</p>
              {state.riskResult.findings.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {state.riskResult.findings.map((finding, index) => (
                    <li key={`${finding.ruleId}-${index}`} className="px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={finding.level === "block" ? "danger" : "warning"}>{finding.ruleId}</Badge>
                        <span>{finding.evidence}</span>
                      </div>
                      <p className="text-muted-foreground mt-0.5">建议：{finding.suggestion}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {state.finalReply ? (
          <section className="bg-card rounded-lg border shadow-none">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Bot aria-hidden className="text-muted-foreground size-4" />
                <h2 className="text-[13px] font-semibold">最终回复</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={state.status ?? "success"} />
                <span className="tabular text-muted-foreground text-[10.5px]">{state.durationMs} ms</span>
                {state.runId ? (
                  <Button asChild variant="ghost" size="xs">
                    <Link href={`/runs/${state.runId}`}>
                      详情
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </header>
            <div className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap">{state.finalReply}</div>
            {state.error ? <p className="border-t px-4 py-2 text-[11px] text-rose-700">{state.error}</p> : null}
          </section>
        ) : null}
      </div>

      <div className="space-y-4">
        <section className="bg-card rounded-lg border p-4 shadow-none">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">Provider</h2>
            <Badge variant={llm.configured ? (llm.fixture ? "warning" : "success") : "danger"}>
              {llm.configured ? (llm.fixture ? "课堂演示" : "真实模型") : "未配置"}
            </Badge>
          </div>
          <dl className="mt-2 space-y-1 text-[11.5px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">实现</dt>
              <dd className="font-mono text-[11px]">{llm.provider ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">模型</dt>
              <dd className="font-mono text-[11px]">{llm.model}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">可用 Skill / Tool</dt>
              <dd className="tabular">
                {skills.length} / {tools.length}
              </dd>
            </div>
          </dl>
          {llm.hint ? <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">{llm.hint}</p> : null}
          {state.fixture ? (
            <p className="mt-2 rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
              本次运行由确定性 fixture 生成，未调用外部模型。
            </p>
          ) : null}
        </section>

        <section className="bg-card rounded-lg border shadow-none">
          <header className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">最近运行</h2>
            <Button asChild variant="ghost" size="xs">
              <Link href="/runs">全部</Link>
            </Button>
          </header>
          {recentRuns.length === 0 ? (
            <p className="text-muted-foreground px-4 py-3 text-[11.5px]">还没有运行记录，跑一次就会出现在这里。</p>
          ) : (
            <ul className="divide-y">
              {recentRuns.map((run) => (
                <li key={run.id} className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={run.status} />
                    {run.riskVerdict ? <Badge variant="outline">风险 {run.riskVerdict}</Badge> : null}
                    <span className="text-muted-foreground ml-auto text-[10px]">
                      {new Date(run.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                  <Link href={`/runs/${run.id}`} className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug hover:underline">
                    {run.question}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-card rounded-lg border p-4 shadow-none">
          <h2 className="text-[13px] font-semibold">其他入口</h2>
          <div className="mt-2 flex flex-col gap-1.5">
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/demo">
                <CirclePlay aria-hidden />
                简化聊天演示页
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/overview">
                <Sparkles aria-hidden />
                运营总览（指标看板）
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start">
              <Link href="/skills">
                <Wrench aria-hidden />
                Skill / Tool 管理
              </Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-[10.5px]">
            风险审查在最终回复生成之后执行，结论会写进 RunRecord 的 riskResult。
          </p>
        </section>
      </div>
    </div>
  );
}
