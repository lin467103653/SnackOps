import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Clock3, Rocket } from "lucide-react";

import { ImprovementForm } from "@/components/actions/improvement-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { PriorityBadge, StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getImprovements, getSkills } from "@/lib/data";
import { formatDate, formatRelative } from "@/lib/format";
import { isPastDue, requestNow } from "@/lib/now";
import { countBy } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "改进闭环" };

const SOURCE_LABEL: Record<string, string> = {
  badcase: "badcase 回流",
  rating: "人工评分",
  annotation: "标注",
  eval: "评测失败",
};

const PRIORITY_WEIGHT: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
const STATUS_WEIGHT: Record<string, number> = { 进行中: 0, 已排期: 1, 待评估: 2, 已上线: 3, 已驳回: 4 };

export default async function ImprovementsPage() {
  const now = requestNow();
  const [improvements, skills] = await Promise.all([getImprovements(), getSkills()]);
  const skillName = new Map(skills.map((skill) => [skill.id, skill.name]));
  const statusCounts = countBy(improvements, (item) => item.status);

  const isOpenOverdue = (item: (typeof improvements)[number]) =>
    isPastDue(item.dueAt, now) && item.status !== "已上线" && item.status !== "已驳回";

  const sorted = [...improvements].sort((a, b) => {
    const byStatus = (STATUS_WEIGHT[a.status] ?? 9) - (STATUS_WEIGHT[b.status] ?? 9);
    if (byStatus !== 0) return byStatus;
    const byPriority = (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9);
    if (byPriority !== 0) return byPriority;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  const overdue = improvements.filter(isOpenOverdue);

  return (
    <div className="space-y-4">
      <PageHeader
        title="改进闭环"
        description="每条 badcase 都要有去处：待评估 → 已排期 → 进行中 → 已上线。没有闭环的标注等于没标。"
        meta={
          <>
            <Badge variant="outline">共 {improvements.length} 项</Badge>
            <Badge variant="warning">待评估 {statusCounts["待评估"] ?? 0}</Badge>
            <Badge variant="info">进行中 {statusCounts["进行中"] ?? 0}</Badge>
            <Badge variant="success">已上线 {statusCounts["已上线"] ?? 0}</Badge>
            {overdue.length > 0 ? <Badge variant="danger">逾期 {overdue.length}</Badge> : null}
          </>
        }
      />

      <section aria-label="改进指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="待评估" value={statusCounts["待评估"] ?? 0} unit="项" icon={ClipboardList} hint="等运营确认价值" />
        <StatCard label="已排期" value={statusCounts["已排期"] ?? 0} unit="项" icon={Clock3} hint="已进迭代计划" />
        <StatCard
          label="进行中"
          value={statusCounts["进行中"] ?? 0}
          unit="项"
          icon={Rocket}
          tone={overdue.length > 0 ? "warning" : "default"}
          hint={overdue.length > 0 ? `${overdue.length} 项已逾期` : "进度正常"}
        />
        <StatCard label="已上线" value={statusCounts["已上线"] ?? 0} unit="项" icon={CheckCircle2} tone="positive" hint="已合入线上版本" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SectionCard title="改进项列表" description="按状态、优先级与截止时间排序" contentClassName="border-t">
          {sorted.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="还没有改进项"
              description="从运行详情的标注、或右侧表单创建第一条改进项，开始闭环。"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">改进项</TableHead>
                  <TableHead>Skill</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>负责人</TableHead>
                  <TableHead className="pr-4 text-right">截止</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((item) => {
                  const isOverdue = isOpenOverdue(item);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="pl-4">
                        <div className="flex flex-col">
                          <span className="text-[12.5px] font-medium">{item.title}</span>
                          <span className="text-muted-foreground text-[10.5px]">
                            {SOURCE_LABEL[item.source] ?? item.source} · 预期 {item.expectedGain}
                          </span>
                          {item.linkedRuns.length > 0 ? (
                            <span className="text-muted-foreground/80 mt-0.5 flex flex-wrap gap-1 font-mono text-[10px]">
                              {item.linkedRuns.slice(0, 2).map((runId) => (
                                <Link key={runId} href={`/runs/${runId}`} className="text-primary underline-offset-4 hover:underline">
                                  {runId}
                                </Link>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11.5px] whitespace-nowrap">
                        {skillName.get(item.skillKey) ?? item.skillKey}
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={item.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap">{item.owner}</TableCell>
                      <TableCell className="pr-4 text-right text-[11px] whitespace-nowrap">
                        <span className={isOverdue ? "font-medium text-rose-700" : "text-muted-foreground"}>
                          {formatDate(item.dueAt)}
                        </span>
                        <span className="text-muted-foreground block text-[10px]">
                          {isOverdue ? "已逾期" : formatRelative(item.dueAt)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="新建改进项" description="把 badcase / 评分 / 标注转成可排期的动作">
            {skills.length === 0 ? (
              <EmptyState title="还没有 Skill" description="先建一个 Skill，改进项需要挂在能力上。" />
            ) : (
              <ImprovementForm skills={skills.map((skill) => ({ id: skill.id, name: skill.name }))} />
            )}
          </SectionCard>

          <SectionCard title="流转说明" description="当前版本只做状态展示，流转在后续版本接入审批">
            <ol className="space-y-2 px-4 py-3 text-[12px]">
              {[
                { title: "待评估", detail: "运营确认价值与影响面，决定是否排期" },
                { title: "已排期", detail: "进入迭代计划，明确负责人与截止时间" },
                { title: "进行中", detail: "改 Skill / 改工具 / 补知识，同步跑评测" },
                { title: "已上线", detail: "线上灰度后全量，回归指标回填到批次" },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-2">
                  <span className="bg-muted text-muted-foreground tabular mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t px-4 py-2">
              <Button asChild variant="ghost" size="xs">
                <Link href="/evals">去评测页跑回归</Link>
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
        <TagBadge>数据源 improvements.json</TagBadge>
        <span>改进项写入使用文件锁 + 原子 rename，不会写坏上一份数据。</span>
      </div>
    </div>
  );
}
