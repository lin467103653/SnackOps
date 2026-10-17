/**
 * 批量评测：每个用例都走同一条 Agent 执行链（runAgent）→ 同一评分器（scoreRun）。
 * 批次里只存「本次真实执行的结果」，不会读取或复制旧批次数据。
 */
import { ApiError } from "../api";
import { loadCollection } from "../collections";
import { runAgent } from "../agent/orchestrator";
import { getLlmRuntimeConfig, getLlmStatus } from "../llm";
import { hashContent } from "../skills/files";
import { listSkills } from "../skills/registry";
import { updateJson } from "../store";
import type { EvalBatchV2, EvalCaseResult, EvalCaseV2, AgentRunRecord } from "../types";
import { scoreRun } from "./scorer";

export const EVALUATOR_VERSION = "rules-v1";
export const EVALUATOR_HASH = hashContent(
  "rules-v1|keyword-and-or|forbidden|price|capability|input-risk|reply-safety|error|review",
);

function makeId(): string {
  return `batch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 用例集指纹：任一字段变化都会让两个批次不可直接比较 */
export function caseSetHash(cases: EvalCaseV2[]): string {
  const normalized = [...cases]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      id: item.id,
      question: item.question,
      keywords: item.expectedKeywords,
      mode: item.keywordMode,
      forbidden: item.forbiddenWords,
      price: item.expectedPrice,
      tolerance: item.priceTolerance,
      risk: item.expectRiskPassed,
      required: item.requiredCapabilities,
      forbiddenCap: item.forbiddenCapabilities,
      judge: item.llmJudgePrompt,
    }));
  return hashContent(JSON.stringify(normalized));
}

export async function listBatches(): Promise<EvalBatchV2[]> {
  const batches = await loadCollection("eval-batch");
  return [...batches].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBatch(id: string): Promise<EvalBatchV2 | null> {
  const batches = await listBatches();
  return batches.find((batch) => batch.id === id) ?? null;
}

export interface CreateBatchInput {
  name?: string;
  versionLabel?: string;
  changeNote?: string;
  caseIds?: string[];
}

export interface CreateBatchResult {
  batch: EvalBatchV2;
  reused: boolean;
}

export async function createBatch(input: CreateBatchInput): Promise<CreateBatchResult> {
  const allCases = await loadCollection("eval-cases");

  let selected: EvalCaseV2[];
  if (input.caseIds === undefined) {
    selected = allCases.filter((item) => item.enabled);
    if (selected.length === 0) throw new ApiError(400, "没有启用的评测用例，无法创建批次");
  } else if (input.caseIds.length === 0) {
    throw new ApiError(400, "caseIds 不能是空数组：请传入要运行的用例 ID，或省略该字段以运行全部启用用例");
  } else {
    const known = new Map(allCases.map((item) => [item.id, item]));
    const invalid = input.caseIds.filter((id) => !known.has(id));
    if (invalid.length > 0) {
      throw new ApiError(400, `存在无效的 caseIds：${invalid.join("、")}`);
    }
    selected = input.caseIds.map((id) => known.get(id)!);
  }

  const unique = [...new Map(selected.map((item) => [item.id, item])).values()];
  const caseIds = unique.map((item) => item.id);
  const setHash = caseSetHash(unique);

  // 幂等：同一套用例若已有运行中的批次，直接复用，避免重复点击产生无法区分的请求
  const running = (await listBatches()).find(
    (batch) =>
      (batch.status === "queued" || batch.status === "running") &&
      batch.caseSetHash === setHash &&
      Date.now() - new Date(batch.createdAt).getTime() < 5 * 60_000,
  );
  if (running) return { batch: running, reused: true };

  const [skills, llmConfig, status] = await Promise.all([listSkills(), getLlmRuntimeConfig(), getLlmStatus()]);
  const skillVersions = Object.fromEntries(skills.filter((skill) => skill.enabled).map((skill) => [skill.id, skill.version]));

  const batch: EvalBatchV2 = {
    id: makeId(),
    name: input.name?.trim() || `批量评测 ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    versionLabel: input.versionLabel?.trim() || "unlabeled",
    changeNote: input.changeNote?.trim() || "",
    caseIds,
    caseSetHash: setHash,
    skillVersions,
    evaluatorVersion: EVALUATOR_VERSION,
    evaluatorHash: EVALUATOR_HASH,
    provider: status.provider ?? "none",
    model: status.model,
    params: { temperature: llmConfig.temperature, maxTokens: llmConfig.maxTokens, plannerModel: llmConfig.plannerModel },
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    status: "queued",
    currentIndex: 0,
    total: caseIds.length,
    passed: 0,
    failed: 0,
    review: 0,
    errors: 0,
    caseResults: [],
  };

  await updateJson<EvalBatchV2[]>("eval-batch.json", (current) => [batch, ...(current ?? [])]);
  return { batch, reused: false };
}

