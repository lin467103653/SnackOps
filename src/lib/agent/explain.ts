/**
 * 解释一条运行 / 一个风险判断。
 *
 * - 有 runId：把 RunRecord 交给模型解释（fixture 则用确定性模板，素材同样来自真实记录）；
 * - 只有 question：给出「这条问题会被识别成什么场景、需要哪些能力」的确定性分析。
 */
import { complete } from "../llm";
import { evaluateRisk } from "../risk/rules";
import { deriveMandatoryCapabilities, labelForCapability } from "./capabilities";
import { explainMessages } from "./prompts";
import { getAgentRun } from "./run-store";

export interface ExplainResult {
  explanation: string;
  provider: string;
  model: string;
  fixture: boolean;
  basis: string[];
}

function summarizeRun(run: NonNullable<Awaited<ReturnType<typeof getAgentRun>>>) {
  return {
    id: run.id,
    question: run.question,
    status: run.status,
    provider: run.provider,
    model: run.model,
    plan: run.plan,
    planValidation: run.planValidation,
    riskResult: run.riskResult,
    error: run.error,
    steps: run.steps.map((step) => ({
      stepId: step.stepId,
      type: step.type,
      name: step.name,
      status: step.status,
      durationMs: step.durationMs,
      error: step.error,
    })),
  };
}

export async function explainRun(runId: string): Promise<ExplainResult> {
  const run = await getAgentRun(runId);
  if (!run) throw new Error(`运行记录不存在：${runId}`);

  const result = await complete(explainMessages({ runSummary: summarizeRun(run), question: run.question }), {
    task: "explain",
    temperature: 0.2,
    maxTokens: 1200,
  });

  return {
    explanation: result.text,
    provider: result.provider,
    model: result.model,
    fixture: result.fixture,
    basis: [
      `RunRecord ${run.id}（${run.status}）`,
      `Plan 选择 ${run.plan?.selectedSkills.length ?? 0} 个 Skill / ${run.plan?.selectedTools.length ?? 0} 个 Tool`,
      `Trace ${run.steps.length} 步`,
      run.riskResult ? `风险结论：${run.riskResult.verdict}` : "没有风险结果",
    ],
  };
}

export function explainQuestion(question: string): ExplainResult {
  const capabilities = deriveMandatoryCapabilities(question);
  const risk = evaluateRisk(question);

  const lines = [
    "# 问题分析（未调用模型）",
    "",
    `问题：${question}`,
    "",
    "## 会被识别出的必需能力",
    ...capabilities.map((capability) => `- ${labelForCapability(capability)}（${capability}）`),
    "",
    "## 需要的 Tool",
    ...capabilities
      .map((capability): string | null => {
        if (capability === "price") return "- calculate_price（价格试算）";
        if (capability === "order") return "- query_orders（订单查询）";
        if (capability === "logistics") return "- query_logistics（物流查询）";
        return null;
      })
      .filter((line): line is string => line !== null),
    "",
    "## 风险预判（R1–R8 规则引擎）",
    ...(risk.findings.length === 0
      ? ["- 问题文本本身没有命中阻断规则；具体回复仍要过 risk-check"]
      : risk.findings.map((finding) => `- 命中 ${finding.ruleId}：${finding.evidence}`)),
    "",
    "> 该分析是确定性的（基于能力词典与风险规则），不依赖模型。",
  ];

  return {
    explanation: lines.join("\n"),
    provider: "rule-engine",
    model: "capability-rules",
    fixture: false,
    basis: [`能力推导 ${capabilities.length} 项`, `风险规则命中 ${risk.findings.length} 条`],
  };
}
