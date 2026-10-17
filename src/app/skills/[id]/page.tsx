import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileCode2,
  FileDiff,
  GitCompareArrows,
  History,
  Wrench,
} from "lucide-react";

import { ExportMirrorButton } from "@/components/actions/export-mirror-button";
import { SkillEditor } from "@/components/actions/skill-editor";
import { SkillMetaForm } from "@/components/actions/skill-meta-form";
import { SkillToggle } from "@/components/actions/skill-toggle";
import { DiffView } from "@/components/skill-diff";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diffLines } from "@/lib/diff";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getSkillFileState, listSkills } from "@/lib/skills/registry";
import { RollbackButton } from "@/components/actions/rollback-button";
import { getVersion, listVersions, resolveVersionContent } from "@/lib/skills/versions";
import { listTools } from "@/lib/tools/registry";
import type { SkillVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const skills = await listSkills();
  const skill = skills.find((item) => item.id === safeDecode(id));
  return { title: skill ? `${skill.name} · Skill` : "Skill" };
}

export default async function SkillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const skillId = safeDecode(id);

  const [skills, tools] = await Promise.all([listSkills(), listTools()]);
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) notFound();

  const [versions, fileState] = await Promise.all([listVersions(skill.id), getSkillFileState(skill)]);
  const toolName = new Map(tools.map((tool) => [tool.id, tool.name]));

  const versionParam = pick(sp.version);
  const fromParam = pick(sp.from);
  const toParam = pick(sp.to) ?? "current";

  let selectedVersion: SkillVersion | null = null;
  let diffPayload: {
    beforeLabel: string;
    afterLabel: string;
    result: ReturnType<typeof diffLines>;
  } | null = null;
  let viewError: string | null = null;

  if (versionParam) {
    try {
      selectedVersion = await getVersion(skill.id, versionParam);
    } catch (error) {
      viewError = `读不到版本 ${versionParam}：${errorMessage(error)}`;
    }
  }

  if (fromParam) {
    try {
      const [before, after] = await Promise.all([
        resolveVersionContent(skill.id, fromParam),
        resolveVersionContent(skill.id, toParam),
      ]);
      diffPayload = { beforeLabel: before.label, afterLabel: after.label, result: diffLines(before.content, after.content) };
    } catch (error) {
      viewError = `生成 diff 失败：${errorMessage(error)}`;
    }
  }

  const base = `/skills/${encodeURIComponent(skill.id)}`;
  const latest = versions[0];

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="xs" className="text-muted-foreground -ml-1.5">
        <Link href="/skills">
          <ArrowLeft aria-hidden />
          返回 Skill 列表
        </Link>
      </Button>

      <PageHeader
        title={skill.name}
        description={skill.description}
        meta={
          <>
            <TagBadge>{skill.stage}</TagBadge>
            <Badge variant={skill.enabled ? "success" : "neutral"}>{skill.enabled ? "已启用" : "已停用"}</Badge>
            <Badge variant="outline" className="font-mono">
              v{skill.version}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {skill.model} · T={skill.temperature}
            </Badge>
            <TagBadge title={skill.id}>{skill.id}</TagBadge>
            <span className="text-muted-foreground text-[11px]">更新于 {formatRelative(skill.updatedAt)}</span>
          </>
        }
        actions={
          <>
            <SkillToggle skillId={skill.id} enabled={skill.enabled} />
            <ExportMirrorButton skillId={skill.id} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/skills/${encodeURIComponent(skill.id)}`} target="_blank">
                <FileCode2 aria-hidden />
                查看 JSON
              </Link>
            </Button>
          </>
        }
      />

      {viewError ? (
        <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-2.5 text-[12px] text-rose-900">
          {viewError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard
            title="提示词正文"
            description="保存时自动快照旧正文 → 版本 patch +1 → 同步 skills/<id>.md"
          >
            <SkillEditor skillId={skill.id} initialContent={skill.systemPrompt} version={skill.version} />
          </SectionCard>

          <SectionCard
            title="版本历史"
            description={`共 ${versions.length} 个快照，最新一个是 ${latest ? `v${latest.version}` : "无"}`}
            action={
              latest ? (
                <Button asChild variant="ghost" size="xs">
                  <Link href={`${base}?from=${encodeURIComponent(latest.version)}&to=current`}>
                    <GitCompareArrows aria-hidden />
                    最新版 vs 当前
                  </Link>
                </Button>
              ) : null
            }
            contentClassName="border-t"
          >
            {versions.length === 0 ? (
              <EmptyState icon={History} title="还没有版本快照" description="保存一次正文后，版本会自动累积。" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">版本</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>变更说明</TableHead>
                    <TableHead>hash</TableHead>
                    <TableHead className="text-right">评测分</TableHead>
                    <TableHead className="pr-4 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="pl-4 whitespace-nowrap">
                        <span className="font-mono text-[11.5px]">v{version.version}</span>
                        <span className="text-muted-foreground block text-[10.5px]">{formatDateTime(version.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={version.auto ? "warning" : "info"}>{version.auto ? "自动快照" : "人工保存"}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px] text-[11.5px] leading-snug">
                        <span className="line-clamp-2">{version.changeNote}</span>
                        <span className="text-muted-foreground block text-[10.5px]">
                          {version.author}
                          {version.regression ? " · 有回归" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[10.5px]">{version.hash}</TableCell>
                      <TableCell className="tabular text-right text-[11.5px]">
                        {version.evalScore === null ? "—" : version.evalScore}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`${base}?version=${encodeURIComponent(version.version)}`}>
                              <BookOpen aria-hidden />
                              查看
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`${base}?from=${encodeURIComponent(version.version)}&to=current`}>
                              <FileDiff aria-hidden />
                              对比当前
                            </Link>
                          </Button>
                          <RollbackButton skillId={skill.id} version={version.version} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {selectedVersion ? (
            <SectionCard
              title={`版本内容 v${selectedVersion.version}`}
              description={`${selectedVersion.changeNote} · ${selectedVersion.author} · ${formatDateTime(selectedVersion.createdAt)} · hash ${selectedVersion.hash}`}
              action={
                <Button asChild variant="ghost" size="xs">
                  <Link href={`${base}?from=${encodeURIComponent(selectedVersion.version)}&to=current`}>
                    与当前对比
                  </Link>
                </Button>
              }
              contentClassName="border-t"
            >
              <pre className="scroll-area-thin max-h-[420px] overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
                {selectedVersion.content}
              </pre>
            </SectionCard>
          ) : null}

          <SectionCard
            title="版本对比"
            description="行级 diff：+ 为新增、− 为删除，行号左旧右新"
            action={
              diffPayload ? (
                <span className="text-muted-foreground text-[10.5px]">可复制下面文本贴进工单</span>
              ) : (
                <span className="text-muted-foreground text-[10.5px]">从版本列表点「对比当前」</span>
              )
            }
          >
            {diffPayload ? (
              <DiffView
                lines={diffPayload.result.lines}
                summary={{
                  added: diffPayload.result.added,
                  removed: diffPayload.result.removed,
                  changed: diffPayload.result.changed,
                }}
                fromLabel={diffPayload.beforeLabel}
                toLabel={diffPayload.afterLabel}
              />
            ) : (
              <EmptyState
                icon={GitCompareArrows}
                title="还没有选择对比版本"
                description="在版本历史里点任意版本的「对比当前」，或点上方「最新版 vs 当前」。"
              />
            )}
            {diffPayload ? (
              <details className="border-t px-4 py-2">
                <summary className="text-muted-foreground cursor-pointer text-[11px] select-none">展开纯文本 diff</summary>
                <pre className="scroll-area-thin mt-2 max-h-[280px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                  {diffPayload.result.text}
                </pre>
              </details>
            ) : null}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="运行参数" description="模型、温度、Token 上限与依赖工具">
            <SkillMetaForm
              skillId={skill.id}
              skill={{
                name: skill.name,
                description: skill.description,
                stage: skill.stage,
                model: skill.model,
                temperature: skill.temperature,
                maxTokens: skill.maxTokens,
                requiredTools: skill.requiredTools,
                owner: skill.owner,
              }}
              tools={tools.map((tool) => ({ id: tool.id, name: tool.name }))}
            />
          </SectionCard>

          <SectionCard
            title="文件镜像"
            description="正文会同步写入 skills/ 下的 Markdown，便于代码评审"
            action={<ExportMirrorButton skillId={skill.id} label="写入文件" />}
          >
            <dl className="divide-y text-[12px]">
              <div className="flex items-start justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground">路径</dt>
                <dd className="max-w-[62%] truncate font-mono text-[11px]" title={skill.filePath}>
                  {skill.filePath}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground">状态</dt>
                <dd>
                  <StatusBadge status={!fileState.exists ? "异常" : fileState.inSync ? "正常" : "偏低"} />
                  <span className="text-muted-foreground ml-1.5 text-[11px]">
                    {!fileState.exists ? "文件缺失" : fileState.inSync ? "与注册表一致" : "与注册表不一致"}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground">注册表 hash</dt>
                <dd className="font-mono text-[11px]">{skill.hash}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground">文件 hash</dt>
                <dd className="font-mono text-[11px]">{fileState.fileHash ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard
            title="依赖工具"
            description="Planner 只会在这几个工具内做选择"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/tools">
                  工具管理
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            }
          >
            {skill.requiredTools.length === 0 ? (
              <EmptyState icon={Wrench} title="不依赖工具" description="纯生成类 Skill（例如话术生成、摘要）不需要工具。" />
            ) : (
              <ul className="divide-y">
                {skill.requiredTools.map((toolId) => {
                  const tool = tools.find((item) => item.id === toolId);
                  return (
                    <li key={toolId} className="flex items-center justify-between gap-2 px-4 py-2">
                      <div className="min-w-0">
                        <p className="text-[12.5px]">{toolName.get(toolId) ?? toolId}</p>
                        <p className="text-muted-foreground font-mono text-[10.5px]">{toolId}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {tool ? (
                          <Badge variant={tool.enabled ? "success" : "neutral"}>{tool.enabled ? "可用" : "已停用"}</Badge>
                        ) : (
                          <Badge variant="danger">未注册</Badge>
                        )}
                        <Button asChild variant="ghost" size="xs">
                          <Link href={`/tools/${encodeURIComponent(toolId)}`}>查看</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="注册表字段" description="Planner 读取时拿到的内容">
            <pre className="scroll-area-thin max-h-[260px] overflow-auto px-4 py-3 font-mono text-[10.5px] leading-relaxed">
              {JSON.stringify(
                {
                  id: skill.id,
                  name: skill.name,
                  stage: skill.stage,
                  version: skill.version,
                  model: skill.model,
                  temperature: skill.temperature,
                  maxTokens: skill.maxTokens,
                  requiredTools: skill.requiredTools,
                  filePath: skill.filePath,
                  hash: skill.hash,
                  enabled: skill.enabled,
                  updatedAt: skill.updatedAt,
                },
                null,
                2,
              )}
            </pre>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
