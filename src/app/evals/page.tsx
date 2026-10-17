import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FlaskConical, Layers, PlayCircle, Target } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAbTests, getEvalBatches, getEvalCases } from "@/lib/data";
import { formatDateTime, formatPercent, formatRelative } from "@/lib/format";
import { ratio } from "@/lib/utils";
import type { EvalBatchV2 } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "评测与实验" };

/** 通过率分母排除 ERROR：与 /eval 的评分口径保持一致 */
function passRateOf(batch: EvalBatchV2): number {
  return ratio(batch.passed, batch.passed + batch.failed + batch.review);
}

function durationSecOf(batch: EvalBatchV2): number | null {
  if (!batch.startedAt || !batch.finishedAt) return null;
  return Math.max(0, Math.round((new Date(batch.finishedAt).getTime() - new Date(batch.startedAt).getTime()) / 1000));
}

export default async function EvalsPage() {
  // 与 /eval 同源：都读 eval-cases.json / eval-batch.json，不再有第二套评测存储
  const [cases, batches, abTests] = await Promise.all([getEvalCases(), getEvalBatches(), getAbTests()]);

  const enabledCases = cases.filter((item) => item.enabled);
  const completed = batches.filter((batch) => batch.status === "done");
  const latest = completed[0];
  const runningTests = abTests.filter((test) => test.status === "运行中");

  return (
    <div className="space-y-4">
      <PageHeader
        title="评测与实验"
        description="批次里只保留真实执行结果：每条用例都跑一次 Agent 主链路，再用同一个规则评分器评分。用例编辑与单条测试在「评测集」页面，数据完全同源。"
        meta={
          <>
            <Badge variant="outline">用例 {cases.length} 条</Badge>
            <Badge variant="success">启用 {enabledCases.length} 条</Badge>
            <Badge variant="outline">批次 {batches.length} 个</Badge>
            <Badge variant={runningTests.length > 0 ? "info" : "neutral"}>运行中实验 {runningTests.length}</Badge>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/eval">
                <FlaskConical aria-hidden />
                用例与批量评测
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/data/eval-cases">
                <Layers aria-hidden />
                查看用例数据
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="评测指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard
          label="启用用例"
          value={enabledCases.length}
          unit="条"
          icon={FlaskConical}
          hint={`共 ${cases.length} 条（含未启用）`}
        />
        <StatCard
          label="最新批次通过率"
          value={latest ? formatPercent(passRateOf(latest)) : "—"}
          icon={Target}
          tone={latest ? (passRateOf(latest) >= 0.8 ? "positive" : "warning") : "default"}
          hint={latest ? latest.name : "还没有跑完的批次"}
        />
        <StatCard
          label="最新批次耗时"
          value={latest ? (durationSecOf(latest) ?? "—") : "—"}
          unit={latest && durationSecOf(latest) !== null ? "s" : undefined}
          icon={Target}
          hint={latest ? `${latest.passed}/${latest.total} 通过，ERROR ${latest.errors}` : "等待第一条真实批次"}
        />
        <StatCard
          label="运行中 AB 实验"
          value={runningTests.length}
          unit="个"
          icon={PlayCircle}
          hint={runningTests.length > 0 ? "指标达标后可全量" : "暂无实验"}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard
            title="评测批次"
            description="按创建时间倒序；每条的 caseResults 都是当次真实运行的结果"
            contentClassName="border-t"
          >
            {batches.length === 0 ? (
              <EmptyState
                icon={FlaskConical}
                title="还没有评测批次"
                description="去「评测集」页面选择用例跑一批，结果会出现在这里。"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">批次</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">通过 / 总数</TableHead>
                    <TableHead className="text-right">FAIL</TableHead>
                    <TableHead className="text-right">ERROR</TableHead>
                    <TableHead className="text-right">耗时</TableHead>
                    <TableHead className="pr-4 text-right">完成时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => {
                    const duration = durationSecOf(batch);
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="pl-4">
                          <div className="flex flex-col">
                            <span className="text-[12px] font-medium">{batch.name}</span>
                            <span className="text-muted-foreground text-[10.5px]">
                              版本 {batch.versionLabel} · {batch.id}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={batch.status} />
                        </TableCell>
                        <TableCell className="tabular text-right text-[12px]">
                          {batch.passed}/{batch.total}
                        </TableCell>
                        <TableCell className="tabular text-right text-[12px]">{batch.failed}</TableCell>
                        <TableCell className="tabular text-right text-[12px]">{batch.errors}</TableCell>
                        <TableCell className="tabular text-muted-foreground text-right text-[11.5px]">
                          {duration === null ? "—" : `${duration}s`}
                        </TableCell>
                        <TableCell className="text-muted-foreground pr-4 text-right text-[11px] whitespace-nowrap">
                          {batch.finishedAt ? formatRelative(batch.finishedAt) : "未完成"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          <SectionCard
            title="评测用例"
            description="启用中的用例才会进入批次；未配置关键词/禁词/价格的用例不会被判 PASS"
            action={<span className="text-muted-foreground text-[11px]">共 {cases.length} 条</span>}
            contentClassName="border-t"
          >
            {cases.length === 0 ? (
              <EmptyState title="还没有评测用例" description="从运行记录里挑几条好/坏案例，转成用例。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">用例</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>难度</TableHead>
                    <TableHead>风控期望</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="pr-4 text-right">关键词</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((testCase) => (
                    <TableRow key={testCase.id}>
                      <TableCell className="pl-4">
                        <div className="flex flex-col">
                          <span className="text-[12px] font-medium">{testCase.name}</span>
                          <span className="text-muted-foreground max-w-[380px] line-clamp-1 text-[10.5px]">
                            {testCase.question}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[12px] whitespace-nowrap">{testCase.category}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            testCase.difficulty === "困难" ? "danger" : testCase.difficulty === "中等" ? "warning" : "neutral"
                          }
                        >
                          {testCase.difficulty}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11.5px]">
                        {testCase.expectRiskPassed ? "应放行" : "应拦截"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={testCase.enabled ? "启用" : "停用"} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {testCase.tags.slice(0, 2).map((tag) => (
                            <TagBadge key={tag}>{tag}</TagBadge>
                          ))}
                          <span className="text-muted-foreground tabular text-[11px]">
                            {testCase.expectedKeywords.length}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="跑一个批次" description="批次必须真实执行 Agent 主链路，去评测集页面发起">
            <div className="space-y-2.5 px-4 py-3">
              <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                第一段的「按用例 id 稳定散列模拟通过率」已下线：那种批次会在数据里写出没有真实执行的通过率。
                现在每个批次都会逐条调用 Agent，评分证据带 runId 可回查。
              </p>
              <Button asChild size="sm">
                <Link href="/eval">
                  <FlaskConical aria-hidden />
                  选择用例并运行
                </Link>
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="AB 实验"
            description="同一批流量跑两个版本，看指标差异"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/data/ab-tests">
                  数据
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            }
          >
            {abTests.length === 0 ? (
              <EmptyState title="还没有 AB 实验" description="把候选版本置成 B 组，配 50/50 流量即可开跑。" />
            ) : (
              <ul className="divide-y">
                {abTests.map((test) => (
                  <li key={test.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={test.status} />
                      {test.winner ? <Badge variant={test.winner === "持平" ? "neutral" : "success"}>胜出 {test.winner} 组</Badge> : null}
                      <span className="text-muted-foreground ml-auto text-[10.5px]">{test.samples} 样本</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug">{test.name}</p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-[10.5px]">
                      A {test.variantA} / B {test.variantB} · 流量 {test.trafficSplitA}%
                    </p>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11.5px]">
                      <span className="text-muted-foreground">
                        A：<span className="tabular text-foreground font-medium">{test.aValue}</span>
                      </span>
                      <span className="text-muted-foreground">
                        B：<span className="tabular text-foreground font-medium">{test.bValue}</span>
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[10.5px]">
                      指标 {test.metric} · 开始 {formatDateTime(test.startedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
