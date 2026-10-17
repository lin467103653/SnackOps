/**
 * 运营中心的确定性聚类与 Prompt 草案生成。
 *
 * 明确边界：这里是**规则聚类**，不是 LLM 分析。
 * 规则只依赖 RunRecord / Rating / Annotation 的既有字段，可解释、可复现。
 */
import type { AgentRunRecord, Annotation, Improvement, Rating } from "../types";

export interface ClusterSample {
  runId: string;
  question: string;
  reply: string | null;
  score: number | null;
}

export interface ImprovementCluster {
  key: string;
  rule: string;
  label: string;
  direction: Direction;
  detail: string;
  priority: "P0" | "P1" | "P2";
  sampleCount: number;
  samples: ClusterSample[];
  /** 建议关联的 Skill（可为空：Planner/Tool/Eval 方向可能不挂具体 Skill） */
  suggestedSkillId: string | null;
  existingImprovementId: string | null;
}

type Direction = "Planner" | "Skill" | "Tool" | "Eval";

const CAPABILITY_TO_SKILL: Array<{ capability: string; skillId: string }> = [
  { capability: "after_sales", skillId: "after-sales-classification" },
  { capability: "logistics", skillId: "human-handoff-decision" },
  { capability: "order", skillId: "human-handoff-decision" },
  { capability: "complaint", skillId: "complaint-triage" },
  { capability: "safety", skillId: "allergy-risk-reminder" },
  { capability: "recommendation", skillId: "recommendation-decision" },
  { capability: "price", skillId: "response-generator" },
  { capability: "risk", skillId: "risk-check" },
  { capability: "reply", skillId: "response-generator" },
];

export function inferSkillForRun(run: AgentRunRecord): string | null {
  const capabilities = run.plan?.mandatoryCapabilities ?? [];
  for (const mapping of CAPABILITY_TO_SKILL) {
    if (capabilities.includes(mapping.capability)) return mapping.skillId;
  }
  return run.plan?.selectedSkills[0] ?? null;
}

function toSample(run: AgentRunRecord, score: number | null): ClusterSample {
  return {
    runId: run.id,
    question: run.question,
    reply: run.finalReply,
    score,
  };
}

/**
 * 五条规则：
 * R1 风险拦截（block/合规风险标注）→ Planner（提示词/规则边界）
 * R2 工具失败（tool 步骤 error/timeout）→ Tool
 * R3 计划被阻断（status=blocked 且有校验错误）→ Planner
 * R4 低分回复（评分 ≤2，按意图分组）→ Skill
 * R5 知识缺口（标注 tag=知识缺口）→ Eval
 */
