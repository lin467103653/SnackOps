import type { Metadata } from "next";
import Link from "next/link";
import { Braces, ClipboardCheck } from "lucide-react";

import { EvalBatchPanel, type BatchView } from "@/components/actions/eval-batch-panel";
import { EvalWorkbench, type EvalCaseRow } from "@/components/actions/eval-workbench";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadCollection } from "@/lib/collections";
import { listBatches } from "@/lib/eval/batch";
import { listSkills } from "@/lib/skills/registry";
import { listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "评测集" };

export default async function EvalPage() {
  const [casesRaw, skills, tools, batchRows] = await Promise.all([
    loadCollection("eval-cases"),
    listSkills(),
    listTools(),
    listBatches(),
  ]);

  const cases: EvalCaseRow[] = [...casesRaw]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((item) => ({
      id: item.id,
      name: item.name,
      question: item.question,
      category: item.category,
      difficulty: item.difficulty,
      riskLevel: item.riskLevel,
      expectedBehavior: item.expectedBehavior,
      expectedReply: item.expectedReply,
      expectedKeywords: item.expectedKeywords,
      keywordMode: item.keywordMode,
      forbiddenWords: item.forbiddenWords,
      expectedPrice: item.expectedPrice,
      priceTolerance: item.priceTolerance,
      expectRiskPassed: item.expectRiskPassed,
      requiredCapabilities: item.requiredCapabilities,
      forbiddenCapabilities: item.forbiddenCapabilities,
      evalDimension: item.evalDimension,
      llmJudgePrompt: item.llmJudgePrompt,
      tags: item.tags,
      sourceRunId: item.sourceRunId,
      createdAt: item.createdAt,
      enabled: item.enabled,
    }));

  const enabled = cases.filter((item) => item.enabled).length;
  const categories = new Set(cases.map((item) => item.category));

  return (
    <div className="space-y-4">
      <PageHeader
        title="评测集"
        description="每条用例都跑真实的 Agent 主链路：调用 /api/agent/run 拿到本次最终回复与 Trace，再按关键词、禁词、价格、能力与风控评分。"
        meta={
          <>
            <Badge variant="outline">用例 {cases.length}</Badge>
            <Badge variant="success">启用 {enabled}</Badge>
            <Badge variant="neutral">停用 {cases.length - enabled}</Badge>
            <Badge variant="outline">{categories.size} 个分类</Badge>
            <Badge variant="outline">批量评测 {batchRows.length}</Badge>
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/api/eval" target="_blank">
                <Braces aria-hidden />
                评测集 JSON
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/evals">
                <ClipboardCheck aria-hidden />
                历史评测批次
              </Link>
            </Button>
          </>
        }
      />

      <SectionCard
        title="用例与单条测试"
        description="单测会真实调用 Agent（同一套 Planner / Skill / Tool / 风控），评分证据带 runId 可回查"
        contentClassName="border-t"
      >
        <div className="px-4 py-3">
          <EvalWorkbench
            cases={cases}
            skills={skills.map((skill) => ({ id: skill.id, name: skill.name }))}
            tools={tools.map((tool) => ({ id: tool.id, name: tool.name }))}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="批量评测与版本对比"
        description="每个用例都真实跑一次 Agent 主链路，再用同一个规则评分器评分；批次只保存本次执行结果"
        contentClassName="border-t"
      >
        <div className="px-4 py-3">
          <EvalBatchPanel
            cases={cases.map((item) => ({ id: item.id, name: item.name, question: item.question, enabled: item.enabled }))}
            initialBatches={batchRows as unknown as BatchView[]}
          />
        </div>
      </SectionCard>
      <p className="text-muted-foreground text-[10.5px] leading-relaxed">
        评分口径：ERROR 只表示运行/模型侧失败（不计入产品失败率）；REVIEW 表示规则项已过但该用例配置了
        llmJudgePrompt 而模型评判尚未接入；FAIL 才是产品问题。用户输入的风险意图与「最终回复是否安全」分开判定——
        安全回复不会因为问题本身风险高就被判失败。
      </p>
    </div>
  );
}