function toResult(evalCase: EvalCaseV2, run: AgentRunRecord | null, error: string | null): EvalCaseResult {
  if (!run) {
    return {
      caseId: evalCase.id,
      caseName: evalCase.name,
      question: evalCase.question,
      status: "ERROR",
      reason: `运行失败：${error ?? "未知错误"}`,
      evidence: ["无 RunRecord"],
      keywordHits: [],
      keywordMisses: evalCase.expectedKeywords,
      forbiddenHits: [],
      expectedPrice: evalCase.expectedPrice,
      mentionedPrice: null,
      riskIssues: [],
      inputRisk: { risky: false, signals: [] },
      replySafety: { safe: true, issues: [] },
      shouldSend: false,
      capabilityPath: { required: [], missing: evalCase.requiredCapabilities, forbidden: [] },
      durationMs: 0,
      runId: null,
      finalReply: null,
      riskVerdict: null,
    };
  }

  const score = scoreRun(evalCase, run);
  return {
    caseId: evalCase.id,
    caseName: evalCase.name,
    question: run.question || evalCase.question,
    status: score.status,
    reason: score.reason,
    evidence: score.evidence,
    keywordHits: score.keywordHits,
    keywordMisses: score.keywordMisses,
    forbiddenHits: score.forbiddenHits,
    expectedPrice: score.expectedPrice,
    mentionedPrice: score.mentionedPrice,
    riskIssues: score.riskIssues,
    inputRisk: score.inputRisk,
    replySafety: score.replySafety,
    shouldSend: score.shouldSend,
    capabilityPath: score.capabilityHits,
    durationMs: score.durationMs,
    runId: run.id,
    finalReply: run.finalReply,
    riskVerdict: run.riskResult?.verdict ?? null,
  };
}

/** 执行批次：逐条真实运行 + 评分，每条都落盘，便于轮询 */
export async function runBatch(batchId: string): Promise<void> {
  const batches = await listBatches();
  const batch = batches.find((item) => item.id === batchId);
  if (!batch) return;

  const allCases = await loadCollection("eval-cases");
  const caseById = new Map(allCases.map((item) => [item.id, item]));
  const cases = batch.caseIds.map((id) => caseById.get(id)).filter((item): item is EvalCaseV2 => Boolean(item));

  const patch = async (next: Partial<EvalBatchV2>) => {
    await updateJson<EvalBatchV2[]>("eval-batch.json", (current) =>
      (current ?? []).map((item) => (item.id === batchId ? { ...item, ...next } : item)),
    );
  };

  await patch({ status: "running", startedAt: nowIso() });

  try {
    for (let index = 0; index < cases.length; index += 1) {
      const evalCase = cases[index]!;
      let run: AgentRunRecord | null = null;
      let error: string | null = null;

      try {
        run = await runAgent(
          { question: evalCase.question, source: "eval", conversationId: `batch-${batchId}` },
          () => {},
        );
      } catch (caught) {
        error = caught instanceof Error ? caught.message : "运行异常";
      }

      const result = toResult(evalCase, run, error);
      const current = await getBatch(batchId);
      if (!current) return; // 被删除

      const caseResults = [...current.caseResults, result];
      await patch({
        caseResults,
        currentIndex: index + 1,
        passed: caseResults.filter((item) => item.status === "PASS").length,
        failed: caseResults.filter((item) => item.status === "FAIL").length,
        review: caseResults.filter((item) => item.status === "REVIEW").length,
        errors: caseResults.filter((item) => item.status === "ERROR").length,
      });
    }

    await patch({ status: "done", finishedAt: nowIso() });
  } catch (caught) {
    await patch({
      status: "error",
      finishedAt: nowIso(),
      caseResults: [
        ...((await getBatch(batchId))?.caseResults ?? []),
        {
          caseId: "batch",
          caseName: "批次执行中断",
          question: "",
          status: "ERROR",
          reason: caught instanceof Error ? caught.message : "批次执行异常",
          evidence: [],
          keywordHits: [],
          keywordMisses: [],
          forbiddenHits: [],
          expectedPrice: null,
          mentionedPrice: null,
          riskIssues: [],
          inputRisk: { risky: false, signals: [] },
          replySafety: { safe: true, issues: [] },
          shouldSend: false,
          capabilityPath: { required: [], missing: [], forbidden: [] },
          durationMs: 0,
          runId: null,
          finalReply: null,
          riskVerdict: null,
        },
      ],
    });
  }
}

