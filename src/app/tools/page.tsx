import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Braces, PlayCircle, ShieldAlert, Wrench } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { ToolConsole } from "@/components/actions/tool-console";
import { StatCard } from "@/components/stat-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { ToolToggle } from "@/components/actions/tool-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getToolConfigs } from "@/lib/data";
import { listSkills } from "@/lib/skills/registry";
import { auditTools, hasHandler, listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tool 管理" };

function fieldCount(schema: Record<string, unknown>): number {
  const properties = schema.properties;
  return properties && typeof properties === "object" ? Object.keys(properties as Record<string, unknown>).length : 0;
}

export default async function ToolsPage() {
  const [tools, configs, skills] = await Promise.all([listTools(), getToolConfigs(), listSkills()]);
  const audit = auditTools(tools);
  const configByTool = new Map(configs.map((config) => [config.toolId, config]));
  const callerByTool = new Map<string, string[]>();
  for (const skill of skills) {
    for (const toolId of skill.requiredTools) {
      callerByTool.set(toolId, [...(callerByTool.get(toolId) ?? []), skill.name]);
    }
  }

  const enabled = tools.filter((tool) => tool.enabled);
  const implemented = tools.filter((tool) => hasHandler(tool.id));
  const needConfirm = tools.filter((tool) => configByTool.get(tool.id)?.requireConfirm);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tool 管理"
        description="Tool 是 Agent 与业务数据之间的唯一通道：入参有 JSON Schema、实现直接读 data/*.json、执行有错误分类。测试入口返回的就是真实记录。"
        meta={
          <>
            <Badge variant="outline">共 {tools.length} 个 Tool</Badge>
            <Badge variant="success">启用 {enabled.length}</Badge>
            <Badge variant="outline">已实现 {implemented.length}</Badge>
            <Badge variant={audit.unimplemented.length > 0 ? "danger" : "neutral"}>
              未实现 {audit.unimplemented.length}
            </Badge>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/api/tools?enabled=1" target="_blank">
              <Braces aria-hidden />
              启用中的 Tool API
            </Link>
          </Button>
        }
      />

      <section aria-label="Tool 指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="Tool 总数" value={tools.length} unit="个" icon={Wrench} hint="只读查询与计算" />
        <StatCard label="启用中" value={enabled.length} unit="个" icon={PlayCircle} tone="positive" hint="Planner 只能调用启用中的" />
        <StatCard
          label="需二次确认"
          value={needConfirm.length}
          unit="个"
          icon={ShieldAlert}
          tone={needConfirm.length > 0 ? "warning" : "default"}
          hint="来自 tools-config.json"
        />
        <StatCard
          label="实现覆盖"
          value={`${implemented.length}/${tools.length}`}
          icon={Braces}
          hint={audit.orphanHandlers.length > 0 ? `还有 ${audit.orphanHandlers.length} 个孤儿实现` : "注册表与代码一一对应"}
        />
      </section>

      {audit.unimplemented.length > 0 ? (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50 px-3.5 py-2.5">
          <p className="text-[12.5px] font-medium text-amber-900">有 {audit.unimplemented.length} 个 Tool 只注册了契约、还没有实现</p>
          <p className="mt-0.5 text-[11.5px] text-amber-800">{audit.unimplemented.join("、")}</p>
        </div>
      ) : null}

      <SectionCard
        title="Tool 测试台"
        description="选一个 Tool 填 JSON 入参，结果全部来自服务端 POST /api/tools/[id]/test，客户端不构造成功文案"
        contentClassName="border-t"
      >
        <ToolConsole
          tools={tools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            kind: tool.kind,
            version: tool.version,
            enabled: tool.enabled,
            sampleInput: tool.sampleInput,
          }))}
        />
      </SectionCard>

      <SectionCard title="Tool 清单" description="开关只影响 Planner 是否拿到该工具，不影响手动测试" contentClassName="border-t">
        {tools.length === 0 ? (
          <EmptyState icon={Wrench} title="还没有注册 Tool" description="运行 node scripts/seed-registry.mjs 初始化注册表。" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Tool</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>风险</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>版本</TableHead>
                <TableHead className="text-right">入参字段</TableHead>
                <TableHead>调用方</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => {
                const callers = callerByTool.get(tool.id) ?? [];
                return (
                  <TableRow key={tool.id}>
                    <TableCell className="pl-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12.5px] font-medium">{tool.name}</span>
                        <span className="text-muted-foreground font-mono text-[10.5px]">{tool.id}</span>
                        <span className="text-muted-foreground max-w-[340px] text-[11px] leading-snug">{tool.description}</span>
                        <details>
                          <summary className="text-muted-foreground cursor-pointer text-[10.5px] select-none">
                            输入 / 输出 schema
                          </summary>
                          <div className="mt-1 grid max-w-[520px] gap-1.5 lg:grid-cols-2">
                            <pre className="scroll-area-thin max-h-[200px] overflow-auto rounded border bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
                              {JSON.stringify(tool.inputSchema, null, 2)}
                            </pre>
                            <pre className="scroll-area-thin max-h-[200px] overflow-auto rounded border bg-muted/30 p-2 font-mono text-[10px] leading-relaxed">
                              {JSON.stringify(tool.outputSchema, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] whitespace-nowrap">{tool.kind}</TableCell>
                    <TableCell>
                      <Badge variant={tool.riskLevel === "高" ? "danger" : tool.riskLevel === "中" ? "warning" : "neutral"}>
                        风险 {tool.riskLevel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ToolToggle toolId={tool.id} enabled={tool.enabled} />
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{tool.version}</TableCell>
                    <TableCell className="tabular text-right text-[11.5px]">{fieldCount(tool.inputSchema)}</TableCell>
                    <TableCell>
                      {callers.length === 0 ? (
                        <span className="text-muted-foreground text-[11px]">无</span>
                      ) : (
                        <div className="flex max-w-[180px] flex-wrap gap-1">
                          {callers.slice(0, 3).map((name) => (
                            <TagBadge key={name}>{name}</TagBadge>
                          ))}
                          {callers.length > 3 ? <TagBadge>+{callers.length - 3}</TagBadge> : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button asChild variant="ghost" size="xs">
                        <Link href={`/tools/${encodeURIComponent(tool.id)}`}>
                          Schema / 测试
                          <ArrowUpRight aria-hidden />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="运行配置" description="超时、重试、限流与二次确认（data/tools-config.json）" contentClassName="border-t">
        {configs.length === 0 ? (
          <EmptyState title="还没有工具配置" description="为每个工具补一行超时与限流配置。" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Tool</TableHead>
                <TableHead className="text-right">超时</TableHead>
                <TableHead className="text-right">重试</TableHead>
                <TableHead className="text-right">限流</TableHead>
                <TableHead>二次确认</TableHead>
                <TableHead>环境</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => {
                const tool = tools.find((item) => item.id === config.toolId);
                return (
                  <TableRow key={config.id}>
                    <TableCell className="pl-4 text-[12px] whitespace-nowrap">
                      {tool?.name ?? config.toolId}
                      <span className="text-muted-foreground block font-mono text-[10.5px]">{config.toolId}</span>
                    </TableCell>
                    <TableCell className="tabular text-right text-[11.5px]">{config.timeoutMs} ms</TableCell>
                    <TableCell className="tabular text-right text-[11.5px]">{config.maxRetries}</TableCell>
                    <TableCell className="tabular text-right text-[11.5px]">{config.rateLimitPerMin}/min</TableCell>
                    <TableCell>
                      <Badge variant={config.requireConfirm ? "warning" : "neutral"}>
                        {config.requireConfirm ? "需要" : "不需要"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TagBadge>{config.env === "production" ? "生产" : "沙箱"}</TagBadge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[260px] text-[11px] leading-snug">{config.note}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
        <StatusBadge status="正常" />
        <span>实现位于 src/lib/tools/handlers.ts，与注册表 id 一一对应；未实现会在上方标红。</span>
      </div>
    </div>
  );
}
