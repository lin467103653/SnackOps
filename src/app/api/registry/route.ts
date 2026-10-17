import { jsonOk, toErrorResponse } from "@/lib/api";
import { getHandoffRules } from "@/lib/data";
import { listEnabledSkills, listSkills } from "@/lib/skills/registry";
import { listEnabledTools, listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

/**
 * Planner / Executor 的只读入口：当前启用的 Skill（含提示词正文与模型参数）与 Tool（含 JSON Schema）。
 *
 * - 默认只返回 enabled=true 的条目；
 * - `?includeDisabled=1` 给运营后台看全量；
 * - `?withPrompts=0` 可省掉提示词正文（只要元数据时用，响应更小）。
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeDisabled = url.searchParams.get("includeDisabled") === "1";
    const withPrompts = url.searchParams.get("withPrompts") !== "0";

    const [skills, tools, handoffRules] = await Promise.all([
      includeDisabled ? listSkills() : listEnabledSkills(),
      includeDisabled ? listTools() : listEnabledTools(),
      getHandoffRules(),
    ]);

    return jsonOk({
      generatedAt: new Date().toISOString(),
      counts: {
        skills: skills.length,
        tools: tools.length,
        handoffRules: handoffRules.filter((rule) => rule.enabled).length,
      },
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        stage: skill.stage,
        version: skill.version,
        model: skill.model,
        temperature: skill.temperature,
        maxTokens: skill.maxTokens,
        requiredTools: skill.requiredTools,
        filePath: skill.filePath,
        ...(withPrompts ? { systemPrompt: skill.systemPrompt } : {}),
      })),
      tools: tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        kind: tool.kind,
        riskLevel: tool.riskLevel,
        version: tool.version,
        timeoutMs: tool.timeoutMs,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      })),
      handoffRules: handoffRules
        .filter((rule) => rule.enabled)
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
          condition: rule.condition,
          priority: rule.priority,
          action: rule.action,
          slaMinutes: rule.slaMinutes,
          channels: rule.channels,
        })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
