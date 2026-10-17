/**
 * Agent 编排器：Planner → Validator → Executor → 持久化。
 *
 * 这里不产出任何业务答案，只负责把各环节串起来、把事件发出去、把 RunRecord 落盘。
 * 能力不足 / 校验失败 / 风险阻断都会落到明确的 status 与 error，不会伪装成功。
 */
import { LlmError, resolveProvider } from "../llm";
import { getUsers } from "../data";
import { getPlannerConfig } from "./planner-config";
import { listEnabledSkills, listSkills } from "../skills/registry";
import { listEnabledTools, listTools } from "../tools/registry";
import type {
  AgentPlan,
  AgentRunRecord,
  AgentRunStep,
  AgentRunSource,
  PlanValidation,
  RiskResult,
} from "../types";
import { deriveMandatoryCapabilities } from "./capabilities";
import { executePlan, type FaultConfig } from "./executor";
import { runPlanner } from "./planner";
import { validatePlan } from "./plan-validator";
import { appendAgentRun } from "./run-store";

export type AgentEvent =
  | { type: "run_start"; runId: string; provider: string; model: string; fixture: boolean; question: string; mandatoryCapabilities: string[] }
  | { type: "plan"; plan: AgentPlan; parseOk: boolean; parseError: string | null; latencyMs: number; provider: string; model: string }
  | { type: "validation"; validation: PlanValidation; addedSkills: string[]; addedTools: string[] }
  | { type: "step"; step: AgentRunStep }
  | { type: "risk"; riskResult: RiskResult }
  | { type: "final"; finalReply: string | null; status: AgentRunRecord["status"]; error: string | null; durationMs: number }
  | { type: "error"; code: string; message: string; hint: string | null }
  | { type: "done"; runId: string; status: AgentRunRecord["status"]; durationMs: number };

export interface RunAgentInput {
  question: string;
  source: AgentRunSource;
  conversationId?: string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  userId?: string;
  faults?: FaultConfig;
  retryOf?: string | null;
}

export type Emit = (event: AgentEvent) => void;

