import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  ClipboardList,
  Download,
  FlaskConical,
  ShieldAlert,
  Sparkles,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";

import { AbTestForm, AnnotationActions, CreateImprovementButton, ImprovementActions, RatingForm } from "@/components/actions/ops-actions";
import { RollbackPanel } from "@/components/actions/rollback-panel";
import { PageHeader } from "@/components/page-header";
import { OpsTabs } from "@/components/ops/ops-tabs";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAbTests, getAgentRuns, getAnnotations, getImprovements, getRatings } from "@/lib/data";
import { diffLines } from "@/lib/diff";
import { requestNow } from "@/lib/now";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { buildClusters } from "@/lib/ops/clusters";
import { listSkills } from "@/lib/skills/registry";
import { listVersions } from "@/lib/skills/versions";
import { readVersions } from "@/lib/skills/versions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "运营中心" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface Loaded<T> {
  ok: boolean;
  data: T;
  error: string | null;
}

async function safeLoad<T>(task: () => Promise<T>, fallback: T): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await task(), error: null };
  } catch (error) {
    return { ok: false, data: fallback, error: error instanceof Error ? error.message : "加载失败" };
  }
}

function pick(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function ErrorLine({ label, error }: { label: string; error: string }) {
  return (
    <p className="flex items-start gap-1.5 px-4 py-2 text-[11.5px] text-rose-700">
      <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">
        {label}加载失败：{error}（其他区块不受影响）
      </span>
    </p>
  );
}

export default async function OpsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const scoreFilter = pick(params.score) ?? "all";
  const intentFilter = pick(params.intent) ?? "all";
  const daysFilter = pick(params.days) ?? "30";
  const annStatus = pick(params.annStatus) ?? "all";

  const [runsLoad, ratingsLoad, annotationsLoad, improvementsLoad, abLoad, skillsLoad, versionsLoad] = await Promise.all([
    safeLoad(() => getAgentRuns(), [] as Awaited<ReturnType<typeof getAgentRuns>>),
    safeLoad(() => getRatings(), [] as Awaited<ReturnType<typeof getRatings>>),
    safeLoad(() => getAnnotations(), [] as Awaited<ReturnType<typeof getAnnotations>>),
    safeLoad(() => getImprovements(), [] as Awaited<ReturnType<typeof getImprovements>>),
    safeLoad(() => getAbTests(), [] as Awaited<ReturnType<typeof getAbTests>>),
    safeLoad(() => listSkills(), [] as Awaited<ReturnType<typeof listSkills>>),
    safeLoad(() => readVersions(), [] as Awaited<ReturnType<typeof readVersions>>),
  ]);

  const runs = runsLoad.data;
  const ratings = ratingsLoad.data;
  const annotations = annotationsLoad.data;
  const improvements = improvementsLoad.data;
  const abTests = abLoad.data;
  const skills = skillsLoad.data;
  const versions = versionsLoad.data;

  // ---------------- 运行监控 ----------------
  const total = runs.length;
  const successCount = runs.filter((run) => run.status === "success").length;
  const blockedCount = runs.filter((run) => run.status === "blocked").length;
  const failedCount = runs.filter((run) => run.status === "failed").length;
  const handoffCount = runs.filter((run) => run.status === "handoff" || run.handoff).length;
  const avgDuration = total > 0 ? Math.round(runs.reduce((sum, run) => sum + run.durationMs, 0) / total) : 0;
  const failedSteps = runs.flatMap((run) =>
    run.steps.filter((step) => step.status === "error" || step.status === "timeout").map((step) => ({ run, step })),
  );
  const riskDistribution = runs.reduce<Record<string, number>>((acc, run) => {
    const key = run.riskResult?.verdict ?? "未审查";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const recentRuns = [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  // ---------------- 评分筛选 ----------------
  const days = daysFilter === "all" ? Infinity : Number(daysFilter) || 30;
  const cutoff = requestNow().getTime() - days * 86_400_000;
  const ratingIntents = Array.from(new Set(ratings.map((rating) => rating.intent ?? "未分类"))).slice(0, 8);

  const filteredRatings = ratings
    .filter((rating) => (scoreFilter === "low" ? rating.score <= 2 : scoreFilter === "high" ? rating.score >= 4 : true))
    .filter((rating) => (intentFilter === "all" ? true : (rating.intent ?? "未分类") === intentFilter))
    .filter((rating) => new Date(rating.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  const filteredAnnotations = annotations
    .filter((annotation) => (annStatus === "all" ? true : annotation.status === annStatus))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);

  // ---------------- 版本回滚初始数据 ----------------
  const firstSkill = skills[0];
  const firstVersions = firstSkill ? await listVersions(firstSkill.id) : [];
  const initialRollback = {
    skillId: firstSkill?.id ?? "",
    versions: firstVersions.map((version) => ({
      version: version.version,
      changeNote: version.changeNote,
      createdAt: version.createdAt,
      author: version.author,
      hash: version.hash,
      auto: version.auto,
    })),
  };
  // ---------------- 规则聚类 ----------------
  const clusters = buildClusters({ runs, ratings, annotations, improvements });
  const versionByHash = new Map(
    versions.map((version) => [`${version.skillId}:${version.version}`, version.content] as const),
  );

  const draftDiff = (improvement: (typeof improvements)[number]) => {
    if (!improvement.draft) return null;
    const base = versionByHash.get(`${improvement.draft.skillId}:${improvement.draft.baseVersion}`);
    if (base === undefined) return null;
    const result = diffLines(base, improvement.draft.content);
    return { added: result.added, removed: result.removed, text: result.text.split("\n").slice(0, 80).join("\n") };
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="运营中心"
        description="从运行结果发现问题 → 评分 / 标注 → 沉淀评测用例 → 生成改进建议 → 确认后应用、回滚。每一步都落在服务端数据上。"
        meta={
          <>
            <Badge variant="outline">运行 {total}</Badge>
            <Badge variant="outline">评分 {ratings.length}</Badge>
            <Badge variant="outline">标注 {annotations.length}</Badge>
            <Badge variant="outline">改进项 {improvements.length}</Badge>
            <Badge variant="outline">规则聚类 {clusters.length}</Badge>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/api/annotations/export?format=json" target="_blank">
                <Download aria-hidden />
                导出标注 JSON
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/api/annotations/export?format=csv">
                <Download aria-hidden />
                导出 CSV
              </Link>
            </Button>
          </>
        }
      />

      <OpsTabs
        tabs={[
          { id: "monitor", label: "运行监控", content: (
            <>
              {/* ---------------- 一、运行监控 ---------------- */}
              <section aria-label="运行监控" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="运行总数" value={total} unit="次" icon={Activity} hint={`近 ${runs.length} 条 RunRecord`} />
                <StatCard
                  label="成功率"
                  value={total > 0 ? formatPercent(successCount / total) : "—"}
                  icon={ClipboardList}
                  tone="positive"
                  hint={`成功 ${successCount} · 阻断 ${blockedCount} · 失败 ${failedCount}`}
                />
                <StatCard label="平均耗时" value={formatDuration(avgDuration)} icon={Timer} hint="Plan → 回复" />
                <StatCard
                  label="失败步骤"
                  value={failedSteps.length}
                  unit="步"
                  icon={TriangleAlert}
                  tone={failedSteps.length > 0 ? "danger" : "positive"}
                  hint={failedSteps.length > 0 ? failedSteps[0]!.step.name : "没有失败步骤"}
                />
                <StatCard
                  label="人工接管率"
                  value={total > 0 ? formatPercent(handoffCount / total) : "—"}
                  icon={Users}
                  hint={`接管 ${handoffCount} 条`}
                />
                <StatCard
                  label="风险分布"
                  value={`${riskDistribution.allow ?? 0} / ${riskDistribution.block ?? 0}`}
                  icon={ShieldAlert}
                  tone={(riskDistribution.block ?? 0) > 0 ? "warning" : "default"}
                  hint={`允许 / 阻断 · 跳过 ${riskDistribution.skipped ?? 0}`}
                />
              </section>

              <SectionCard
                title="最近运行"
                description="点开任意一条进入 Trace；失败/阻断会标在状态列"
                action={
                  <Button asChild variant="ghost" size="xs">
                    <Link href="/runs">
                      全部运行
                      <ArrowUpRight aria-hidden />
                    </Link>
                  </Button>
                }
                contentClassName="border-t"
              >
                {runsLoad.error ? <ErrorLine label="运行记录" error={runsLoad.error} /> : null}
                {recentRuns.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-3 text-[11.5px]">还没有运行记录。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">问题</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>风险</TableHead>
                        <TableHead className="text-right">耗时</TableHead>
                        <TableHead className="pr-4 text-right">时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentRuns.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="pl-4">
                            <Link href={`/runs/${run.id}`} className="line-clamp-1 max-w-[420px] text-[12.5px] hover:underline">
                              {run.question}
                            </Link>
                            <span className="text-muted-foreground font-mono text-[10px]">{run.id}</span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>{run.riskResult ? <StatusBadge status={run.riskResult.verdict} /> : "—"}</TableCell>
                          <TableCell className="tabular text-muted-foreground text-right text-[11.5px]">{run.durationMs} ms</TableCell>
                          <TableCell className="text-muted-foreground pr-4 text-right text-[11px]">{formatDateTime(run.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </SectionCard>

            </>
          ) },
          { id: "rating", label: "服务评分", content: (
            <>
              {/* ---------------- 二、服务评分 ---------------- */}
              <SectionCard
                title="服务评分"
                description="记录用户/运营对回复的评分；≤2 分自动进入坏案例池"
                action={<Badge variant="outline">{filteredRatings.length} 条</Badge>}
              >
                {ratingsLoad.error ? <ErrorLine label="评分" error={ratingsLoad.error} /> : null}
                <RatingForm
                  runs={[...runs]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 12)
                    .map((run) => ({ id: run.id, question: run.question }))}
                />

                <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
                  <span className="text-muted-foreground text-[11px]">筛选</span>
                  {[
                    { key: "score", value: "all", label: "全部评分" },
                    { key: "score", value: "low", label: "低分（≤2）" },
                    { key: "score", value: "high", label: "高分（≥4）" },
                  ].map((option) => (
                    <Link
                      key={option.value}
                      href={`/ops?score=${option.value}&intent=${intentFilter}&days=${daysFilter}`}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px]",
                        scoreFilter === option.value ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]" : "border-border text-muted-foreground",
                      )}
                    >
                      {option.label}
                    </Link>
                  ))}
                  <span className="text-muted-foreground ml-2 text-[11px]">时间</span>
                  {[
                    { value: "7", label: "7 天" },
                    { value: "30", label: "30 天" },
                    { value: "all", label: "全部" },
                  ].map((option) => (
                    <Link
                      key={option.value}
                      href={`/ops?score=${scoreFilter}&intent=${intentFilter}&days=${option.value}`}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px]",
                        daysFilter === option.value ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]" : "border-border text-muted-foreground",
                      )}
                    >
                      {option.label}
                    </Link>
                  ))}
                  {ratingIntents.length > 0 ? <span className="text-muted-foreground ml-2 text-[11px]">问题类型</span> : null}
                  {ratingIntents.map((intent) => (
                    <Link
                      key={intent}
                      href={`/ops?score=${scoreFilter}&intent=${encodeURIComponent(intent)}&days=${daysFilter}`}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px]",
                        intentFilter === intent ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]" : "border-border text-muted-foreground",
                      )}
                    >
                      {intent}
                    </Link>
                  ))}
                </div>

                {filteredRatings.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-3 text-[11.5px]">当前筛选下没有评分。换个条件，或在上方录入一条。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">问答对</TableHead>
                        <TableHead>评分</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>关联</TableHead>
                        <TableHead className="pr-4 text-right">时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRatings.map((rating) => (
                        <TableRow key={rating.id}>
                          <TableCell className="pl-4">
                            <p className="line-clamp-1 max-w-[420px] text-[12.5px]">{rating.question ?? "（未保存问题）"}</p>
                            <p className="text-muted-foreground line-clamp-1 max-w-[420px] text-[11px]">{rating.comment}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={rating.score <= 2 ? "danger" : rating.score >= 4 ? "success" : "warning"}>{rating.score} 分</Badge>
                          </TableCell>
                          <TableCell className="text-[11.5px]">{rating.intent ?? "未分类"}</TableCell>
                          <TableCell className="text-[11px]">
                            <Link href={`/runs/${rating.runId}`} className="text-primary font-mono text-[10.5px] underline-offset-4 hover:underline">
                              {rating.runId.slice(-8)}
                            </Link>
                            {rating.routedTo ? (
                              <span className="text-muted-foreground ml-1">· 已入坏案例池</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground pr-4 text-right text-[11px]">{formatDateTime(rating.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </SectionCard>

            </>
          ) },
          { id: "annotation", label: "数据标注", content: (
            <>
              {/* ---------------- 三、数据标注 ---------------- */}
              <SectionCard
                title="数据标注"
                description="接受/驳回、沉淀为评测用例或转成改进项；导出用于离线分析"
                action={
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { value: "all", label: "全部" },
                      { value: "pending", label: "pending" },
                      { value: "accepted", label: "accepted" },
                      { value: "rejected", label: "rejected" },
                    ].map((option) => (
                      <Link
                        key={option.value}
                        href={`/ops?score=${scoreFilter}&intent=${intentFilter}&days=${daysFilter}&annStatus=${option.value}`}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px]",
                          annStatus === option.value ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]" : "border-border text-muted-foreground",
                        )}
                      >
                        {option.label}
                      </Link>
                    ))}
                  </div>
                }
                contentClassName="border-t"
              >
                {annotationsLoad.error ? <ErrorLine label="标注" error={annotationsLoad.error} /> : null}
                {filteredAnnotations.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-3 text-[11.5px]">当前状态下没有标注。到运行详情页给一条 Run 写标注试试。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">标注</TableHead>
                        <TableHead>来源 / 目标</TableHead>
                        <TableHead>维度</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="pr-4 text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAnnotations.map((annotation) => (
                        <TableRow key={annotation.id}>
                          <TableCell className="pl-4">
                            <div className="flex flex-wrap items-center gap-1">
                              <StatusBadge status={annotation.tag} />
                              {annotation.evalCaseId ? <Badge variant="info">已沉淀用例</Badge> : null}
                              {annotation.improvementId ? <Badge variant="info">已转改进</Badge> : null}
                            </div>
                            <p className="mt-0.5 line-clamp-2 max-w-[360px] text-[12px] leading-snug">{annotation.note}</p>
                            <p className="text-muted-foreground text-[10.5px]">
                              {annotation.author} · {formatDateTime(annotation.createdAt)}
                            </p>
                          </TableCell>
                          <TableCell className="text-[11px]">
                            <TagBadge>{annotation.source}</TagBadge>
                            <Link href={`/runs/${annotation.targetId}`} className="text-primary ml-1 font-mono text-[10px] underline-offset-4 hover:underline">
                              {annotation.targetId.slice(-8)}
                            </Link>
                          </TableCell>
                          <TableCell className="text-[10.5px]">
                            {annotation.dimensions
                              ? Object.entries(annotation.dimensions)
                                  .filter(([, value]) => typeof value === "number")
                                  .map(([key, value]) => `${key} ${value}`)
                                  .join(" · ") || "—"
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={annotation.status} />
                          </TableCell>
                          <TableCell className="pr-4">
                            <AnnotationActions
                              annotationId={annotation.id}
                              status={annotation.status}
                              converted={Boolean(annotation.evalCaseId || annotation.improvementId)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </SectionCard>

            </>
          ) },
          { id: "improvement", label: "改进建议", content: (
            <>
              {/* ---------------- 四、改进建议 ---------------- */}
              <SectionCard
                title="规则聚类 → 改进建议"
                description="确定性规则聚类（不是 LLM 分析）：R1 风险拦截 / R2 工具失败 / R3 计划被阻断 / R4 低分回复 / R5 知识缺口"
                action={<Badge variant="outline">{clusters.length} 组</Badge>}
                contentClassName="border-t"
              >
                {improvementsLoad.error ? <ErrorLine label="改进项" error={improvementsLoad.error} /> : null}
                {clusters.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-3 text-[11.5px]">
                    当前没有命中任何聚类规则。先制造一条失败运行或低分评分，再回来看看。
                  </p>
                ) : (
                  <ul className="divide-y">
                    {clusters.map((cluster) => (
                      <li key={cluster.key} className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant={cluster.priority === "P0" ? "danger" : "warning"}>{cluster.priority}</Badge>
                          <TagBadge>{cluster.rule}</TagBadge>
                          <Badge variant="outline">方向 {cluster.direction}</Badge>
                          <span className="text-muted-foreground text-[10.5px]">样本 {cluster.sampleCount}</span>
                          <span className="ml-auto">
                            <CreateImprovementButton rule={cluster.rule} disabled={Boolean(cluster.existingImprovementId)} />
                          </span>
                        </div>
                        <p className="mt-1 text-[12.5px] leading-snug">{cluster.label}</p>
                        <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{cluster.detail}</p>
                        {cluster.samples.length > 0 ? (
                          <ul className="text-muted-foreground mt-1 space-y-0.5 text-[10.5px]">
                            {cluster.samples.map((sample) => (
                              <li key={sample.runId} className="truncate">
                                · {sample.question}（{sample.score ?? "未评分"}）
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="改进项与 Prompt 草案"
                description="草案只写进改进项，不会自动覆盖生产 Prompt；应用前会自动留版本快照"
                contentClassName="border-t"
              >
                {improvements.length === 0 ? (
                  <p className="text-muted-foreground px-4 py-3 text-[11.5px]">还没有改进项。</p>
                ) : (
                  <ul className="divide-y">
                    {improvements.slice(0, 12).map((improvement) => {
                      const diff = draftDiff(improvement);
                      return (
                        <li key={improvement.id} className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <TagBadge>{improvement.direction}</TagBadge>
                            <StatusBadge status={improvement.status} />
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {improvement.skillKey}
                            </Badge>
                            <span className="text-muted-foreground text-[10.5px]">
                              {improvement.cluster?.rule ?? improvement.source}
                            </span>
                            {improvement.appliedVersion ? (
                              <Badge variant="success">已应用到 v{improvement.appliedVersion}</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[12.5px] leading-snug">{improvement.title}</p>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            预期：{improvement.expectedGain} · 负责人 {improvement.owner} · 截止 {formatDateTime(improvement.dueAt)}
                          </p>

                          <div className="mt-1.5">
                            <ImprovementActions
                              improvementId={improvement.id}
                              draftStatus={improvement.draft?.status ?? null}
                              applied={Boolean(improvement.appliedVersion)}
                            />
                          </div>

                          {improvement.draft ? (
                            <details className="mt-1.5">
                              <summary className="text-muted-foreground cursor-pointer text-[10.5px] select-none">
                                预览草案 diff
                                {diff ? `（+${diff.added} / −${diff.removed} 行）` : "（找不到基线版本，仅显示正文）"}
                              </summary>
                              <pre className="scroll-area-thin mt-1 max-h-[240px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
                                {diff?.text ?? improvement.draft.content}
                              </pre>
                            </details>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

            </>
          ) },
          { id: "rollback", label: "版本回滚", content: (
            <>
                <SectionCard title="版本回滚（默认入口）" description="选 Skill → 选历史版本 → 二次确认回滚；回滚会先给当前正文留档">
                  <RollbackPanel
                    skills={skills.map((skill) => ({ id: skill.id, name: skill.name, version: skill.version }))}
                    initial={initialRollback}
                  />
                </SectionCard>
            </>
          ) },
          { id: "labs", label: "实验与其他", content: (
            <>
              {/* ---------------- 五、其他运营能力 ---------------- */}
              <div className="grid gap-3 lg:grid-cols-2">
                <SectionCard title="Prompt A/B 实验" description="登记实验与结论（本版本不做真实流量分流）" contentClassName="border-t">
                  <AbTestForm skills={skills.map((skill) => ({ id: skill.id, name: skill.name, version: skill.version }))} />
                  {abTests.length === 0 ? (
                    <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">还没有实验。</p>
                  ) : (
                    <ul className="divide-y border-t">
                      {abTests.slice(0, 5).map((test) => (
                        <li key={test.id} className="px-4 py-2 text-[11.5px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={test.status} />
                            <span className="min-w-0 flex-1 truncate">{test.name}</span>
                            {test.winner ? <Badge variant="success">胜出 {test.winner}</Badge> : null}
                          </div>
                          <p className="text-muted-foreground mt-0.5 font-mono text-[10.5px]">
                            A {test.variantA} / B {test.variantB} · {test.trafficSplitA}% 流量
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>

                <SectionCard title="其他入口" description="人工评估、版本回滚、评测集与改进记录">
                  <div className="flex flex-col gap-1.5 px-4 py-3">
                    <Button asChild variant="outline" size="sm" className="justify-start">
                      <Link href="/runs">
                        <Users aria-hidden />
                        人工评估（运行详情里评分 / 标注）
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="justify-start">
                      <Link href="/skills">
                        <FlaskConical aria-hidden />
                        版本快照总览（Skill 列表）
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="justify-start">
                      <Link href="/evals">
                        <ClipboardList aria-hidden />
                        评测集与批次
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="justify-start">
                      <Link href="/improvements">
                        <Sparkles aria-hidden />
                        改进记录
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="justify-start">
                      <Link href="/api/annotations?limit=200" target="_blank">
                        <Download aria-hidden />
                        标注原始 JSON
                      </Link>
                    </Button>
                  </div>
                </SectionCard>
              </div>

            </>
          ) },
        ]}
      />

      <p className="text-muted-foreground text-[10.5px] leading-relaxed">
        说明：聚类是确定性规则（R1–R5），Prompt 草案是规则拼接，两者都不调用模型，页面上的「规则聚类」标注与草案里的
        「规则草案」字样即为此意。应用草案会走 Skill 版本流程（先留快照、再改正文），随时可回滚。
      </p>
    </div>
  );
}
