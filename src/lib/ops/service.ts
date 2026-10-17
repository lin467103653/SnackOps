/**
 * 运营中心的服务端业务：评分 → 低分路由 → 标注 → 评测用例 / 改进项 → Prompt 草案 → 应用 → 回滚。
 *
 * 关键约束：
 * - 所有写入都走 updateJson（文件锁 + 原子 rename），写前用 zod 校验整个数组；
 * - 生成 Prompt 草案只落 improvement.draft，**不会**改动 Skill；
 * - 应用草案走 saveSkillContent（自动快照旧正文 + 版本 +1），回滚同理。
 */
import { z } from "zod";

import { ApiError } from "../api";
import { OPERATOR } from "../constants";
import { getAbTests, getAgentRuns, getAnnotations, getImprovements, getRuns } from "../data";
import { abTestSchema, annotationSchema, evalCaseSchemaV2, improvementSchema, ratingSchema } from "../schemas";
import { getSkillOrThrow, saveSkillContent } from "../skills/registry";
import { getVersion } from "../skills/versions";
import { updateJson } from "../store";
import type { AbTest, Annotation, EvalCaseV2, Improvement, Rating } from "../types";
import { buildPromptDraft, type ImprovementCluster } from "./clusters";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function mutate<T>(file: string, schema: z.ZodType<T[]>, mutator: (current: T[]) => T[]): Promise<T[]> {
  const { value } = await updateJson<T[]>(file, (current) => {
    const next = mutator(current ?? []);
    const parsed = schema.safeParse(next);
    if (!parsed.success) {
      throw new ApiError(500, `${file} 写入校验失败：${parsed.error.issues[0]?.message ?? "未知错误"}`);
    }
    return parsed.data;
  });
  return value;
}

/* ------------------------------- 服务评分 ------------------------------- */

export interface CreateRatingInput {
  runId: string;
  score: number;
  dimension?: Rating["dimension"];
  comment?: string;
  reviewer?: string;
}

export interface CreateRatingResult {
  rating: Rating;
  /** 低分自动生成的坏案例标注 */
  routedAnnotation: Annotation | null;
}

export async function createRating(input: CreateRatingInput): Promise<CreateRatingResult> {
  if (input.score < 1 || input.score > 5) throw new ApiError(422, "评分必须是 1–5");

  const [agentRuns, legacyRuns] = await Promise.all([getAgentRuns(), getRuns()]);
  const agentRun = agentRuns.find((run) => run.id === input.runId);
  const legacyRun = legacyRuns.find((run) => run.id === input.runId);
  if (!agentRun && !legacyRun) throw new ApiError(404, `运行记录不存在：${input.runId}`);

  const question = agentRun?.question ?? null;
  const reply = agentRun?.finalReply ?? null;
  const intent = agentRun?.plan?.mandatoryCapabilities?.[0] ?? legacyRun?.skillKey ?? null;

  const rating: Rating = {
    id: makeId("rat"),
    runId: input.runId,
    targetType: agentRun ? "agent_run" : "run",
    score: input.score,
    dimension: input.dimension ?? "准确性",
    comment: input.comment?.trim() || (input.score <= 2 ? "低分：需要复盘" : "用户/运营评分"),
    reviewer: input.reviewer?.trim() || OPERATOR,
    createdAt: nowIso(),
    question,
    reply,
    intent,
    routedTo: null,
  };

  let routedAnnotation: Annotation | null = null;

  if (rating.score <= 2) {
    routedAnnotation = {
      id: makeId("ann"),
      targetType: agentRun ? "agent_run" : "run",
      targetId: rating.runId,
      tag: "坏案例",
      note: `低分自动入池（${rating.score} 分）：${rating.comment}`,
      author: OPERATOR,
      createdAt: nowIso(),
      status: "pending",
      dimensions: { overall: rating.score },
      source: "rating",
      evalCaseId: null,
      improvementId: null,
      reviewer: null,
      reviewedAt: null,
    };
    rating.routedTo = { annotationId: routedAnnotation.id, improvementId: null };
  }

  await mutate("ratings.json", z.array(ratingSchema), (current) => [rating, ...current]);
  if (routedAnnotation) {
    await mutate("annotations.json", z.array(annotationSchema), (current) => [routedAnnotation!, ...current]);
  }

  return { rating, routedAnnotation };
}

