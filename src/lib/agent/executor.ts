/**
 * Executor：严格按 Plan 执行，顺序是「先查数 → 再生成 → 后审查」。
 *
 * - Tool = 真实读 data/*.json 的实现（查询类先跑，下游 Skill 才有事实依据）；
 * - Skill = 一次带该 Skill 系统提示词的模型调用（fixture 也在同一条链路上）；
 * - 每一步记录 stepId / 输入 / 输出 / 耗时 / 状态 / 错误；
 * - Tool 失败不伪装成功：必需能力的 Tool 失败 → 整个运行 failed；
 * - 最终回复生成后一定执行 risk-check，阻断则换成安全回复。
 */
import { LlmError, complete } from "../llm";
import { runTool } from "../tools/registry";
import { ToolError } from "../tools/handlers";
import { buildSafeReply } from "../risk/rules";
import { riskMessages, skillMessages } from "./prompts";
import type { AgentPlan, AgentRunStatus, AgentRunStep, RiskResult, Skill, Tool } from "../types";

export interface FaultConfig {
  tools?: string[];
  skills?: string[];
  mode?: "error" | "timeout";
}

export interface ExecuteArgs {
  plan: AgentPlan;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  skills: Skill[];
  tools: Tool[];
  isNewCustomer?: boolean;
  faults?: FaultConfig;
  onStep: (step: AgentRunStep) => void;
}

export interface ExecuteOutcome {
  steps: AgentRunStep[];
  finalReply: string | null;
  riskResult: RiskResult | null;
  status: AgentRunStatus;
  error: string | null;
}