function newRunId(): string {
  return `arun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function blockedReply(): string {
  return "这个问题涉及的内容需要人工同事一起确认，我已经把你的描述同步过去，15 分钟内会有专人回复你具体方案。";
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function runAgent(input: RunAgentInput, emit: Emit): Promise<AgentRunRecord> {
  const startedAt = performance.now();
  const runId = newRunId();
  const createdAt = nowIso();
  const history = input.conversationHistory ?? [];

  const [enabledSkills, enabledTools] = await Promise.all([listEnabledSkills(), listEnabledTools()]);
  const [allSkills, allTools] = await Promise.all([listSkills(), listTools()]);
  if (allSkills.length === 0 || allTools.length === 0) {
    throw new LlmError("CONFIG", "Skill / Tool 注册表为空，请先运行 pnpm seed:reset");
  }

  // Planner 配置：白名单过滤 + 系统提示词 + 模型参数都来自 data/planner-config.json
  const plannerConfig = await getPlannerConfig();
  const allowedSkills = plannerConfig.allowedSkills.length > 0 ? new Set(plannerConfig.allowedSkills) : null;
  const allowedTools = plannerConfig.allowedTools.length > 0 ? new Set(plannerConfig.allowedTools) : null;
  const skills = allowedSkills ? enabledSkills.filter((skill) => allowedSkills.has(skill.id)) : enabledSkills;
  const tools = allowedTools ? enabledTools.filter((tool) => allowedTools.has(tool.id)) : enabledTools;

  const mandatoryCapabilities = deriveMandatoryCapabilities(input.question);
  const steps: AgentRunStep[] = [];
  const emitStep: Emit = (event) => emit(event);
  const onStep = (step: AgentRunStep) => {
    steps.push(step);
    emitStep({ type: "step", step });
  };

  let provider = "unknown";
  let model = "unknown";
  let fixture = false;
  let isNewCustomer: boolean | undefined;

  if (input.userId) {
    const users = await getUsers();
    isNewCustomer = users.find((user) => user.id === input.userId)?.isNewCustomer;
  }

  const skillVersions: Record<string, string> = {};
  const toolVersions: Record<string, string> = {};

  try {
    // 0. Provider 必须在开始前就可用：缺配置属于「未开始」而不是「运行失败」
    const resolved = await resolveProviderInfo();
    provider = resolved.provider;
    model = resolved.model;
    fixture = resolved.fixture;

    emit({
      type: "run_start",
      runId,
      provider,
      model,
      fixture,
      question: input.question,
      mandatoryCapabilities,
    });

    // 1. Planner
    const plannerStartedAt = nowIso();
    const plannerStarted = performance.now();
    const planner = await runPlanner({
      question: input.question,
      history,
      skills,
      tools,
      mandatoryCapabilities,
      systemPrompt: plannerConfig.systemPrompt,
      model: plannerConfig.model,
      temperature: plannerConfig.temperature,
      maxTokens: plannerConfig.maxTokens,
    });
    const planStep: AgentRunStep = {
      stepId: "step_01",
      type: "planner",
      name: "Planner 生成计划",
      status: planner.parseOk ? "success" : "error",
      input: { question: input.question, mandatoryCapabilities, availableSkills: skills.length, availableTools: tools.length },
      output: { plan: planner.plan, raw: planner.raw.slice(0, 2000) },
      durationMs: Math.round(performance.now() - plannerStarted),
      error: planner.parseError,
      startedAt: plannerStartedAt,
    };
    onStep(planStep);
    emit({
      type: "plan",
      plan: planner.plan,
      parseOk: planner.parseOk,
      parseError: planner.parseError,
      latencyMs: planner.latencyMs,
      provider: planner.provider,
      model: planner.model,
    });

    // 2. Validator
    const validatorStarted = performance.now();
    const outcome = validatePlan(planner.plan, {
      skills,
      tools,
      mandatoryCapabilities,
    });
    const validationStep: AgentRunStep = {
      stepId: "step_02",
      type: "validation",
      name: "Plan 校验",
      status: outcome.validation.ok ? "success" : "error",
      input: { selectedSkills: planner.plan.selectedSkills, selectedTools: planner.plan.selectedTools },
      output: {
        errors: outcome.validation.errors,
        warnings: outcome.validation.warnings,
        coverage: outcome.coverage,
      },
      durationMs: Math.round(performance.now() - validatorStarted),
      error: outcome.validation.ok ? null : outcome.validation.errors.join("；"),
      startedAt: new Date().toISOString(),
    };
    onStep(validationStep);
    emit({
      type: "validation",
      validation: outcome.validation,
      addedSkills: outcome.addedSkills,
      addedTools: outcome.addedTools,
    });

    const plan = outcome.plan;
    for (const skillId of plan.selectedSkills) {
      const skill = skills.find((candidate) => candidate.id === skillId);
      if (skill) skillVersions[skillId] = skill.version;
    }
    for (const toolId of plan.selectedTools) {
      const tool = tools.find((candidate) => candidate.id === toolId);
      if (tool) toolVersions[toolId] = tool.version;
    }

    // 3. 校验不通过 / Planner 主动转人工 → 明确阻断
    if (!outcome.validation.ok || plan.degradation?.handoff) {
      const reason = outcome.validation.ok
        ? (plan.degradation?.reason ?? "Planner 声明转人工")
        : outcome.validation.errors.join("；");
      const reply = blockedReply();
      const riskResult: RiskResult = {
        verdict: "skipped",
        findings: [],
        rewritten: null,
        checkedAt: nowIso(),
        checkedBy: "none",
        note: "运行在计划校验阶段被阻断，未进入常规回复环节",
      };

      onStep({
        stepId: `step_${String(steps.length + 1).padStart(2, "0")}`,
        type: "finalize",
        name: "校验未通过，转人工兜底",
        status: "error",
        input: { reason },
        output: { reply },
        durationMs: 0,
        error: reason,
        startedAt: nowIso(),
      });

      const record: AgentRunRecord = {
        id: runId,
        question: input.question,
        source: input.source,
        conversationId: input.conversationId ?? runId,
        createdAt,
        status: "blocked",
        finalReply: reply,
        plan,
        planValidation: outcome.validation,
        steps,
        riskResult,
        durationMs: Math.round(performance.now() - startedAt),
        error: reason,
        provider,
        model,
        skillVersions,
        toolVersions,
        notice: fixture ? "课堂演示模式：由确定性 fixture 生成，未调用外部模型" : null,
        handoff: null,
        retryOf: input.retryOf ?? null,
        conversationHistory: history,
      };

      await appendAgentRun(record);
      emit({ type: "risk", riskResult });
      emit({ type: "final", finalReply: reply, status: record.status, error: record.error, durationMs: record.durationMs });
      emit({ type: "done", runId, status: record.status, durationMs: record.durationMs });
      return record;
    }

    // 4. Executor
    const execution = await executePlan({
      plan,
      question: input.question,
      history,
      skills,
      tools,
      isNewCustomer,
      faults: input.faults,
      onStep: (step) => emitStep({ type: "step", step }),
    });

    const record: AgentRunRecord = {
      id: runId,
      question: input.question,
      source: input.source,
      conversationId: input.conversationId ?? runId,
      createdAt,
      status: execution.status,
      finalReply: execution.finalReply,
      plan,
      planValidation: outcome.validation,
      steps: [...steps, ...execution.steps],
      riskResult: execution.riskResult,
      durationMs: Math.round(performance.now() - startedAt),
      error: execution.error,
      provider,
      model,
      skillVersions,
      toolVersions,
      notice: fixture ? "课堂演示模式：由确定性 fixture 生成，未调用外部模型" : null,
      handoff: null,
      retryOf: input.retryOf ?? null,
      conversationHistory: history,
    };

    if (execution.riskResult) emit({ type: "risk", riskResult: execution.riskResult });

    await appendAgentRun(record);
    emit({
      type: "final",
      finalReply: record.finalReply,
      status: record.status,
      error: record.error,
      durationMs: record.durationMs,
    });
    emit({ type: "done", runId, status: record.status, durationMs: record.durationMs });
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const hint = error instanceof LlmError ? error.hint : null;

    emit({ type: "error", code: error instanceof LlmError ? error.code : "INTERNAL", message, hint });

    if (error instanceof LlmError && error.code === "CONFIG") {
      // 未配置 Provider：不落盘假记录，直接抛出交给 API 层返回结构化错误
      throw error;
    }

    const record: AgentRunRecord = {
      id: runId,
      question: input.question,
      source: input.source,
      conversationId: input.conversationId ?? runId,
      createdAt,
      status: "failed",
      finalReply: null,
      plan: null,
      planValidation: null,
      steps,
      riskResult: null,
      durationMs: Math.round(performance.now() - startedAt),
      error: message,
      provider,
      model,
      skillVersions,
      toolVersions,
      notice: fixture ? "课堂演示模式：由确定性 fixture 生成，未调用外部模型" : null,
      handoff: null,
      retryOf: input.retryOf ?? null,
      conversationHistory: history,
    };

    await appendAgentRun(record).catch(() => undefined);
    emit({ type: "done", runId, status: record.status, durationMs: record.durationMs });
    return record;
  }
}

/** planner/validation 步骤已在 steps 中，executor 的步骤用 exec_ 前缀，直接拼接即可 */
async function resolveProviderInfo(): Promise<{ provider: string; model: string; fixture: boolean }> {
  const provider = await resolveProvider();
  return { provider: provider.id, model: provider.model, fixture: provider.fixture };
}