/* ------------------------------- 数据标注 ------------------------------- */

export interface CreateAnnotationInput {
  targetType: Annotation["targetType"];
  targetId: string;
  tag: Annotation["tag"];
  note: string;
  dimensions?: Annotation["dimensions"];
  status?: Annotation["status"];
  source?: Annotation["source"];
}

export async function createAnnotationRecord(input: CreateAnnotationInput): Promise<Annotation> {
  const [agentRuns, legacyRuns, tickets] = await Promise.all([getAgentRuns(), getRuns(), loadTickets()]);
  const targetSet =
    input.targetType === "agent_run"
      ? new Set(agentRuns.map((run) => run.id))
      : input.targetType === "run"
        ? new Set(legacyRuns.map((run) => run.id))
        : input.targetType === "ticket"
          ? new Set(tickets.map((ticket) => ticket.id))
          : new Set<string>();

  if (targetSet.size > 0 && !targetSet.has(input.targetId)) {
    throw new ApiError(404, `标注目标不存在：${input.targetType} / ${input.targetId}`);
  }

  const annotation: Annotation = {
    id: makeId("ann"),
    targetType: input.targetType,
    targetId: input.targetId,
    tag: input.tag,
    note: input.note,
    author: OPERATOR,
    createdAt: nowIso(),
    status: input.status ?? "pending",
    dimensions: input.dimensions ?? null,
    source: input.source ?? "ops",
    evalCaseId: null,
    improvementId: null,
    reviewer: null,
    reviewedAt: null,
  };

  await mutate("annotations.json", z.array(annotationSchema), (current) => [annotation, ...current]);
  return annotation;
}

async function loadTickets() {
  const { getTickets } = await import("../data");
  return getTickets();
}

export interface AnnotationPatch {
  status?: Annotation["status"];
  dimensions?: Annotation["dimensions"];
  note?: string;
}

