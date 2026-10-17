import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileText, GitBranch, Layers, Sparkles, Wrench } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FilterSelect } from "@/components/filter-select";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { SkillToggle } from "@/components/actions/skill-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSkills } from "@/lib/skills/registry";
import { readVersions } from "@/lib/skills/versions";
import { listTools } from "@/lib/tools/registry";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skill 管理" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export default async function SkillsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const enabledFilter = pick(params.enabled) ?? "all";

  const [allSkills, versions, tools] = await Promise.all([listSkills(), readVersions(), listTools()]);

  const skills = allSkills.filter((skill) => {
    if (enabledFilter === "1") return skill.enabled;
    if (enabledFilter === "0") return !skill.enabled;
    return true;
  });

  const enabled = allSkills.filter((skill) => skill.enabled);
  const toolName = new Map(tools.map((tool) => [tool.id, tool.name]));
  const versionCount = new Map<string, number>();
  for (const version of versions) versionCount.set(version.skillId, (versionCount.get(version.skillId) ?? 0) + 1);
  const stages = Array.from(new Set(allSkills.map((skill) => skill.stage)));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Skill 管理"
        description="Skill 是 Agent 流水线上的能力单元：正文即系统提示词，参数决定模型行为，依赖工具决定 Planner 的选择范围。启用状态直接决定 Planner / Executor 能不能读到它。"
        meta={
          <>
            <Badge variant="outline">共 {allSkills.length} 个 Skill</Badge>
            <Badge variant="success">启用 {enabled.length}</Badge>
            <Badge variant="neutral">停用 {allSkills.length - enabled.length}</Badge>
            <Badge variant="outline">版本快照 {versions.length}</Badge>
            <Badge variant="outline">{stages.length} 个流水线阶段</Badge>
            {enabledFilter !== "all" ? (
              <Badge variant="warning">当前筛选：{enabledFilter === "1" ? "仅启用" : "仅停用"}（{skills.length} 条）</Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/api/registry" target="_blank">
                <Layers aria-hidden />
                注册表 API
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/catalog">
                <FileText aria-hidden />
                业务数据目录
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Skill 指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Skill 总数" value={allSkills.length} unit="个" icon={Sparkles} hint={`${stages.length} 个阶段`} />
        <StatCard
          label="启用中"
          value={enabled.length}
          unit="个"
          icon={GitBranch}
          tone="positive"
          hint="Planner 只读启用中的 Skill"
        />
        <StatCard
          label="停用"
          value={allSkills.length - enabled.length}
          unit="个"
          icon={Layers}
          hint="停用后不会出现在注册表读取结果"
        />
        <StatCard label="版本快照" value={versions.length} unit="个" icon={FileText} hint="每次保存正文自动留档" />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-[11px]">按启用状态筛选</span>
        <FilterSelect
          param="enabled"
          value={enabledFilter === "all" ? null : enabledFilter}
          placeholder="全部状态"
          ariaLabel="按启用状态筛选"
          options={[
            { value: "1", label: "仅启用" },
            { value: "0", label: "仅停用" },
          ]}
        />
        <span className="text-muted-foreground text-[11px]">共 {skills.length} 条</span>
        {enabledFilter !== "all" ? (
          <Button asChild variant="ghost" size="xs">
            <Link href="/skills">清除筛选</Link>
          </Button>
        ) : null}
      </div>

      <SectionCard
        title="Skill 清单"
        description="按流水线顺序排列；右侧开关即时生效，不会改动正文与版本"
        contentClassName="border-t"
      >
        {skills.length === 0 ? (
          <EmptyState icon={Sparkles} title="还没有注册 Skill" description="运行 node scripts/seed-registry.mjs 初始化注册表。" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Skill</TableHead>
                <TableHead>阶段</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>模型 / 温度</TableHead>
                <TableHead>依赖工具</TableHead>
                <TableHead className="text-right">快照</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
                <TableRow key={skill.id} className={cn(!skill.enabled && "bg-muted/25")}>
                  <TableCell className="pl-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                        {skill.name}
                        {!skill.enabled ? <Badge variant="neutral">未启用</Badge> : null}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10.5px]">{skill.id}</span>
                      <span className="text-muted-foreground max-w-[300px] text-[11px] leading-snug">{skill.description}</span>
                      <details>
                        <summary className="text-muted-foreground cursor-pointer text-[10.5px] select-none">
                          查看 Prompt 正文
                        </summary>
                        <pre className="scroll-area-thin mt-1 max-h-[220px] max-w-[420px] overflow-auto rounded border bg-muted/30 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                          {skill.systemPrompt}
                        </pre>
                      </details>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TagBadge>{skill.stage}</TagBadge>
                  </TableCell>
                  <TableCell>
                    <SkillToggle skillId={skill.id} enabled={skill.enabled} compact />
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px]">v{skill.version}</TableCell>
                  <TableCell className="text-[11.5px]">
                    <span className="font-mono">{skill.model}</span>
                    <span className="text-muted-foreground block text-[10.5px]">
                      T={skill.temperature} · {skill.maxTokens} tokens
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[190px] flex-wrap gap-1">
                      {skill.requiredTools.length === 0 ? (
                        <span className="text-muted-foreground text-[11px]">无（纯生成）</span>
                      ) : (
                        skill.requiredTools.map((toolId) => (
                          <TagBadge key={toolId} title={toolId}>
                            <Wrench aria-hidden className="size-3" />
                            {toolName.get(toolId) ?? toolId}
                          </TagBadge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground text-right text-[11.5px]">
                    {versionCount.get(skill.id) ?? 0}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-muted-foreground hidden text-[10.5px] xl:inline">
                        {formatRelative(skill.updatedAt)}
                      </span>
                      <Button asChild variant="ghost" size="xs">
                        <Link href={`/skills/${encodeURIComponent(skill.id)}`}>
                          编辑
                          <ArrowUpRight aria-hidden />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Planner / Executor 读取入口" description="注册表只返回启用中的条目">
          <ul className="divide-y text-[11.5px]">
            {[
              { path: "/api/registry", note: "启用中的 Skill（含正文）+ Tool（含 JSON Schema）+ 转人工规则" },
              { path: "/api/skills?enabled=1", note: "只要 Skill，可按 enabled 过滤" },
              { path: "/api/tools?enabled=1", note: "只要 Tool，可按 enabled 过滤" },
            ].map((item) => (
              <li key={item.path} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <Link href={item.path} target="_blank" className="text-primary font-mono text-[11px] underline-offset-4 hover:underline">
                  GET {item.path}
                </Link>
                <span className="text-muted-foreground">{item.note}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="本段行为约定" description="运营与研发对齐的口径">
          <ul className="space-y-2 px-4 py-3 text-[11.5px] leading-relaxed">
            <li>
              <span className="font-medium">停用即不可见：</span>
              <span className="text-muted-foreground">注册表读取只返回 enabled=true，Planner 不会拿到停用的 Skill / Tool。</span>
            </li>
            <li>
              <span className="font-medium">正文与版本分离：</span>
              <span className="text-muted-foreground">保存正文会先自动快照旧正文，再把版本号 patch +1，任何一次改动都可回滚、可 diff。</span>
            </li>
            <li>
              <span className="font-medium">文件是镜像：</span>
              <span className="text-muted-foreground">skills.json 是主存储，skills/&lt;id&gt;.md 用于代码评审；不一致时页面会标出并可一键重新导出。</span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
        <StatusBadge status="正常" />
        <span>数据源 data/skills.json · data/skill-versions.json · 正文源码 skills/&lt;id&gt;.md</span>
      </div>
    </div>
  );
}
