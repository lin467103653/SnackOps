import Link from "next/link";
import { ArrowLeft, AlertTriangle, Bot, ClipboardList, Clock3, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { ExplainPanel, HandoffButton, RetryButton, RunAnnotateForm } from "@/components/actions/run-actions";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { AgentRunRecord, Annotation } from "@/lib/types";

export function AgentRunDetail({ run, annotations }: { run: AgentRunRecord; annotations: Annotation[] }) {
  const failedSteps = run.steps.filter((step) => step.status === "error" || step.status === "timeout");

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="xs" className="text-muted-foreground -ml-1.5">
        <Link href="/runs">
          <ArrowLeft aria-hidden />
          返回运行记录
        </Link>
      </Button>

      <PageHeader
        title={run.question.length > 40 ? `${run.question.slice(0, 40)}…` : run.question}
        description={run.id}
        meta={
          <>
            <StatusBadge status={run.status} />
            <TagBadge>{run.source}</TagBadge>
            <Badge variant="outline" className="font-mono">
              {run.provider} · {run.model}
            </Badge>
            <span className="text-muted-foreground text-[11px]">{formatDateTime(run.createdAt)}</span>
            {run.retryOf ? (
              <Link href={`/runs/${run.retryOf}`} className="text-primary text-[11px] underline-offset-4 hover:underline">
                重试自 {run.retryOf}
              </Link>
            ) : null}
            {run.handoff ? <Badge variant="info">已接管 · {run.handoff.assignee}</Badge> : null}
          </>
        }
        actions={
          <>
            <RetryButton runId={run.id} />
            <HandoffButton runId={run.id} disabled={Boolean(run.handoff)} />
          </>
        }
      />

      {run.notice ? (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-3.5 py-2 text-[11.5px] text-amber-900">
          {run.notice}
        </div>
      ) : null}

      {run.error ? (
        <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-rose-900">
            <AlertTriangle aria-hidden className="size-4" />
            {run.status === "failed" ? "运行失败" : run.status === "blocked" ? "运行被阻断（没有伪装成功）" : "运行有异常"}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-rose-800">{run.error}</p>
        </div>
      ) : null}

      <section aria-label="运行指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="运行状态" value={<StatusBadge status={run.status} />} icon={Bot} hint={`${run.steps.length} 步`} />
        <StatCard label="总耗时" value={formatDuration(run.durationMs)} icon={Clock3} hint="Planner → 回复" />
        <StatCard
          label="选中能力"
          value={`${run.plan?.selectedSkills.length ?? 0} / ${run.plan?.selectedTools.length ?? 0}`}
          icon={ClipboardList}
          hint="Skill / Tool"
        />
        <StatCard
          label="风险结论"
          value={run.riskResult ? <StatusBadge status={run.riskResult.verdict} /> : "无"}
          icon={ShieldCheck}
          tone={run.riskResult?.verdict === "block" ? "danger" : "default"}
          hint={run.riskResult ? `${run.riskResult.findings.length} 条命中` : "未执行"}
        />
        <StatCard
          label="失败步骤"
          value={failedSteps.length}
          unit="步"
          icon={AlertTriangle}
          tone={failedSteps.length > 0 ? "danger" : "positive"}
          hint={failedSteps.length > 0 ? failedSteps.map((step) => step.name).join("、") : "全部成功"}
        />
        <StatCard
          label="校验"
          value={<StatusBadge status={run.planValidation?.ok ? "success" : "error"} />}
          icon={ShieldCheck}
          hint={`${run.planValidation?.warnings.length ?? 0} 条提示`}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard
            title="Plan"
            description={run.plan?.reasoning ?? "没有生成计划"}
            action={
              run.plan ? (
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">风险 {run.plan.riskAssessment.level}</Badge>
                  {run.plan.riskAssessment.needsRiskCheck ? <Badge variant="warning">需要风险审查</Badge> : null}
                </div>
              ) : null
            }
          >
            {run.plan ? (
              <div className="space-y-2.5 px-4 pb-3">
                <div>
                  <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">必需能力</p>
                  <div className="flex flex-wrap gap-1">
                    {run.plan.mandatoryCapabilities.map((capability) => (
                      <TagBadge key={capability}>{capability}</TagBadge>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">Skill</p>
                    <div className="flex flex-wrap gap-1">
                      {run.plan.selectedSkills.length === 0 ? (
                        <span className="text-muted-foreground text-[11px]">无</span>
                      ) : (
                        run.plan.selectedSkills.map((id) => (
                          <TagBadge key={id} title={`v${run.skillVersions[id] ?? "?"}`}>
                            <Sparkles aria-hidden className="size-3" />
                            {id}
                          </TagBadge>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">Tool</p>
                    <div className="flex flex-wrap gap-1">
                      {run.plan.selectedTools.length === 0 ? (
                        <span className="text-muted-foreground text-[11px]">无</span>
                      ) : (
                        run.plan.selectedTools.map((id) => (
                          <TagBadge key={id} title={`v${run.toolVersions[id] ?? "?"}`}>
                            <Wrench aria-hidden className="size-3" />
                            {id}
                          </TagBadge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                {run.plan.degradation ? (
                  <p className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
                    降级：{run.plan.degradation.reason ?? "未说明"}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground px-4 pb-3 text-[11.5px]">运行在 Planner 之前就失败了，没有 Plan。</p>
            )}
          </SectionCard>

          <SectionCard
            title="Plan 校验"
            description={run.planValidation ? `${run.planValidation.errors.length} 个错误 / ${run.planValidation.warnings.length} 条提示` : "未执行"}
            action={<StatusBadge status={run.planValidation?.ok ? "success" : "error"} />}
          >
            <ul className="divide-y text-[11.5px]">
              {(run.planValidation?.errors.length ?? 0) === 0 && (run.planValidation?.warnings.length ?? 0) === 0 ? (
                <li className="text-muted-foreground px-4 py-2">没有发现问题。</li>
              ) : null}
              {(run.planValidation?.errors ?? []).map((error) => (
                <li key={error} className="flex gap-1.5 px-4 py-1.5 text-rose-800">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {error}
                </li>
              ))}
              {(run.planValidation?.warnings ?? []).map((warning) => (
                <li key={warning} className="flex gap-1.5 px-4 py-1.5 text-amber-800">
                  <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="执行 Trace" description="每一步的输入 / 输出都在下面，可以展开看原始 JSON">
            <ol className="divide-y">
              {run.steps.map((step) => (
                <li key={step.stepId} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-muted-foreground font-mono text-[10px]">{step.stepId}</span>
                    <TagBadge>{step.type}</TagBadge>
                    <span className="text-[12.5px]">{step.name}</span>
                    <StatusBadge status={step.status} className="ml-auto" />
                    <span className="tabular text-muted-foreground text-[10.5px]">{step.durationMs} ms</span>
                  </div>
                  {step.error ? <p className="mt-1 text-[11px] text-rose-700">{step.error}</p> : null}
                  <details className="mt-1">
                    <summary className="text-muted-foreground cursor-pointer text-[10.5px] select-none">输入 / 输出</summary>
                    <div className="mt-1 grid gap-1.5 lg:grid-cols-2">
                      <pre className="scroll-area-thin max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10.5px] leading-relaxed">
                        {JSON.stringify(step.input, null, 2)}
                      </pre>
                      <pre className="scroll-area-thin max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10.5px] leading-relaxed">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard
            title="最终回复"
            description="风险审查通过后才会原样发送；被阻断时这里是安全兜底话术"
            action={<StatusBadge status={run.status} />}
          >
            <div className="px-4 pb-3 text-[13px] leading-relaxed whitespace-pre-wrap">
              {run.finalReply ?? "（没有生成回复：本次运行失败或被阻断）"}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="风险审查"
            description={run.riskResult ? `by ${run.riskResult.checkedBy} · ${formatDateTime(run.riskResult.checkedAt)}` : "未执行"}
            action={run.riskResult ? <StatusBadge status={run.riskResult.verdict} /> : null}
          >
            {run.riskResult ? (
              <div className="space-y-2 px-4 pb-3">
                <p className="text-muted-foreground text-[11.5px]">{run.riskResult.note}</p>
                {run.riskResult.findings.length === 0 ? (
                  <p className="text-[11.5px]">没有命中阻断规则。</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {run.riskResult.findings.map((finding, index) => (
                      <li key={`${finding.ruleId}-${index}`} className="px-2.5 py-1.5 text-[11.5px]">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={finding.level === "block" ? "danger" : "warning"}>{finding.ruleId}</Badge>
                          <span>{finding.evidence}</span>
                        </div>
                        <p className="text-muted-foreground mt-0.5">建议：{finding.suggestion}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {run.riskResult.rewritten ? (
                  <div>
                    <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">安全改写</p>
                    <p className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11.5px] leading-relaxed">{run.riskResult.rewritten}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground px-4 pb-3 text-[11.5px]">本次没有生成风险结果。</p>
            )}
          </SectionCard>

          <SectionCard title="解释这次运行" description="基于 Plan / Trace / 风险结果生成说明">
            <ExplainPanel runId={run.id} />
          </SectionCard>

          <SectionCard
            title="标注"
            description={`${annotations.length} 条标注，进入统一标注库`}
          >
            <RunAnnotateForm runId={run.id} />
            {annotations.length > 0 ? (
              <ul className="divide-y border-t">
                {annotations.map((annotation) => (
                  <li key={annotation.id} className="px-4 py-2 text-[11.5px]">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={annotation.tag} />
                      <span className="text-muted-foreground ml-auto text-[10.5px]">
                        {annotation.author} · {formatDateTime(annotation.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 leading-relaxed">{annotation.note}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          <SectionCard title="运行元数据" description="复盘时定位用的版本信息">
            <dl className="divide-y text-[11.5px]">
              {[
                ["Run ID", run.id],
                ["会话 ID", run.conversationId],
                ["来源", run.source],
                ["Provider", `${run.provider} · ${run.model}`],
                ["Skill 版本", Object.entries(run.skillVersions).map(([id, version]) => `${id}@${version}`).join("、") || "—"],
                ["Tool 版本", Object.entries(run.toolVersions).map(([id, version]) => `${id}@${version}`).join("、") || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 px-4 py-1.5">
                  <dt className="text-muted-foreground shrink-0">{label}</dt>
                  <dd className="max-w-[62%] truncate text-right font-mono text-[10.5px]" title={String(value)}>
                    {String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
