import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Coins,
  FlaskConical,
  HandHelping,
  Sparkles,
  Timer,
  TriangleAlert,
} from "lucide-react";

import { RunTrendChart } from "@/components/charts/run-trend-chart";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { PriorityBadge, StatusBadge, TagBadge } from "@/components/status-badge";
import { TakeoverButton } from "@/components/actions/takeover-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatRelative } from "@/lib/format";
import { isPastDue, requestNow } from "@/lib/now";
import { getOverview } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "运营总览" };

export default async function DashboardPage() {
  const now = requestNow();
  const overview = await getOverview(now);
  const { kpis, trend, queue, recentRuns, risks, skillHealth, latestBatches, activeImprovements, statusCounts } = overview;
  const total7d = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="运营总览"
        description="今天要盯的三件事：自动解决率有没有掉、待接管队列有没有积压、最新一轮评测有没有回归。"
        meta={
          <>
            <TagBadge>数据源 data/*.json</TagBadge>
            <TagBadge>7 日样本 {kpis.runs7d} 次</TagBadge>
            {kpis.openRisks > 0 ? (
              <Badge variant="danger">风险提醒 {kpis.openRisks} 条待处理</Badge>
            ) : (
              <Badge variant="success">暂无高优风险</Badge>
            )}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/runs">
                <Activity aria-hidden />
                查看全部运行
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/evals">
                <FlaskConical aria-hidden />
                打开评测
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="核心指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="今日运行"
          value={kpis.runsToday}
          unit="次"
          hint={`近 7 日累计 ${kpis.runs7d} 次`}
          icon={Activity}
        />
        <StatCard
          label="7 日自动解决率"
          value={formatPercent(kpis.autoResolveRate)}
          hint="成功完成且无需人工接管"
          icon={CircleCheck}
          tone="positive"
        />
        <StatCard
          label="中位响应耗时"
          value={formatDuration(kpis.medianLatencyMs)}
          hint="Planner 一次完整链路"
          icon={Timer}
        />
        <StatCard
          label="待接管工单"
          value={kpis.pendingHandoff}
          unit="条"
          hint={kpis.pendingHandoff > 0 ? "点击列表右侧「接管」转人工" : "队列已清空"}
          icon={HandHelping}
          tone={kpis.pendingHandoff > 0 ? "warning" : "default"}
        />
        <StatCard
          label="最新评测通过率"
          value={latestBatches.length > 0 ? formatPercent(kpis.evalPassRate) : "—"}
          hint={latestBatches[0] ? latestBatches[0].name : "还没有跑完的真实评测批次"}
          icon={FlaskConical}
        />
        <StatCard label="7 日推理成本" value={formatMoney(kpis.cost7d)} hint="按 token 单价估算" icon={Coins} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard
            title="运行量与成功率"
            description="近 14 天，柱状区域为每日运行量，折线为成功率"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/runs">
                  明细
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          >
            <RunTrendChart data={trend} />
          </SectionCard>

          <SectionCard
            title="最近运行"
            description="按开始时间倒序，点 trace 进入单次链路"
            action={
              <span className="text-muted-foreground text-[11px]">
                近 7 日 成功 {statusCounts["成功"] ?? 0} / 接管 {statusCounts["已接管"] ?? 0} / 失败{" "}
                {(statusCounts["失败"] ?? 0) + (statusCounts["超时"] ?? 0)}（共 {total7d} 次）
              </span>
            }
          >
            {recentRuns.length === 0 ? (
              <EmptyState title="还没有运行记录" description="Agent 被触发后，这里会按时间倒序展示每次运行的链路与成本。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">开始时间</TableHead>
                    <TableHead>Skill</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">耗时</TableHead>
                    <TableHead className="text-right">成本</TableHead>
                    <TableHead className="pr-4 text-right">Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="text-muted-foreground pl-4 text-[12px] whitespace-nowrap">
                        {formatDateTime(run.startedAt)}
                      </TableCell>
                      <TableCell className="font-mono text-[11.5px]">{run.skillKey}</TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="tabular text-right text-[12px]">{formatDuration(run.latencyMs)}</TableCell>
                      <TableCell className="tabular text-muted-foreground text-right text-[12px]">
                        {formatMoney(run.costYuan)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Link
                          href={`/runs/${run.id}`}
                          className="text-primary font-mono text-[11px] underline-offset-4 hover:underline"
                        >
                          {run.traceId}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="待接管队列"
            description="按优先级与 SLA 截止时间排序"
            action={
              <Badge variant={queue.length > 0 ? "warning" : "success"}>{queue.length} 条在处理</Badge>
            }
          >
            {queue.length === 0 ? (
              <EmptyState title="队列已清空" description="当前没有待处理或已升级的会话。新会话到达后会出现在这里。" />
            ) : (
              <ul className="divide-y">
                {queue.map((ticket) => {
                  const slaOverdue = isPastDue(ticket.slaDueAt, now) && ticket.status !== "已解决";
                  return (
                    <li key={ticket.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-muted-foreground font-mono text-[10.5px]">{ticket.code}</span>
                          <StatusBadge status={ticket.status} />
                          <PriorityBadge priority={ticket.priority} />
                          {slaOverdue ? <Badge variant="danger">SLA 超时</Badge> : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug">{ticket.summary}</p>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          {ticket.intent} · {ticket.channel} · 截止 {formatDateTime(ticket.slaDueAt)}
                        </p>
                      </div>
                      <TakeoverButton ticketId={ticket.id} status={ticket.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="风险提醒"
            description="物流异常、退款积压与高风险用户"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/data/logistics">查看数据</Link>
              </Button>
            }
          >
            {risks.length === 0 ? (
              <EmptyState title="没有需要关注的风险" description="物流轨迹、退款时效与用户风险标记都在正常范围内。" />
            ) : (
              <ul className="divide-y">
                {risks.map((risk) => (
                  <li key={risk.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={risk.severity === "高" ? "danger" : "warning"}>
                        <TriangleAlert aria-hidden />
                        {risk.kind}
                      </Badge>
                      <span className="text-muted-foreground ml-auto text-[10.5px]">严重度 {risk.severity}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug">{risk.title}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-[11px]">{risk.detail}</p>
                    <Link href={risk.href} className="text-primary mt-1 inline-block text-[11px] underline-offset-4 hover:underline">
                      去处理
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SectionCard
          title="Skill 健康度"
          description="近 7 日运行量、成功率与最近一次评测分"
          action={
            <Button asChild variant="ghost" size="xs">
              <Link href="/skills">
                管理 Skill
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        >
          {skillHealth.length === 0 ? (
            <EmptyState title="还没有配置 Skill" description="在 Skill 管理里新增能力定义后，健康度会在这里汇总。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Skill</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead className="text-right">7 日运行</TableHead>
                  <TableHead className="text-right">成功率</TableHead>
                  <TableHead className="text-right">P95 耗时</TableHead>
                  <TableHead className="pr-4 text-right">评测分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skillHealth.slice(0, 8).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4">
                      <div className="flex flex-col">
                        <span className="text-[12.5px] font-medium">{row.name}</span>
                        <span className="text-muted-foreground font-mono text-[10.5px]">{row.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{row.version}</TableCell>
                    <TableCell className="tabular text-right text-[12px]">{row.runs7d}</TableCell>
                    <TableCell
                      className={cn(
                        "tabular text-right text-[12px] font-medium",
                        row.runs7d === 0 ? "text-muted-foreground" : row.successRate >= 0.8 ? "text-emerald-700" : "text-amber-700",
                      )}
                    >
                      {row.runs7d === 0 ? "—" : formatPercent(row.successRate)}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground text-right text-[12px]">
                      {row.p95LatencyMs > 0 ? formatDuration(row.p95LatencyMs) : "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        {row.hasRegression ? <Badge variant="danger">回归</Badge> : null}
                        <span className="tabular text-[12px]">{row.evalScore === null ? "—" : row.evalScore}</span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="最新评测批次" description="上线前必须跑完的回归">
            {latestBatches.length === 0 ? (
              <EmptyState title="还没有完成的批次" description="在评测页选择一个 Skill 跑一批回归，结果会汇总到这里。" />
            ) : (
              <ul className="divide-y">
                {latestBatches.map((batch) => (
                  <li key={batch.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={batch.status} />
                      <span className="text-muted-foreground ml-auto text-[10.5px]">
                        {formatRelative(batch.finishedAt ?? batch.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12.5px]">{batch.name}</p>
                    <p className="text-muted-foreground tabular mt-0.5 text-[11px]">
                      通过 {batch.passed}/{batch.total} · FAIL {batch.failed} · ERROR {batch.errors}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="进行中的改进项"
            description="从 badcase 推进到上线"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/improvements">
                  <ClipboardList aria-hidden />
                  全部
                </Link>
              </Button>
            }
          >
            {activeImprovements.length === 0 ? (
              <EmptyState title="没有进行中的改进" description="在改进闭环里把高频 badcase 转成待排期的改进项。" />
            ) : (
              <ul className="divide-y">
                {activeImprovements.map((item) => (
                  <li key={item.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <PriorityBadge priority={item.priority} />
                      <StatusBadge status={item.status} />
                      <span className="text-muted-foreground ml-auto text-[10.5px]">{item.owner}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug">{item.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      预期收益 {item.expectedGain} · 截止 {formatDateTime(item.dueAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <Sparkles aria-hidden className="size-3" />
          数据来自服务端 JSON 存储，页面每次请求实时计算
        </span>
        <span>·</span>
        <span>生成时间 {formatDateTime(now)}</span>
      </div>
    </div>
  );
}