export interface BatchComparison {
  comparable: boolean;
  reasons: string[];
  base: { id: string; versionLabel: string; name: string };
  target: { id: string; versionLabel: string; name: string };
  counts: {
    base: { total: number; passed: number; failed: number; review: number; errors: number; passRate: number };
    target: { total: number; passed: number; failed: number; review: number; errors: number; passRate: number };
  };
  fixed: { caseId: string; name: string; from: string; to: string }[];
  regressions: { caseId: string; name: string; from: string; to: string }[];
  newFailures: { caseId: string; name: string; status: string }[];
  changedReplies: { caseId: string; name: string; status: string }[];
  averageDuration: { base: number; target: number; delta: number };
  consistency: {
    caseIds: boolean;
    caseSetHash: boolean;
    evaluator: boolean;
    provider: boolean;
    model: boolean;
    params: boolean;
  };
}

/** 通过率分母排除 ERROR：ERROR 不是产品质量问题 */
export function passRateOf(batch: EvalBatchV2): number {
  const denominator = batch.passed + batch.failed + batch.review;
  return denominator === 0 ? 0 : Math.round((batch.passed / denominator) * 1000) / 1000;
}

export function compareBatches(base: EvalBatchV2, target: EvalBatchV2): BatchComparison {
  const consistency = {
    caseIds: base.caseIds.join(",") === target.caseIds.join(","),
    caseSetHash: base.caseSetHash === target.caseSetHash,
    evaluator: base.evaluatorHash === target.evaluatorHash,
    provider: base.provider === target.provider,
    model: base.model === target.model,
    params: JSON.stringify(base.params) === JSON.stringify(target.params),
  };

  const reasons: string[] = [];
  if (!consistency.caseIds) reasons.push("两次批次选择的用例不同");
  if (!consistency.caseSetHash) reasons.push("用例快照（问题/关键词/禁词/价格/风控期望）不同");
  if (!consistency.evaluator) reasons.push(`评分器版本不同（${base.evaluatorVersion} vs ${target.evaluatorVersion}）`);
  if (!consistency.provider) reasons.push(`Provider 不同（${base.provider} vs ${target.provider}）`);
  if (!consistency.model) reasons.push(`模型不同（${base.model} vs ${target.model}）`);
  if (!consistency.params) reasons.push("采样参数不同");

  const baseMap = new Map(base.caseResults.map((item) => [item.caseId, item]));
  const targetMap = new Map(target.caseResults.map((item) => [item.caseId, item]));

  const fixed: BatchComparison["fixed"] = [];
  const regressions: BatchComparison["regressions"] = [];
  const newFailures: BatchComparison["newFailures"] = [];
  const changedReplies: BatchComparison["changedReplies"] = [];

  for (const [caseId, targetResult] of targetMap) {
    const baseResult = baseMap.get(caseId);
    if (!baseResult) {
      if (targetResult.status === "FAIL" || targetResult.status === "ERROR") {
        newFailures.push({ caseId, name: targetResult.caseName, status: targetResult.status });
      }
      continue;
    }

    if ((baseResult.status === "FAIL" || baseResult.status === "ERROR") && targetResult.status === "PASS") {
      fixed.push({ caseId, name: targetResult.caseName, from: baseResult.status, to: targetResult.status });
    } else if (baseResult.status === "PASS" && (targetResult.status === "FAIL" || targetResult.status === "ERROR")) {
      regressions.push({ caseId, name: targetResult.caseName, from: baseResult.status, to: targetResult.status });
    } else if (baseResult.status === targetResult.status && baseResult.finalReply !== targetResult.finalReply) {
      changedReplies.push({ caseId, name: targetResult.caseName, status: targetResult.status });
    }
  }

  const avg = (batch: EvalBatchV2) => {
    const results = batch.caseResults.filter((item) => item.caseId !== "batch");
    return results.length === 0 ? 0 : Math.round(results.reduce((sum, item) => sum + item.durationMs, 0) / results.length);
  };

  return {
    comparable: reasons.length === 0,
    reasons,
    base: { id: base.id, versionLabel: base.versionLabel, name: base.name },
    target: { id: target.id, versionLabel: target.versionLabel, name: target.name },
    counts: {
      base: {
        total: base.total,
        passed: base.passed,
        failed: base.failed,
        review: base.review,
        errors: base.errors,
        passRate: passRateOf(base),
      },
      target: {
        total: target.total,
        passed: target.passed,
        failed: target.failed,
        review: target.review,
        errors: target.errors,
        passRate: passRateOf(target),
      },
    },
    fixed,
    regressions,
    newFailures,
    changedReplies,
    averageDuration: { base: avg(base), target: avg(target), delta: avg(target) - avg(base) },
    consistency,
  };
}
