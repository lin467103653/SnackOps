import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Coins,
  Gauge,
  Layers,
  MessageSquare,
  RotateCcw,
  Star,
  Timer,
  Wrench,
} from "lucide-react";

import { AgentRunDetail } from "@/components/agent-run-detail";
import { AnnotationForm } from "@/components/actions/annotation-form";
import { TakeoverButton } from "@/components/actions/takeover-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { PriorityBadge, StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgentRun } from "@/lib/agent/run-store";
import { getAnnotations, getRatings, getRuns, getSkills, getTickets } from "@/lib/data";
import { formatDateTime, formatDuration, formatMoney, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "运行详情" };

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Agent 主链路的 RunRecord 与第一段的历史运行共用 /runs/[id]，按数据源分流
  const agentRun = await getAgentRun(decodeURIComponent(id));
  if (agentRun) {
    const annotations = (await getAnnotations()).filter(
      (annotation) => annotation.targetType === "agent_run" && annotation.targetId === agentRun.id,
    );
    return <AgentRunDetail run={agentRun} annotations={annotations} />;
  }

  const [runs, tickets, skills, ratings, annotations] = await Promise.all([
    getRuns(),
    getTickets(),
    getSkills(),
    getRatings(),
    getAnnotations(),
  ]);

  const run = runs.find((item) => item.id === id);
  if (!run) notFound();

  const ticket = run.ticketId ? tickets.find((item) => item.id === run.ticketId) : undefined;
  const skill = skills.find((item) => item.id === run.skillKey);
  const runRatings = ratings.filter((rating) => rating.runId === run.id);
  const runAnnotations = annotations.filter(
    (annotation) => annotation.targetType === "run" && annotation.targetId === run.id,
  );

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground -ml-1.5">
          <Link href="/runs">
            <ArrowLeft aria-hidden />
            返回运行列表
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`运行 ${run.traceId}`}
        description={`${formatDateTime(run.startedAt)} 触发 · ${run.channel} · ${skill?.name ?? run.skillKey}`}
        meta={
          <>
            <StatusBadge status={run.status} />
            <TagBadge>{skill?.version ?? "未知版本"}</TagBadge>
            <TagBadge>渠道 {run.channel}</TagBadge>
            {ticket ? <TagBadge>工单 {ticket.code}</TagBadge> : <TagBadge>无关联工单</TagBadge>}
          </>
        }
        actions={
          ticket ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/data/tickets`}>
                  <MessageSquare aria-hidden />
                  查看工单数据
                </Link>
              </Button>
              <TakeoverButton ticketId={ticket.id} status={ticket.status} size="sm" />
            </>
          ) : null
        }
      />

      <section aria-label="运行指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="端到端耗时" value={formatDuration(run.latencyMs)} icon={Timer} hint="从触达到给出回复" />
        <StatCard
          label="Token 用量"
          value={run.tokensIn + run.tokensOut}
          unit="tokens"
          icon={Bot}
          hint={`输入 ${run.tokensIn} / 输出 ${run.tokensOut}`}
        />
        <StatCard label="推理成本" value={formatMoney(run.costYuan)} icon={Coins} hint="按模型单价估算" />
        <StatCard label="Planner 步数" value={run.plannerSteps} unit="步" icon={Layers} hint={`工具调用 ${run.steps.length} 次`} />
        <StatCard
          label="重试次数"
          value={run.retries}
          unit="次"
          icon={RotateCcw}
          tone={run.retries > 0 ? "warning" : "default"}
          hint={run.retries > 0 ? "发生过工具超时或格式错误" : "一次通过"}
        />
        <StatCard
          label="用户满意度"
          value={run.satisfaction === null ? "未评" : `${run.satisfaction} 分`}
          icon={Star}
          hint={runRatings.length > 0 ? `${runRatings.length} 条人工评分` : "还没有人工评分"}
        />
      </section>

      {run.fallbackReason ? (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[12.5px] font-medium text-amber-900">触发了兜底策略</p>
          <p className="mt-0.5 text-[12px] text-amber-800">{run.fallbackReason}</p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="执行链路" description="按 Planner 决策顺序记录每一步动作；失败与跳过会显式标出">
            {run.steps.length === 0 ? (
              <EmptyState title="这次运行没有记录步骤" description="可能是在 Planner 直接回答的模式下完成，没有触发工具调用。" />
            ) : (
              <ol className="divide-y">
                {run.steps.map((step, index) => (
                  <li key={`${step.name}-${index}`} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="bg-muted text-muted-foreground tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-medium">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug">{step.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={step.status} />
                        {step.tool ? (
                          <TagBadge title="调用的工具">
                            <Wrench aria-hidden className="size-3" />
                            {step.tool}
                          </TagBadge>
                        ) : (
                          <span className="text-muted-foreground text-[10.5px]">无工具调用</span>
                        )}
                      </div>
                    </div>
                    <span className="tabular text-muted-foreground shrink-0 text-[11.5px]">{formatDuration(step.ms)}</span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          {ticket ? (
            <SectionCard
              title="关联工单"
              description="这次运行的会话上下文"
              action={
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
              }
            >
              <dl className="grid gap-x-4 gap-y-2 px-4 py-3 text-[12.5px] sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-[11px]">用户诉求</dt>
                  <dd className="mt-0.5 leading-relaxed">{ticket.summary}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[11px]">意图 / 渠道</dt>
                  <dd className="mt-0.5">
                    {ticket.intent} · {ticket.channel}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[11px]">SLA 截止</dt>
                  <dd className="mt-0.5 tabular">
                    {formatDateTime(ticket.slaDueAt)}（{formatRelative(ticket.slaDueAt)}）
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-[11px]">负责人</dt>
                  <dd className="mt-0.5">{ticket.assignee ?? "未分配（Agent 处理中）"}</dd>
                </div>
              </dl>
            </SectionCard>
          ) : null}

          <SectionCard title="人工评分" description="来自质检抽检与用户回访">
            {runRatings.length === 0 ? (
              <EmptyState
                icon={Star}
                title="还没有人工评分"
                description="质检可以对这次运行打 1–5 分，并在下方写入标注说明问题所在。"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">评分</TableHead>
                    <TableHead>维度</TableHead>
                    <TableHead>点评</TableHead>
                    <TableHead className="pr-4 text-right">质检人</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runRatings.map((rating) => (
                    <TableRow key={rating.id}>
                      <TableCell className="pl-4">
                        <Badge variant={rating.score >= 4 ? "success" : rating.score >= 3 ? "warning" : "danger"}>
                          {rating.score} 分
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[12px]">{rating.dimension}</TableCell>
                      <TableCell className="text-[12px] leading-relaxed">{rating.comment}</TableCell>
                      <TableCell className="pr-4 text-right text-[11.5px]">
                        {rating.reviewer}
                        <span className="text-muted-foreground block text-[10.5px]">{formatRelative(rating.createdAt)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="标注" description="坏案例会进入改进闭环，好案例会进入评测集">
            <AnnotationForm targetType="run" targetId={run.id} title="标注这次运行" />
            {runAnnotations.length === 0 ? (
              <div className="border-t">
                <EmptyState title="还没有标注" description="第一条标注会由你创建。" />
              </div>
            ) : (
              <ul className="border-t divide-y">
                {runAnnotations.map((annotation) => (
                  <li key={annotation.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={annotation.tag} />
                      <span className="text-muted-foreground ml-auto text-[10.5px]">
                        {annotation.author} · {formatRelative(annotation.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed">{annotation.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="调用摘要" description="便于复制到工单或复盘文档">
            <dl className="grid gap-y-1.5 px-4 py-3 text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Skill</dt>
                <dd className="font-mono text-[11.5px]">{run.skillKey}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">当前版本</dt>
                <dd className="font-mono text-[11.5px]">{skill?.version ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">触发时间</dt>
                <dd className="tabular text-[11.5px]">{formatDateTime(run.startedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Trace ID</dt>
                <dd className="font-mono text-[11.5px]">{run.traceId}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Token 合计</dt>
                <dd className="tabular text-[11.5px]">{run.tokensIn + run.tokensOut}</dd>
              </div>
            </dl>
            <div className="text-muted-foreground flex items-center gap-1 border-t px-4 py-2 text-[10.5px]">
              <Gauge aria-hidden className="size-3" />
              该运行已记录在 data/runs.json，可通过 API 复查
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
