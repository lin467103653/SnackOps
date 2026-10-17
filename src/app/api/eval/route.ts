import { jsonOk, toErrorResponse } from "@/lib/api";
import { loadCollection } from "@/lib/collections";
import { listSkills } from "@/lib/skills/registry";
import { listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

/** GET /api/eval —— cases + batches + skills + tools（评测只有一份存储：eval-cases / eval-batch） */
export async function GET() {
  try {
    const [cases, batches, skills, tools] = await Promise.all([
      loadCollection("eval-cases"),
      loadCollection("eval-batch"),
      listSkills(),
      listTools(),
    ]);

    return jsonOk({
      cases: [...cases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      batches: [...batches].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      skills: skills.map((skill) => ({ id: skill.id, name: skill.name, version: skill.version, enabled: skill.enabled })),
      tools: tools.map((tool) => ({ id: tool.id, name: tool.name, enabled: tool.enabled })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
