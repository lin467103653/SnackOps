import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Bot, FlaskConical } from "lucide-react";

import { AgentWorkspace } from "@/components/agent-workspace";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAgentRuns } from "@/lib/agent/run-store";
import { getLlmStatus } from "@/lib/llm";
import { listEnabledSkills } from "@/lib/skills/registry";
import { listEnabledTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent 工作台" };

export default async function AgentWorkspacePage() {
  const [llm, skills, tools, runs] = await Promise.all([
    getLlmStatus(),
    listEnabledSkills(),
    listEnabledTools(),
    listAgentRuns(5),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agent 工作台"
        description="输入一个真实问题，观察 Planner 如何选能力、Validator 如何拦截、Executor 如何调工具，以及最终回复有没有通过风险审查。"
        meta={
          <>
            <Badge variant={llm.configured ? (llm.fixture ? "warning" : "success") : "danger"}>
              {llm.configured ? (llm.fixture ? "课堂演示模式" : `真实模型 · ${llm.model}`) : "未配置 LLM"}
            </Badge>
            <Badge variant="outline">启用 Skill {skills.length}</Badge>
            <Badge variant="outline">启用 Tool {tools.length}</Badge>
            <Badge variant="outline">历史运行 {runs.total}</Badge>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/runs">
                <Activity aria-hidden />
                运行记录
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/demo">
                <Bot aria-hidden />
                聊天演示页
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/overview">
                <FlaskConical aria-hidden />
                运营总览
              </Link>
            </Button>
          </>
        }
      />

      {!llm.configured ? (
        <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-2.5">
          <p className="text-[12.5px] font-medium text-rose-900">当前没有可用的 LLM Provider，Agent 无法运行</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-rose-800">{llm.hint}</p>
        </div>
      ) : null}

      <AgentWorkspace
        llm={{
          configured: llm.configured,
          label: llm.label,
          model: llm.model,
          provider: llm.provider,
          fixture: llm.fixture,
          hint: llm.hint,
        }}
        skills={skills.map((skill) => ({ id: skill.id, name: skill.name }))}
        tools={tools.map((tool) => ({ id: tool.id, name: tool.name }))}
        recentRuns={runs.items.map((run) => ({
          id: run.id,
          question: run.question,
          status: run.status,
          createdAt: run.createdAt,
          riskVerdict: run.riskResult?.verdict ?? null,
        }))}
      />
    </div>
  );
}
