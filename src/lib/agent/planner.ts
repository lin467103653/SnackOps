/**
 * Planner：把「问题 + 可用能力」变成结构化 Plan。
 *
 * 只做规划，不产出用户回复；JSON 解析失败时返回安全 fallback Plan（显式标记降级），
 * 由 Validator 决定是否阻断，页面不会因为一次坏输出崩掉。
 */
import { complete, extractJson, LlmError } from "../llm";
import { planSchema } from "../schemas";
import type { AgentPlan, Skill, Tool } from "../types";
import { plannerMessages } from "./prompts";

export interface PlannerResult {
  plan: AgentPlan;
  parseOk: boolean;
  parseError: string | null;
  raw: string;
  provider: string;
  model: string;
  fixture: boolean;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
}

export interface PlannerArgs {
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  skills: Skill[];
  tools: Tool[];
  mandatoryCapabilities: string[];
  /** Planner 系统提示词（管理后台可编辑） */
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export function fallbackPlan(mandatoryCapabilities: string[], skills: Skill[], reason: string): AgentPlan {
  const replySkills = skills.filter((skill) => skill.capabilities.includes("reply")).map((skill) => skill.id);
  const riskSkills = skills.filter((skill) => skill.capabilities.includes("risk")).map((skill) => skill.id);

  return {
    selectedSkills: [...replySkills.slice(0, 1), ...riskSkills.slice(0, 1)],
    selectedTools: [],
    reasoning: "Planner 输出不可解析：降级为最小安全链路（只生成回复并做风险审查，不做工具调用）",
    mandatoryCapabilities,
    riskAssessment: { level: "high", flags: ["planner_fallback"], needsRiskCheck: true },
    degradation: { degraded: true, handoff: false, reason },
  };
}

export async function runPlanner(args: PlannerArgs): Promise<PlannerResult> {
  const messages = plannerMessages(args);

  let raw = "";
  let provider = "unknown";
  let model = "unknown";
  let fixture = false;
  let latencyMs = 0;
  let usage = { inputTokens: 0, outputTokens: 0 };

  try {
    const result = await complete(messages, {
      task: "plan",
      json: true,
      model: args.model,
      temperature: args.temperature ?? 0.1,
      maxTokens: args.maxTokens ?? 1200,
    });
    raw = result.text;
    provider = result.provider;
    model = result.model;
    fixture = result.fixture;
    latencyMs = result.latencyMs;
    usage = result.usage;
  } catch (error) {
    if (error instanceof LlmError && error.code === "CONFIG") throw error;
    const message = error instanceof Error ? error.message : "未知错误";
    return {
      plan: fallbackPlan(args.mandatoryCapabilities, args.skills, `Planner 调用失败：${message}`),
      parseOk: false,
      parseError: message,
      raw,
      provider,
      model,
      fixture,
      latencyMs,
      usage,
    };
  }

  try {
    const parsed = planSchema.safeParse(extractJson(raw));
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".") || "plan"} ${issue.message}`)
        .join("；");
      return {
        plan: fallbackPlan(args.mandatoryCapabilities, args.skills, `Plan 结构不合法：${detail}`),
        parseOk: false,
        parseError: detail,
        raw,
        provider,
        model,
        fixture,
        latencyMs,
        usage,
      };
    }
    return { plan: parsed.data, parseOk: true, parseError: null, raw, provider, model, fixture, latencyMs, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 解析失败";
    return {
      plan: fallbackPlan(args.mandatoryCapabilities, args.skills, `Plan JSON 解析失败：${message}`),
      parseOk: false,
      parseError: message,
      raw,
      provider,
      model,
      fixture,
      latencyMs,
      usage,
    };
  }
}