const SKILL_TIMEOUT_MS = Number(process.env.AGENT_SKILL_TIMEOUT_MS ?? 20_000);
const RISK_TIMEOUT_MS = Number(process.env.AGENT_RISK_TIMEOUT_MS ?? 15_000);
const TOOL_TIMEOUT_MS = Number(process.env.AGENT_TOOL_TIMEOUT_MS ?? 10_000);
const faultsAllowed = process.env.SNACKOPS_ALLOW_FAULTS === "1";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmError("TIMEOUT", `${label} 超时（>${ms}ms）`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const MONEY_KEYS = ["payable", "subtotal", "activityDiscount", "couponDiscount", "totalDiscount"] as const;

/**
 * 已知金额集合 = 工具返回的所有金额（含派生值）+ 用户问题里出现的数字。
 * 用户自己说的预算/门槛不是模型编造的，不能算作价格不一致。
 */
export function collectKnownPrices(toolResults: { toolId: string; output: unknown }[], question = ""): number[] {
  const prices: number[] = [];

  for (const entry of toolResults) {
    const output = entry.output as {
      items?: { price?: number }[];
      lines?: { unitPrice?: number; lineTotal?: number }[];
    } & Record<string, unknown>;

    for (const item of output?.items ?? []) if (typeof item.price === "number") prices.push(item.price);
    for (const line of output?.lines ?? []) {
      if (typeof line.unitPrice === "number") prices.push(line.unitPrice);
      if (typeof line.lineTotal === "number") prices.push(line.lineTotal);
    }
    for (const key of MONEY_KEYS) {
      const value = output?.[key];
      if (typeof value === "number") prices.push(value);
    }
  }

  for (const match of question.matchAll(/(\d+(?:\.\d{1,2})?)/g)) prices.push(Number(match[1]));

  return [...new Set(prices.map((price) => Math.round(price * 100) / 100))];
}

export async function executePlan(args: ExecuteArgs): Promise<ExecuteOutcome> {
  const steps: AgentRunStep[] = [];
  const toolResults: { toolId: string; output: unknown }[] = [];
  const priorSkills: { skillId: string; text: string }[] = [];

  let stepIndex = 0;
  const pushStep = (step: Omit<AgentRunStep, "stepId" | "startedAt"> & { startedAt?: string }) => {
    stepIndex += 1;
    const record: AgentRunStep = {
      stepId: `exec_${String(stepIndex).padStart(2, "0")}`,
      startedAt: step.startedAt ?? new Date().toISOString(),
      ...step,
    } as AgentRunStep;
    steps.push(record);
    args.onStep(record);
    return record;
  };

  const skillById = new Map(args.skills.map((skill) => [skill.id, skill]));
  const toolById = new Map(args.tools.map((tool) => [tool.id, tool]));
  const mandatory = args.plan.mandatoryCapabilities ?? [];

  let fatalError: string | null = null;
  let replyText: string | null = null;

  // ---------- 1. Tool：查询类先跑，给下游 Skill 提供事实 ----------
  for (const toolId of args.plan.selectedTools) {
    if (fatalError) break;
    const tool = toolById.get(toolId);
    if (!tool || !tool.enabled) {
      pushStep({
        type: "tool",
        name: toolId,
        status: "skipped",
        input: { toolId },
        output: null,
        durationMs: 0,
        error: "Tool 未启用或不存在，已跳过",
      });
      continue;
    }

    const startedAt = new Date().toISOString();
    const started = performance.now();
    const input = args.plan.toolInputs?.[tool.id] ?? tool.sampleInput;
    const injected = faultsAllowed && args.faults?.tools?.includes(tool.id);

    try {
      if (injected) throw new ToolError("UPSTREAM", `故障注入：Tool ${tool.id} 返回错误`);

      const executed = await withTimeout(runTool(tool.id, input), TOOL_TIMEOUT_MS, `Tool ${tool.name}`);
      toolResults.push({ toolId: tool.id, output: executed.output });

      pushStep({
        type: "tool",
        name: tool.name,
        status: "success",
        startedAt,
        input: { toolId: tool.id, version: tool.version, args: executed.input },
        output: executed.output,
        durationMs: Math.round(performance.now() - started),
        error: null,
      });
    } catch (error) {
      const isTimeout = error instanceof LlmError && error.code === "TIMEOUT";
      const message = error instanceof Error ? error.message : "Tool 执行失败";

      pushStep({
        type: "tool",
        name: tool.name,
        status: isTimeout ? "timeout" : "error",
        startedAt,
        input: { toolId: tool.id, version: tool.version, args: input },
        output: null,
        durationMs: Math.round(performance.now() - started),
        error: message,
      });

      const capability = tool.id === "calculate_price" ? "price" : tool.id.replace("query_", "");
      const aliases =
        tool.id === "query_orders" ? ["order"] : tool.id === "query_logistics" ? ["logistics"] : [capability];
      if (aliases.some((alias) => mandatory.includes(alias))) {
        fatalError = `必需能力的 Tool 执行失败：${tool.name}（${message}）`;
      }
    }
  }

  // ---------- 2. Skill：基于工具事实生成内容 ----------
  for (const skillId of args.plan.selectedSkills) {
    if (fatalError) break;
    const skill = skillById.get(skillId);
    if (!skill || !skill.enabled) {
      pushStep({
        type: "skill",
        name: skillId,
        status: "skipped",
        input: { skillId },
        output: null,
        durationMs: 0,
        error: "Skill 未启用或不存在，已跳过",
      });
      continue;
    }

    const startedAt = new Date().toISOString();
    const started = performance.now();
    const injectedTimeout = faultsAllowed && args.faults?.skills?.includes(skill.id) && args.faults?.mode === "timeout";

    try {
      if (injectedTimeout) throw new LlmError("TIMEOUT", `故障注入：Skill ${skill.id} 超时`);

      const result = await withTimeout(
        complete(
          skillMessages({
            skill,
            question: args.question,
            history: args.history,
            toolResults,
            priorSkills,
            mandatoryCapabilities: mandatory,
          }),
          { task: "skill", model: skill.model, temperature: skill.temperature, maxTokens: skill.maxTokens },
        ),
        SKILL_TIMEOUT_MS,
        `Skill ${skill.name}`,
      );

      priorSkills.push({ skillId: skill.id, text: result.text });
      if (skill.capabilities.includes("reply")) replyText = result.text;

      pushStep({
        type: "skill",
        name: skill.name,
        status: "success",
        startedAt,
        input: {
          skillId: skill.id,
          version: skill.version,
          model: result.model,
          temperature: skill.temperature,
          provider: result.provider,
          fixture: result.fixture,
        },
        output: { text: result.text, latencyMs: result.latencyMs, usage: result.usage },
        durationMs: Math.round(performance.now() - started),
        error: null,
      });
    } catch (error) {
      const isTimeout = error instanceof LlmError && error.code === "TIMEOUT";
      const message = error instanceof Error ? error.message : "Skill 执行失败";

      pushStep({
        type: "skill",
        name: skill.name,
        status: isTimeout ? "timeout" : "error",
        startedAt,
        input: { skillId: skill.id, version: skill.version, model: skill.model },
        output: null,
        durationMs: Math.round(performance.now() - started),
        error: message,
      });

      if (skill.capabilities.includes("reply")) fatalError = `回复生成 Skill 失败：${message}`;
    }
  }

  // ---------- 3. Risk-check：最终回复生成之后 ----------
  let riskResult: RiskResult | null = null;
  const riskSkill = args.skills.find((skill) => skill.capabilities.includes("risk") && skill.enabled);

  if (!fatalError && replyText) {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const knownPrices = collectKnownPrices(toolResults, args.question);

    if (!riskSkill) {
      riskResult = {
        verdict: "skipped",
        findings: [],
        rewritten: null,
        checkedAt: new Date().toISOString(),
        checkedBy: "none",
        note: "risk-check 未启用，本次没有执行风险审查",
      };
      pushStep({
        type: "risk",
        name: "risk-check",
        status: "skipped",
        startedAt,
        input: { draftReplyLength: replyText.length },
        output: riskResult,
        durationMs: 0,
        error: "risk-check 未启用",
      });
    } else {
      try {
        const result = await withTimeout(
          complete(
            riskMessages({
              question: args.question,
              draftReply: replyText,
              knownPrices,
              isNewCustomer: args.isNewCustomer,
            }),
            { task: "risk", json: true, model: riskSkill.model, temperature: 0, maxTokens: 1200 },
          ),
          RISK_TIMEOUT_MS,
          "risk-check",
        );

        riskResult = parseRiskVerdict(result.text, riskSkill.id);
        pushStep({
          type: "risk",
          name: riskSkill.name,
          status: "success",
          startedAt,
          input: { skillId: riskSkill.id, draftReply: replyText.slice(0, 600), knownPrices },
          output: riskResult,
          durationMs: Math.round(performance.now() - started),
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "风险审查失败";
        riskResult = {
          verdict: "block",
          findings: [],
          rewritten: buildSafeReply([]),
          checkedAt: new Date().toISOString(),
          checkedBy: riskSkill.id,
          note: `风险审查执行失败，按阻断处理：${message}`,
        };
        pushStep({
          type: "risk",
          name: riskSkill.name,
          status: "error",
          startedAt,
          input: { skillId: riskSkill.id },
          output: null,
          durationMs: Math.round(performance.now() - started),
          error: message,
        });
      }
    }
  }

  // ---------- 4. 汇总 ----------
  if (fatalError) {
    pushStep({
      type: "finalize",
      name: "终止执行",
      status: "error",
      input: { reason: fatalError },
      output: null,
      durationMs: 0,
      error: fatalError,
    });
    return { steps, finalReply: null, riskResult, status: "failed", error: fatalError };
  }

  if (!replyText) {
    const error = "链路没有产出最终回复（没有 reply 能力的 Skill 成功执行）";
    pushStep({
      type: "finalize",
      name: "缺少最终回复",
      status: "error",
      input: {},
      output: null,
      durationMs: 0,
      error,
    });
    return { steps, finalReply: null, riskResult, status: "failed", error };
  }

  const blocked = riskResult?.verdict === "block";
  const finalReply = blocked ? (riskResult?.rewritten ?? buildSafeReply(riskResult?.findings ?? [])) : replyText;
  const softErrors = steps
    .filter((step) => step.status === "error" || step.status === "timeout")
    .map((step) => `${step.name}: ${step.error}`);

  pushStep({
    type: "finalize",
    name: blocked ? "风险阻断，已改用安全回复" : "生成最终回复",
    status: "success",
    input: { riskVerdict: riskResult?.verdict ?? "skipped" },
    output: { reply: finalReply },
    durationMs: 0,
    error: null,
  });

  return {
    steps,
    finalReply,
    riskResult,
    status: blocked ? "blocked" : "success",
    error: softErrors.length > 0 ? `部分步骤失败：${softErrors.join("；")}` : null,
  };
}

/** 把模型输出解析成 RiskResult；解析失败按阻断处理（不假装通过） */
export function parseRiskVerdict(text: string, checkedBy: string): RiskResult {
  let parsed: {
    verdict?: string;
    findings?: { ruleId?: string; level?: string; evidence?: string; suggestion?: string }[];
    rewritten?: string | null;
  };

  try {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const candidate = fenced ? fenced[1]!.trim() : text.trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate);
  } catch {
    return {
      verdict: "block",
      findings: [],
      rewritten: buildSafeReply([]),
      checkedAt: new Date().toISOString(),
      checkedBy,
      note: "风险审查输出无法解析，按阻断处理",
    };
  }

  const findings = (parsed.findings ?? []).map((finding) => ({
    ruleId: typeof finding.ruleId === "string" ? finding.ruleId : "R?",
    level: finding.level === "warn" ? ("warn" as const) : ("block" as const),
    evidence: typeof finding.evidence === "string" ? finding.evidence : "",
    suggestion: typeof finding.suggestion === "string" ? finding.suggestion : "",
  }));

  const verdict = parsed.verdict === "allow" && findings.every((finding) => finding.level !== "block") ? "allow" : "block";

  return {
    verdict,
    findings,
    rewritten: verdict === "block" ? (parsed.rewritten ?? buildSafeReply(findings)) : (parsed.rewritten ?? null),
    checkedAt: new Date().toISOString(),
    checkedBy,
    note: verdict === "allow" ? "安全回复可以发送" : "命中阻断规则，已改用安全回复",
  };
}
