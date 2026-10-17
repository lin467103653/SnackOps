import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Braces, ShieldAlert, Sparkles, Wrench } from "lucide-react";

import { ToolRunner } from "@/components/actions/tool-runner";
import { ToolToggle } from "@/components/actions/tool-toggle";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getToolConfigs } from "@/lib/data";
import { listSkills } from "@/lib/skills/registry";
import { getToolOrThrow } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const tool = await getToolOrThrow(safeDecode(id));
    return { title: `${tool.name} · Tool` };
  } catch {
    return { title: "Tool" };
  }
}

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const toolId = safeDecode(id);

  let tool;
  try {
    tool = await getToolOrThrow(toolId);
  } catch {
    notFound();
  }

  const [configs, skills] = await Promise.all([getToolConfigs(), listSkills()]);
  const config = configs.find((item) => item.toolId === tool.id);
  const callers = skills.filter((skill) => skill.requiredTools.includes(tool.id));

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="xs" className="text-muted-foreground -ml-1.5">
        <Link href="/tools">
          <ArrowLeft aria-hidden />
          返回 Tool 列表
        </Link>
      </Button>

      <PageHeader
        title={tool.name}
        description={tool.description}
        meta={
          <>
            <Badge variant={tool.enabled ? "success" : "neutral"}>{tool.enabled ? "已启用" : "已停用"}</Badge>
            <TagBadge>{tool.kind}</TagBadge>
            <Badge variant={tool.riskLevel === "高" ? "danger" : tool.riskLevel === "中" ? "warning" : "neutral"}>
              风险 {tool.riskLevel}
            </Badge>
            <Badge variant="outline" className="font-mono">
              v{tool.version}
            </Badge>
            <TagBadge title={tool.id}>{tool.id}</TagBadge>
          </>
        }
        actions={
          <>
            <ToolToggle toolId={tool.id} enabled={tool.enabled} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/api/tools/${encodeURIComponent(tool.id)}`} target="_blank">
                <Braces aria-hidden />
                查看 JSON
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="运行测试" description="入参按 JSON 提交，返回的就是 data/*.json 里的真实记录">
            <ToolRunner toolId={tool.id} sampleInput={tool.sampleInput} disabled={!tool.enabled} />
          </SectionCard>

          <SectionCard title="输入 Schema" description="Planner 读取 JSON Schema 来生成调用参数" contentClassName="border-t">
            <pre className="scroll-area-thin max-h-[360px] overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="输出 Schema" description="下游 Skill 按这个结构解析结果" contentClassName="border-t">
            <pre className="scroll-area-thin max-h-[320px] overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(tool.outputSchema, null, 2)}
            </pre>
          </SectionCard>

          <SectionCard title="运行配置" description="来自 data/tools-config.json">
            {config ? (
              <dl className="divide-y text-[12px]">
                {[
                  ["超时", `${config.timeoutMs} ms`],
                  ["最大重试", String(config.maxRetries)],
                  ["限流", `${config.rateLimitPerMin} 次/分钟`],
                  ["环境", config.env === "production" ? "生产" : "沙箱"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-4 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-4 py-2">
                  <dt className="text-muted-foreground">二次确认</dt>
                  <dd>
                    <Badge variant={config.requireConfirm ? "warning" : "neutral"}>
                      {config.requireConfirm ? "需要" : "不需要"}
                    </Badge>
                  </dd>
                </div>
                <div className="px-4 py-2">
                  <dt className="text-muted-foreground">备注</dt>
                  <dd className="mt-0.5 text-[11.5px] leading-relaxed">{config.note}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState title="没有运行配置" description="该 Tool 尚未在 tools-config.json 中登记。" />
            )}
          </SectionCard>

          <SectionCard
            title="调用方 Skill"
            description="这些 Skill 的 requiredTools 里包含本工具"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/skills">
                  Skill 管理
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            }
          >
            {callers.length === 0 ? (
              <EmptyState icon={Sparkles} title="暂无调用方" description="没有任何 Skill 声明依赖该工具。" />
            ) : (
              <ul className="divide-y">
                {callers.map((skill) => (
                  <li key={skill.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0">
                      <p className="text-[12.5px]">{skill.name}</p>
                      <p className="text-muted-foreground font-mono text-[10.5px]">{skill.id}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={skill.enabled ? "success" : "neutral"}>{skill.enabled ? "启用" : "停用"}</Badge>
                      <Button asChild variant="ghost" size="xs">
                        <Link href={`/skills/${encodeURIComponent(skill.id)}`}>查看</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
            <Wrench aria-hidden className="size-3" />
            <span>实现：src/lib/tools/handlers.ts</span>
            <ShieldAlert aria-hidden className="size-3" />
            <span>风险等级：{tool.riskLevel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