export function buildClusters(input: {
  runs: AgentRunRecord[];
  ratings: Rating[];
  annotations: Annotation[];
  improvements: Improvement[];
}): ImprovementCluster[] {
  const { runs, ratings, annotations, improvements } = input;
  const runById = new Map(runs.map((run) => [run.id, run]));
  const clusters: ImprovementCluster[] = [];
  const existing = new Map<string, string>();
  for (const improvement of improvements) {
    if (improvement.cluster?.rule) existing.set(improvement.cluster.rule, improvement.id);
  }

  const ratingByRun = new Map<string, Rating>();
  for (const rating of ratings) {
    if (rating.targetType !== "agent_run") continue;
    ratingByRun.set(rating.runId, rating);
  }

  // R2 工具失败
  const toolFailures = runs.filter((run) =>
    run.steps.some((step) => step.type === "tool" && (step.status === "error" || step.status === "timeout")),
  );
  if (toolFailures.length > 0) {
    clusters.push({
      key: "rule:tool_failure",
      rule: "R2 工具失败",
      label: "工具调用失败导致运行中断",
      direction: "Tool",
      detail: `检测到 ${toolFailures.length} 条运行中存在 tool 步骤 error/timeout；建议补齐超时/重试或入参兜底。`,
      priority: "P1",
      sampleCount: toolFailures.length,
      samples: toolFailures.slice(0, 3).map((run) => toSample(run, ratingByRun.get(run.id)?.score ?? null)),
      suggestedSkillId: null,
      existingImprovementId: existing.get("R2 工具失败") ?? null,
    });
  }

  // R1 风险拦截
  const riskRuns = runs.filter(
    (run) =>
      run.riskResult?.verdict === "block" ||
      annotations.some((annotation) => annotation.targetId === run.id && annotation.tag === "合规风险"),
  );
  if (riskRuns.length > 0) {
    clusters.push({
      key: "rule:risk_block",
      rule: "R1 风险拦截",
      label: "回复被风险规则阻断，需要改写或补规则",
      direction: "Planner",
      detail: `共 ${riskRuns.length} 条运行命中风险阻断；建议检查 Planner 选路与 risk-check 提示词的边界描述。`,
      priority: "P0",
      sampleCount: riskRuns.length,
      samples: riskRuns.slice(0, 3).map((run) => toSample(run, ratingByRun.get(run.id)?.score ?? null)),
      suggestedSkillId: "risk-check",
      existingImprovementId: existing.get("R1 风险拦截") ?? null,
    });
  }

  // R3 计划被阻断
  const blockedRuns = runs.filter((run) => run.status === "blocked" && (run.planValidation?.errors.length ?? 0) > 0);
  if (blockedRuns.length > 0) {
    clusters.push({
      key: "rule:plan_blocked",
      rule: "R3 计划被阻断",
      label: "Planner 计划未通过校验（能力缺口 / 非法选择）",
      direction: "Planner",
      detail: `共 ${blockedRuns.length} 条运行在计划校验阶段被阻断；建议核对 Planner 提示词中的选择规则与可选能力范围。`,
      priority: "P0",
      sampleCount: blockedRuns.length,
      samples: blockedRuns.slice(0, 3).map((run) => toSample(run, ratingByRun.get(run.id)?.score ?? null)),
      suggestedSkillId: "response-generator",
      existingImprovementId: existing.get("R3 计划被阻断") ?? null,
    });
  }

  // R4 低分回复（按意图分组）
  const lowRatings = ratings.filter((rating) => rating.targetType === "agent_run" && rating.score <= 2);
  const byIntent = new Map<string, Rating[]>();
  for (const rating of lowRatings) {
    const intent = rating.intent ?? "未分类";
    byIntent.set(intent, [...(byIntent.get(intent) ?? []), rating]);
  }
  for (const [intent, group] of byIntent) {
    const samples = group
      .map((rating) => {
        const run = runById.get(rating.runId);
        return run ? toSample(run, rating.score) : null;
      })
      .filter((sample): sample is ClusterSample => sample !== null);

    const firstRun = group.map((rating) => runById.get(rating.runId)).find(Boolean);
    clusters.push({
      key: `rule:low_rating:${intent}`,
      rule: `R4 低分回复（${intent}）`,
      label: `「${intent}」类问题出现 ${group.length} 条低分回复`,
      direction: "Skill",
      detail: `评分 ≤2 的样本 ${group.length} 条，平均分 ${(
        group.reduce((total, rating) => total + rating.score, 0) / group.length
      ).toFixed(1)}；建议优先改对应 Skill 的提示词与话术约束。`,
      priority: group.length >= 3 ? "P0" : "P1",
      sampleCount: group.length,
      samples: samples.slice(0, 3),
      suggestedSkillId: firstRun ? inferSkillForRun(firstRun) : "response-generator",
      existingImprovementId: existing.get(`R4 低分回复（${intent}）`) ?? null,
    });
  }

  // R5 知识缺口
  const gaps = annotations.filter((annotation) => annotation.tag === "知识缺口");
  if (gaps.length > 0) {
    const samples = gaps
      .map((annotation) => {
        const run = runById.get(annotation.targetId);
        return run ? toSample(run, ratingByRun.get(run.id)?.score ?? null) : null;
      })
      .filter((sample): sample is ClusterSample => sample !== null);

    clusters.push({
      key: "rule:knowledge_gap",
      rule: "R5 知识缺口",
      label: "标注指出知识缺口，缺少对应评测用例",
      direction: "Eval",
      detail: `共 ${gaps.length} 条知识缺口标注；建议沉淀为评测用例并补 FAQ / 政策数据。`,
      priority: "P1",
      sampleCount: gaps.length,
      samples: samples.slice(0, 3),
      suggestedSkillId: "need-extraction",
      existingImprovementId: existing.get("R5 知识缺口") ?? null,
    });
  }

  return clusters.sort((a, b) => {
    const weight = { P0: 0, P1: 1, P2: 2 } as const;
    return weight[a.priority] - weight[b.priority] || b.sampleCount - a.sampleCount;
  });
}

/**
 * 生成 Prompt 改进草案（确定性规则拼接，不调用模型）。
 * 只返回文本，调用方负责落库；绝不在这里写入 Skill。
 */
export function buildPromptDraft(input: {
  currentPrompt: string;
  skillName: string;
  cluster: ImprovementCluster;
  improvementTitle: string;
}): { content: string; changeNote: string } {
  const stamp = new Date().toISOString().slice(0, 10);
  const sampleLines = input.cluster.samples
    .map((sample, index) => `${index + 1}. 用户：${sample.question.slice(0, 60)}（评分 ${sample.score ?? "未评分"}）`)
    .join("\n");

  const section = [
    "",
    `## 运营补充（${stamp} · 规则草案）`,
    "",
    `### 背景`,
    `- 聚类规则：${input.cluster.rule}（规则聚类，非模型分析）`,
    `- 问题：${input.cluster.label}`,
    `- 关联改进项：${input.improvementTitle}`,
    `- 样本数：${input.cluster.sampleCount}`,
    "",
    `### 样本`,
    sampleLines || "（无可用样本）",
    "",
    `### 补充要求`,
    `- 当用户提出同类问题时，先确认关键事实（订单号 / 商品 / 时间），再给结论。`,
    `- 结论必须引用工具返回的真实字段，不得使用「大概 / 应该 / 绝对」等不确定或极限表达。`,
    `- 若信息不足，按 clarification-question 的要求一次只追问 1–2 个关键问题。`,
    `- 涉及售后与赔付时，以 return-policies 的时效与口径为准，不承诺政策外的补偿。`,
    "",
  ].join("\n");

  return {
    content: `${input.currentPrompt.replace(/\s+$/u, "")}\n${section}`,
    changeNote: `规则草案：${input.cluster.rule} → ${input.skillName}`,
  };
}
