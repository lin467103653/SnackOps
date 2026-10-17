import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { deriveMandatoryCapabilities } from "@/lib/agent/capabilities";
import { getPlannerConfig } from "@/lib/agent/planner-config";
import { runPlanner } from "@/lib/agent/planner";
import { validatePlan } from "@/lib/agent/plan-validator";
import { getLlmStatus } from "@/lib/llm";
import { listEnabledSkills } from "@/lib/skills/registry";
import { listEnabledTools } from "@/lib/tools/registry";
import { plannerPreviewSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/planner/preview —— 只跑 Planner + Validator，不执行 Skill/Tool。
 * 用来回答「如果现在问这个问题，Planner 会怎么选、校验会不会拦」。
 */
export async function POST(request: Request) {
  const status = await getLlmStatus();
  if (!status.configured) {
    return jsonError(status.hint ?? "未配置 LLM Provider，无法预览计划", 503, {
      code: "LLM_NOT_CONFIGURED",
      missing: status.missing,
    });
  }

  try {
    const input = await parseJsonBody(request, plannerPreviewSchema);
    const [config, enabledSkills, enabledTools] = await Promise.all([
      getPlannerConfig(),
      listEnabledSkills(),
      listEnabledTools(),
    ]);

    const allowedSkills = new Set(input.allowedSkills ?? config.allowedSkills);
    const allowedTools = new Set(input.allowedTools ?? config.allowedTools);
    const skills = allowedSkills.size > 0 ? enabledSkills.filter((skill) => allowedSkills.has(skill.id)) : enabledSkills;
    const tools = allowedTools.size > 0 ? enabledTools.filter((tool) => allowedTools.has(tool.id)) : enabledTools;

    const derived = deriveMandatoryCapabilities(input.question);
    const mandatoryCapabilities =
      input.mandatoryCapabilities && input.mandatoryCapabilities.length > 0
        ? input.mandatoryCapabilities
        : [...new Set([...derived, ...config.defaultMandatoryCapabilities])];

    const planner = await runPlanner({
      question: input.question,
      history: [],
      skills,
      tools,
      mandatoryCapabilities,
      systemPrompt: config.systemPrompt,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    const outcome = validatePlan(planner.plan, { skills, tools, mandatoryCapabilities });

    return jsonOk({
      question: input.question,
      mandatoryCapabilities,
      derivedCapabilities: derived,
      plan: outcome.plan,
      plannerPlan: planner.plan,
      parseOk: planner.parseOk,
      parseError: planner.parseError,
      validation: outcome.validation,
      addedSkills: outcome.addedSkills,
      addedTools: outcome.addedTools,
      coverage: outcome.coverage,
      catalog: {
        skills: skills.map((skill) => ({ id: skill.id, name: skill.name, capabilities: skill.capabilities })),
        tools: tools.map((tool) => ({ id: tool.id, name: tool.name })),
      },
      plannerVersion: config.version,
      provider: planner.provider,
      model: planner.model,
      fixture: planner.fixture,
      latencyMs: planner.latencyMs,
      raw: planner.raw.slice(0, 4000),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