export async function patchAnnotation(id: string, patch: AnnotationPatch): Promise<Annotation> {
  let updated: Annotation | null = null;

  await mutate("annotations.json", z.array(annotationSchema), (current) => {
    const index = current.findIndex((annotation) => annotation.id === id);
    if (index < 0) throw new ApiError(404, `标注不存在：${id}`);
    const next: Annotation = {
      ...current[index]!,
      ...(patch.status ? { status: patch.status, reviewer: OPERATOR, reviewedAt: nowIso() } : {}),
      ...(patch.dimensions !== undefined ? { dimensions: patch.dimensions } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    };
    updated = next;
    const list = [...current];
    list[index] = next;
    return list;
  });

  if (!updated) throw new ApiError(500, "更新标注失败");
  return updated;
}

/** 标注 → 评测用例（沉淀）。写入唯一的评测存储 eval-cases.json，字段用 V2 契约 */
export async function annotationToEvalCase(
  annotationId: string,
  options: { skillId?: string } = {},
): Promise<{ annotation: Annotation; evalCase: EvalCaseV2 }> {
  const annotations = await getAnnotations();
  const annotation = annotations.find((item) => item.id === annotationId);
  if (!annotation) throw new ApiError(404, `标注不存在：${annotationId}`);

  const agentRuns = await getAgentRuns();
  const run = agentRuns.find((item) => item.id === annotation.targetId);
  const skillId = options.skillId ?? run?.plan?.selectedSkills[0] ?? "response-generator";
  const question = (run?.question ?? annotation.note).trim();

  const dims = annotation.dimensions ?? {};
  const weak = Object.entries(dims)
    .filter(([, value]) => typeof value === "number" && value <= 3)
    .map(([key]) => key);

  // 标注只能产出「期望行为」文本，写不出机器可判的关键词/禁词/价格。
  // 因此落成 enabled=false：等运营补齐断言再启用，避免 0 断言被评分器误判成 PASS。
  const evalCase: EvalCaseV2 = {
    id: makeId("ev"),
    name: `标注沉淀：${annotation.note.slice(0, 24)}`.slice(0, 40),
    question: question.slice(0, 600),
    category: annotation.tag === "合规风险" ? "安全风控" : annotation.tag === "知识缺口" ? "知识缺口" : "体验优化",
    difficulty: "中等",
    riskLevel: annotation.tag === "合规风险" ? "high" : "low",
    expectedBehavior:
      weak.length > 0
        ? `维度 ${weak.join("、")} 需要 ≥4 分：回答需可验证、不夸大、不含政策外承诺`
        : "回答需引用工具返回的真实字段，不得出现极限词与政策外承诺",
    expectedReply: "",
    expectedKeywords: [],
    keywordMode: "AND",
    forbiddenWords: [],
    expectedPrice: null,
    priceTolerance: 0.01,
    expectRiskPassed: true,
    requiredCapabilities: [],
    forbiddenCapabilities: [],
    evalDimension: annotation.tag === "合规风险" ? "安全性" : "准确性",
    llmJudgePrompt: null,
    tags: ["运营标注", annotation.tag, skillId],
    sourceRunId: run?.id ?? null,
    createdAt: nowIso(),
    enabled: false,
  };

  await mutate("eval-cases.json", z.array(evalCaseSchemaV2), (current) => [evalCase, ...current]);
  const nextAnnotation = await patchAnnotation(annotationId, { status: "accepted" });
  const withCase = await mutate("annotations.json", z.array(annotationSchema), (current) =>
    current.map((item) => (item.id === annotationId ? { ...item, evalCaseId: evalCase.id } : item)),
  );

  return { annotation: withCase.find((item) => item.id === annotationId) ?? nextAnnotation, evalCase };
}

/** 标注 → 改进项 */
export async function annotationToImprovement(annotationId: string): Promise<{ annotation: Annotation; improvement: Improvement }> {
  const annotations = await getAnnotations();
  const annotation = annotations.find((item) => item.id === annotationId);
  if (!annotation) throw new ApiError(404, `标注不存在：${annotationId}`);

  const agentRuns = await getAgentRuns();
  const run = agentRuns.find((item) => item.id === annotation.targetId);
  const skillId = run?.plan?.selectedSkills[0] ?? "response-generator";

  const improvement: Improvement = {
    id: makeId("imp"),
    title: `标注转化：${annotation.note.slice(0, 30)}`,
    source: "annotation",
    skillKey: skillId,
    priority: annotation.tag === "合规风险" ? "P0" : "P1",
    status: "待评估",
    owner: OPERATOR,
    expectedGain: "减少同类标注复发",
    createdAt: nowIso(),
    dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    linkedRuns: run ? [run.id] : [],
    direction: "Skill",
    cluster: null,
    samples: run
      ? [{ runId: run.id, question: run.question, reply: run.finalReply, score: annotation.dimensions?.overall ?? null }]
      : [],
    draft: null,
    appliedVersion: null,
    appliedAt: null,
  };

  await mutate("improvements.json", z.array(improvementSchema), (current) => [improvement, ...current]);
  const withImprovement = await mutate("annotations.json", z.array(annotationSchema), (current) =>
    current.map((item) => (item.id === annotationId ? { ...item, improvementId: improvement.id } : item)),
  );

  return {
    annotation: withImprovement.find((item) => item.id === annotationId)!,
    improvement,
  };
}

/* ------------------------------ 改进建议中心 ------------------------------ */

export async function createImprovementFromCluster(cluster: ImprovementCluster): Promise<Improvement> {
  const current = await getImprovements();
  const duplicate = current.find((item) => item.cluster?.rule === cluster.rule);
  if (duplicate) {
    throw new ApiError(409, `该聚类已经存在改进项：${duplicate.title}（${duplicate.id}）`);
  }

  const improvement: Improvement = {
    id: makeId("imp"),
    title: `[规则聚类] ${cluster.label}`.slice(0, 60),
    source: cluster.rule.startsWith("R4") ? "rating" : cluster.rule.startsWith("R5") ? "annotation" : "badcase",
    skillKey: cluster.suggestedSkillId ?? "response-generator",
    priority: cluster.priority,
    status: "待评估",
    owner: OPERATOR,
    expectedGain: `预计减少 ${Math.max(1, Math.round(cluster.sampleCount * 0.6))} 条同类问题`,
    createdAt: nowIso(),
    dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    linkedRuns: cluster.samples.map((sample) => sample.runId),
    direction: cluster.direction,
    cluster: {
      rule: cluster.rule,
      label: cluster.label,
      sampleRunIds: cluster.samples.map((sample) => sample.runId),
      sampleCount: cluster.sampleCount,
      detail: cluster.detail,
    },
    samples: cluster.samples,
    draft: null,
    appliedVersion: null,
    appliedAt: null,
  };

  await mutate("improvements.json", z.array(improvementSchema), (list) => [improvement, ...list]);
  return improvement;
}

export async function generatePromptDraft(improvementId: string): Promise<Improvement> {
  const improvements = await getImprovements();
  const improvement = improvements.find((item) => item.id === improvementId);
  if (!improvement) throw new ApiError(404, `改进项不存在：${improvementId}`);
  if (!improvement.cluster) throw new ApiError(409, "该改进项没有规则聚类信息，无法生成草案");
  if (improvement.draft?.status === "applied") throw new ApiError(409, "该草案已经应用过，请先创建新的改进项");

  const targetSkill = await getSkillOrThrow(improvement.skillKey);
  if (!targetSkill.enabled) throw new ApiError(409, `目标 Skill 已停用：${targetSkill.id}，启用后再生成草案`);

  const cluster: ImprovementCluster = {
    key: `rule:${improvement.cluster.rule}`,
    rule: improvement.cluster.rule,
    label: improvement.cluster.label,
    direction: improvement.direction,
    detail: improvement.cluster.detail,
    priority: improvement.priority,
    sampleCount: improvement.cluster.sampleCount,
    samples: improvement.samples ?? [],
    suggestedSkillId: improvement.skillKey,
    existingImprovementId: improvement.id,
  };

  const draftText = buildPromptDraft({
    currentPrompt: targetSkill.systemPrompt,
    skillName: targetSkill.name,
    cluster,
    improvementTitle: improvement.title,
  });

  let updated: Improvement | null = null;
  await mutate("improvements.json", z.array(improvementSchema), (list) => {
    const index = list.findIndex((item) => item.id === improvementId);
    if (index < 0) throw new ApiError(404, `改进项不存在：${improvementId}`);
    const next: Improvement = {
      ...list[index]!,
      draft: {
        skillId: targetSkill.id,
        skillName: targetSkill.name,
        baseVersion: targetSkill.version,
        baseHash: targetSkill.hash,
        content: draftText.content,
        changeNote: draftText.changeNote,
        createdAt: nowIso(),
        status: "draft",
      },
    };
    updated = next;
    const copy = [...list];
    copy[index] = next;
    return copy;
  });

  if (!updated) throw new ApiError(500, "生成草案失败");
  return updated;
}

export async function applyPromptDraft(improvementId: string): Promise<{ improvement: Improvement; version: string; snapshotVersion: string | null }> {
  const improvements = await getImprovements();
  const improvement = improvements.find((item) => item.id === improvementId);
  if (!improvement) throw new ApiError(404, `改进项不存在：${improvementId}`);
  if (!improvement.draft) throw new ApiError(409, "还没有生成 Prompt 草案");
  if (improvement.draft.status !== "draft") throw new ApiError(409, "该草案不是可应用状态");

  const skill = await getSkillOrThrow(improvement.draft.skillId);

  // 应用前必须能定位到「当前正文」的快照：saveSkillContent 会先自动留档再改写
  const saved = await saveSkillContent({
    id: skill.id,
    content: improvement.draft.content,
    changeNote: `应用改进 ${improvement.id}：${improvement.title}`,
  });

  let updated: Improvement | null = null;
  await mutate("improvements.json", z.array(improvementSchema), (list) => {
    const index = list.findIndex((item) => item.id === improvementId);
    if (index < 0) throw new ApiError(404, `改进项不存在：${improvementId}`);
    const next: Improvement = {
      ...list[index]!,
      status: "已上线",
      appliedVersion: saved.skill.version,
      appliedAt: nowIso(),
      draft: list[index]!.draft ? { ...list[index]!.draft!, status: "applied" } : null,
    };
    updated = next;
    const copy = [...list];
    copy[index] = next;
    return copy;
  });

  if (!updated) throw new ApiError(500, "应用改进失败");
  return {
    improvement: updated,
    version: saved.skill.version,
    snapshotVersion: saved.beforeSnapshot?.version ?? null,
  };
}

/* ------------------------------- 版本回滚 ------------------------------- */

export async function rollbackSkill(skillId: string, version: string): Promise<{ skillId: string; restoredFrom: string; newVersion: string }> {
  await getSkillOrThrow(skillId);
  const snapshot = await getVersion(skillId, version);
  if (!snapshot) throw new ApiError(404, `版本不存在：${skillId}@${version}`);

  const saved = await saveSkillContent({
    id: skillId,
    content: snapshot.content,
    changeNote: `回滚到 v${version}（${snapshot.changeNote}）`,
  });

  return { skillId, restoredFrom: version, newVersion: saved.skill.version };
}

/* -------------------------------- A/B 实验 -------------------------------- */

export interface CreateAbTestInput {
  name: string;
  skillKey: string;
  variantA: string;
  variantB: string;
  trafficSplitA?: number;
  metric?: AbTest["metric"];
}

export async function createAbTest(input: CreateAbTestInput): Promise<AbTest> {
  const skill = await getSkillOrThrow(input.skillKey);
  const record: AbTest = {
    id: makeId("ab"),
    name: input.name,
    skillKey: skill.id,
    variantA: input.variantA,
    variantB: input.variantB,
    trafficSplitA: input.trafficSplitA ?? 50,
    metric: input.metric ?? "解决率",
    aValue: 0,
    bValue: 0,
    samples: 0,
    status: "运行中",
    winner: null,
    startedAt: nowIso(),
    endedAt: null,
  };

  await mutate("ab-tests.json", z.array(abTestSchema), (current) => [record, ...current]);
  return record;
}

export async function concludeAbTest(id: string, input: { status?: AbTest["status"]; winner?: AbTest["winner"]; aValue?: number; bValue?: number; samples?: number }): Promise<AbTest> {
  const tests = await getAbTests();
  const existing = tests.find((test) => test.id === id);
  if (!existing) throw new ApiError(404, `AB 实验不存在：${id}`);

  const next: AbTest = {
    ...existing,
    status: input.status ?? existing.status,
    winner: input.winner ?? existing.winner,
    aValue: input.aValue ?? existing.aValue,
    bValue: input.bValue ?? existing.bValue,
    samples: input.samples ?? existing.samples,
    endedAt: input.status === "已结束" ? nowIso() : existing.endedAt,
  };

  await mutate("ab-tests.json", z.array(abTestSchema), (current) =>
    current.map((test) => (test.id === id ? next : test)),
  );
  return next;
}

/** 供页面/导出复用的标注行 */
export function annotationExportRows(annotations: Annotation[]) {
  return annotations.map((annotation) => ({
    id: annotation.id,
    targetType: annotation.targetType,
    targetId: annotation.targetId,
    tag: annotation.tag,
    status: annotation.status,
    source: annotation.source,
    note: annotation.note,
    author: annotation.author,
    createdAt: annotation.createdAt,
    reviewer: annotation.reviewer ?? "",
    reviewedAt: annotation.reviewedAt ?? "",
    correctness: annotation.dimensions?.correctness ?? "",
    relevance: annotation.dimensions?.relevance ?? "",
    completeness: annotation.dimensions?.completeness ?? "",
    safety: annotation.dimensions?.safety ?? "",
    tone: annotation.dimensions?.tone ?? "",
    overall: annotation.dimensions?.overall ?? "",
    evalCaseId: annotation.evalCaseId ?? "",
    improvementId: annotation.improvementId ?? "",
  }));
}
