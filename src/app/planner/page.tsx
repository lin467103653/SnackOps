import type { Metadata } from "next";
import Link from "next/link";
import { Braces, GitBranch } from "lucide-react";

import { PlannerConsole } from "@/components/actions/planner-console";
import { PageHeader } from "@/components/page-header";
import { CAPABILITY_LABELS } from "@/lib/agent/capabilities";
import { getPlannerConfig } from "@/lib/agent/planner-config";
import { getLlmStatus } from "@/lib/llm";
import { listEnabledSkills } from "@/lib/skills/registry";
import { listEnabledTools } from "@/lib/tools/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planner 管理" };

export default async function PlannerPage() {
  const [config, skills, tools, status] = await Promise.all([
    getPlannerConfig(),
    listEnabledSkills(),
    listEnabledTools(),
    getLlmStatus(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Planner 管理"
        description="Planner 决定「用哪些 Skill / Tool」。这里的配置会直接作用于真实运行：版本、提示词、可选能力白名单与默认必需能力。"
        meta={
          <>
            <Badge variant="outline" className="gap-1 font-mono">
              <GitBranch aria-hidden className="size-3" />v{config.version}
            </Badge>
            <Badge variant="outline" className="font-mono">
              {config.model} · T={config.temperature}
            </Badge>
            <Badge variant={status.configured ? (status.fixture ? "warning" : "success") : "danger"}>
              {status.configured ? (status.fixture ? "课堂演示模式" : `真实模型 · ${status.model}`) : "Provider 未配置"}
            </Badge>
            <Badge variant="outline">
              可选 Skill {config.allowedSkills.length === 0 ? "全部" : config.allowedSkills.length}
            </Badge>
            <Badge variant="outline">
              可选 Tool {config.allowedTools.length === 0 ? "全部" : config.allowedTools.length}
            </Badge>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/api/planner" target="_blank">
              <Braces aria-hidden />
              查看 JSON
            </Link>
          </Button>
        }
      />

      <PlannerConsole
        config={{
          version: config.version,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          promptHash: config.promptHash,
          allowedSkills: config.allowedSkills,
          allowedTools: config.allowedTools,
          defaultMandatoryCapabilities: config.defaultMandatoryCapabilities,
          updatedAt: config.updatedAt,
          updatedBy: config.updatedBy,
          history: config.history,
        }}
        prompt={config.systemPrompt}
        catalog={{
          skills: skills.map((skill) => ({ id: skill.id, name: skill.name, capabilities: skill.capabilities })),
          tools: tools.map((tool) => ({ id: tool.id, name: tool.name, kind: tool.kind })),
        }}
        capabilities={Object.entries(CAPABILITY_LABELS).map(([id, label]) => ({ id, label }))}
        provider={{ configured: status.configured, label: status.label, model: status.model, fixture: status.fixture }}
      />
    </div>
  );
}
