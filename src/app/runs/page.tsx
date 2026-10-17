import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ListFilter, Search, X } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAgentRuns } from "@/lib/agent/run-store";
import { getRuns, getSkills } from "@/lib/data";
import { formatDateTime, formatDuration, formatMoney, formatRelative } from "@/lib/format";
import { RUN_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "运行记录" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

export default async function RunsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = pick(params.status);
  const skillKey = pick(params.skill);
  const keyword = pick(params.q);

  const [runs, skills, agentRuns] = await Promise.all([getRuns(), getSkills(), listAgentRuns(8)]);
  const skillName = new Map(skills.map((skill) => [skill.id, skill.name]));

  const filtered = runs
    .filter((run) => {
      if (status && run.status !== status) return false;
      if (skillKey && run.skillKey !== skillKey) return false;
      if (keyword) {
        const haystack = [run.traceId, run.ticketId ?? "", run.skillKey, run.fallbackReason ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(keyword.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  const failedCount = filtered.filter((run) => run.status === "失败" || run.status === "超时").length;
  const handoffCount = filtered.filter((run) => run.status === "已接管").length;
  const costTotal = filtered.reduce((total, run) => total + run.costYuan, 0);
  const hasFilters = Boolean(status || skillKey || keyword);

  return (
    <div className="space-y-4">
      <PageHeader
        title="运行记录"
        description="每一次 Agent 触发都会留下 trace：Planner 拆了几步、调了哪些工具、花了多少 token、最后是解决还是转人工。"
        meta={
          <>
            <Badge variant="outline">共 {runs.length} 条</Badge>
            <Badge variant="outline">筛选后 {filtered.length} 条</Badge>
            <Badge variant={failedCount > 0 ? "danger" : "success"}>失败/超时 {failedCount}</Badge>
            <Badge variant={handoffCount > 0 ? "warning" : "neutral"}>人工接管 {handoffCount}</Badge>
            <Badge variant="outline">成本合计 {formatMoney(costTotal)}</Badge>
          </>
        }
      />

      <SectionCard
        title="Agent 运行（主链路）"
        description="工作台 / 演示页产生的 RunRecord：带 Plan、Trace 与风险结果；下面是第一段的历史运行记录"
        action={
          <Button asChild variant="ghost" size="xs">
            <Link href="/">去工作台</Link>
          </Button>
        }
        contentClassName="border-t"
      >
        {agentRuns.items.length === 0 ? (
          <EmptyState
            title="还没有 Agent 运行记录"
            description="到工作台输入一个真实问题，跑完后这里会出现带完整 Trace 的记录。"
            action={
              <Button asChild size="sm" variant="outline">
                <Link href="/">打开工作台</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">问题</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>风险</TableHead>
                <TableHead className="pr-4 text-right">耗时</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentRuns.items.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="pl-4">
                    <Link href={`/runs/${run.id}`} className="line-clamp-2 max-w-[420px] text-[12.5px] leading-snug hover:underline">
                      {run.question}
                    </Link>
                    <span className="text-muted-foreground font-mono text-[10px]">{run.id}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-[11.5px]">{run.source}</TableCell>
                  <TableCell className="tabular text-[11.5px]">
                    {run.plan ? `${run.plan.selectedSkills.length}S / ${run.plan.selectedTools.length}T` : "—"}
                  </TableCell>
                  <TableCell>
                    {run.riskResult ? <StatusBadge status={run.riskResult.verdict} /> : <span className="text-muted-foreground text-[11px]">—</span>}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground pr-4 text-right text-[11.5px]">
                    {run.durationMs} ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard
        title="筛选条件"
        description="筛选条件会写入 URL，刷新或分享链接都能复现同一个视图"
      >
        <div className="flex flex-col gap-2 px-4 pb-4">
          <form action="/runs" className="flex flex-wrap items-center gap-2">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {skillKey ? <input type="hidden" name="skill" value={skillKey} /> : null}
            <div className="relative min-w-[220px] flex-1">
              <Search aria-hidden className="text-muted-foreground/70 absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                name="q"
                defaultValue={keyword ?? ""}
                placeholder="搜索 trace id、工单 id 或降级原因"
                className="h-8 pl-8 text-[12.5px]"
                aria-label="搜索运行记录"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              <ListFilter aria-hidden />
              应用筛选
            </Button>
            {hasFilters ? (
              <Button asChild size="sm" variant="ghost">
                <Link href="/runs">
                  <X aria-hidden />
                  清除筛选
                </Link>
              </Button>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[11px]">快速筛选</span>
            <FilterSelect
              param="status"
              value={status}
              placeholder="全部状态"
              ariaLabel="按状态筛选"
              options={RUN_STATUSES.map((value) => ({ value, label: value }))}
            />
            <FilterSelect
              param="skill"
              value={skillKey}
              placeholder="全部 Skill"
              ariaLabel="按 Skill 筛选"
              options={skills.map((skill) => ({ value: skill.id, label: skill.name }))}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="运行列表"
        description="点右侧 trace 进入单次链路的步骤、评分与标注"
        contentClassName="border-t"
      >
        {filtered.length === 0 ? (
          <EmptyState
            title={hasFilters ? "当前筛选没有匹配的运行" : "还没有运行记录"}
            description={
              hasFilters
                ? "换一个状态或 Skill 试试，或者清除筛选查看全部数据。"
                : "Agent 还没有被触发。可以在评测页跑一个批次，或接管一条工单来产生数据。"
            }
            action={
              hasFilters ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/runs">清除筛选</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">开始时间</TableHead>
                <TableHead>Trace</TableHead>
                <TableHead>Skill</TableHead>
                <TableHead>渠道</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">计划步数</TableHead>
                <TableHead className="text-right">耗时</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">成本</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-muted-foreground pl-4 text-[12px] whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>{formatDateTime(run.startedAt)}</span>
                      <span className="text-[10.5px]">{formatRelative(run.startedAt)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/runs/${run.id}`}
                      className="text-primary font-mono text-[11px] underline-offset-4 hover:underline"
                    >
                      {run.traceId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[12px]">
                    <div className="flex flex-col">
                      <span>{skillName.get(run.skillKey) ?? run.skillKey}</span>
                      <span className="text-muted-foreground font-mono text-[10.5px]">{run.skillKey}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px]">{run.channel}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="tabular text-right text-[12px]">{run.plannerSteps}</TableCell>
                  <TableCell
                    className={cn(
                      "tabular text-right text-[12px]",
                      run.latencyMs > 8000 ? "text-amber-700" : "text-foreground",
                    )}
                  >
                    {formatDuration(run.latencyMs)}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground text-right text-[11.5px]">
                    {run.tokensIn + run.tokensOut}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground text-right text-[11.5px]">
                    {formatMoney(run.costYuan)}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Button asChild variant="ghost" size="xs">
                      <Link href={`/runs/${run.id}`}>
                        详情
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
