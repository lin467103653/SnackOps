/**
 * Plan Validator：独立于 Planner 的守门人。
 *
 * 检查项：
 * 1. 不得调用不存在 / 未启用的 Skill、Tool；
 * 2. mandatoryCapabilities 必须被覆盖（价格需要 calculate_price，订单需要 query_orders，物流需要 query_logistics）；
 * 3. 风险场景必须有 risk-check（否则阻断）；
 * 4. 必须有一个能生成回复的 Skill。
 *
 * 能自动补的能力会补（记 warning），补不齐就记 error —— 由 orchestrator 决定降级或转人工。
 */
import { CAPABILITY_TOOL_HINT, labelForCapability } from "./capabilities";
import type { PlanValidation, Skill, Tool, AgentPlan } from "../types";

export interface ValidatorContext {
  skills: Skill[];
  tools: Tool[];
  mandatoryCapabilities: string[];
}

export interface ValidatorOutcome {
  validation: PlanValidation;
  /** 修复后的 Plan（过滤非法项 + 补充可补能力） */
  plan: AgentPlan;
  addedSkills: string[];
  addedTools: string[];
  coverage: string[];
}

function capabilityCoverage(skillIds: string[], toolIds: string[], skills: Map<string, Skill>): Set<string> {
  const coverage = new Set<string>();
  for (const id of skillIds) {
    for (const capability of skills.get(id)?.capabilities ?? []) coverage.add(capability);
  }
  for (const id of toolIds) {
    // Tool 的能力由 id 反推（与 capabilities.ts 的 TOOL_CAPABILITIES 一致）
    const inferred = Object.entries(CAPABILITY_TOOL_HINT).find(([, toolId]) => toolId === id)?.[0];
    if (inferred) coverage.add(inferred);
    if (id === "query_activities") coverage.add("activity");
    if (id === "query_coupons") coverage.add("coupon");
  }
  return coverage;
}

export function validatePlan(plan: AgentPlan, context: ValidatorContext): ValidatorOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];
  const addedSkills: string[] = [];
  const addedTools: string[] = [];

  const allSkills = new Map(context.skills.map((skill) => [skill.id, skill]));
  const allTools = new Map(context.tools.map((tool) => [tool.id, tool]));
  const enabledSkills = new Map(context.skills.filter((skill) => skill.enabled).map((skill) => [skill.id, skill]));
  const enabledTools = new Map(context.tools.filter((tool) => tool.enabled).map((tool) => [tool.id, tool]));

  // 1. 存在性 + 启用状态
  for (const id of plan.selectedSkills) {
    const skill = allSkills.get(id);
    if (!skill) errors.push(`调用了不存在的 Skill：${id}`);
    else if (!skill.enabled) errors.push(`调用了未启用的 Skill：${skill.name}（${id}）`);
  }
  for (const id of plan.selectedTools) {
    const tool = allTools.get(id);
    if (!tool) errors.push(`调用了不存在的 Tool：${id}`);
    else if (!tool.enabled) errors.push(`调用了未启用的 Tool：${tool.name}（${id}）`);
  }

  // 2. 过滤掉非法项，后面的覆盖检查基于可用能力
  let selectedSkills = [...new Set(plan.selectedSkills)].filter((id) => enabledSkills.has(id));
  let selectedTools = [...new Set(plan.selectedTools)].filter((id) => enabledTools.has(id));

  if (selectedSkills.length > 6) {
    warnings.push(`Skill 选择过多（${selectedSkills.length} 个），已截断到 6 个`);
    selectedSkills = selectedSkills.slice(0, 6);
  }

  // 3. 尽力补齐必需能力（Planner 主动转人工时不再补）
  if (!plan.degradation?.handoff) {
    let coverage = capabilityCoverage(selectedSkills, selectedTools, enabledSkills);
    for (const capability of context.mandatoryCapabilities) {
      if (coverage.has(capability)) continue;

      const skill = [...enabledSkills.values()].find((candidate) => candidate.capabilities.includes(capability));
      if (skill) {
        selectedSkills.push(skill.id);
        addedSkills.push(skill.id);
        warnings.push(`Planner 漏选，已自动补充 Skill：${skill.name}（${skill.id}）以覆盖能力 ${labelForCapability(capability)}`);
        coverage = capabilityCoverage(selectedSkills, selectedTools, enabledSkills);
        continue;
      }

      const toolId = CAPABILITY_TOOL_HINT[capability];
      if (toolId && enabledTools.has(toolId)) {
        selectedTools.push(toolId);
        addedTools.push(toolId);
        warnings.push(`Planner 漏选，已自动补充 Tool：${toolId} 以覆盖能力 ${labelForCapability(capability)}`);
        coverage = capabilityCoverage(selectedSkills, selectedTools, enabledSkills);
      }
    }
  }

  // 4. 复核覆盖情况
  const coverage = capabilityCoverage(selectedSkills, selectedTools, enabledSkills);
  for (const capability of context.mandatoryCapabilities) {
    if (coverage.has(capability)) continue;

    if (capability === "price") {
      errors.push("价格场景缺少价格 Tool：calculate_price 未启用或未被选择");
    } else if (capability === "order") {
      errors.push("订单场景缺少订单 Tool：query_orders 未启用或未被选择");
    } else if (capability === "logistics") {
      errors.push("物流场景缺少物流 Tool：query_logistics 未启用或未被选择");
    } else if (capability === "risk") {
      errors.push("风险场景缺少风险检查：risk-check 未启用或未被选择（必须阻断或转人工）");
    } else if (capability === "reply") {
      errors.push("没有可生成回复的 Skill：需要一个 capabilities 含 reply 的 Skill（例如 response-generator）");
    } else {
      errors.push(`缺少必需能力：${labelForCapability(capability)}（${capability}）没有被任何已选能力覆盖`);
    }
  }

  // 5. 风险声明与选择是否一致
  if (plan.riskAssessment.needsRiskCheck && !coverage.has("risk") && context.mandatoryCapabilities.includes("risk")) {
    if (!plan.degradation?.handoff) {
      errors.push("Plan 声明需要风险审查，但没有选择 risk-check");
    }
  }

  if (plan.degradation?.handoff) {
    warnings.push(`Planner 声明转人工：${plan.degradation.reason ?? "未说明原因"}`);
  }
  if (plan.degradation?.degraded && !plan.degradation.handoff) {
    warnings.push("Planner 声明降级执行（能力有缺口但继续尝试）");
  }

  const repairedPlan: AgentPlan = {
    ...plan,
    selectedSkills,
    selectedTools,
    mandatoryCapabilities: context.mandatoryCapabilities,
    degradation: plan.degradation ?? null,
  };

  return {
    validation: {
      ok: errors.length === 0,
      errors,
      warnings,
      checkedAt: new Date().toISOString(),
    },
    plan: repairedPlan,
    addedSkills,
    addedTools,
    coverage: [...coverage],
  };
}
