import { jsonOk, toErrorResponse } from "@/lib/api";
import { listEnabledSkills, listSkills } from "@/lib/skills/registry";

export const dynamic = "force-dynamic";

/** 运营视角的 Skill 列表；`?enabled=1` 只返回启用中的（验收用） */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const onlyEnabled = url.searchParams.get("enabled") === "1" || url.searchParams.get("enabled") === "true";
    const skills = onlyEnabled ? await listEnabledSkills() : await listSkills();
    return jsonOk({
      total: skills.length,
      filtered: onlyEnabled ? "enabled" : "all",
      skills,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
