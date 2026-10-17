import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { CAPABILITY_LABELS, TOOL_CAPABILITIES } from "@/lib/agent/capabilities";
import { getPlannerConfig, updatePlannerConfig } from "@/lib/agent/planner-config";
import { listEnabledSkills } from "@/lib/skills/registry";
import { listEnabledTools } from "@/lib/tools/registry";
import { plannerUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/planner —— Planner 版本、配置、提示词、可选能力目录 */
export async function GET() {
  try {
    const [config, skills, tools] = await Promise.all([getPlannerConfig(), listEnabledSkills(), listEnabledTools()]);

    return jsonOk({
      config,
      prompt: config.systemPrompt,
      catalog: {
        skills: skills
          .map((skill) => ({
            id: skill.id,
            name: skill.name,
            stage: skill.stage,
            version: skill.version,
            capabilities: skill.capabilities,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        tools: tools
          .map((tool) => ({
            id: tool.id,
            name: tool.name,
            kind: tool.kind,
            version: tool.version,
            capabilities: TOOL_CAPABILITIES[tool.id] ?? [],
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      },
      capabilities: Object.entries(CAPABILITY_LABELS).map(([id, label]) => ({ id, label })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PUT /api/planner —— 保存配置；提示词变更会版本 +1 并写历史 */
export async function PUT(request: Request) {
  try {
    const input = await parseJsonBody(request, plannerUpdateSchema);
    const config = await updatePlannerConfig(input);
    revalidatePath("/planner");
    revalidatePath("/");
    return jsonOk({ config, version: config.version, promptHash: config.promptHash });
  } catch (error) {
    return toErrorResponse(error);
  }
}
