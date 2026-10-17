import { jsonOk, toErrorResponse } from "@/lib/api";
import { getSkillOrThrow } from "@/lib/skills/registry";
import { getVersionById, getVersion } from "@/lib/skills/versions";

export const dynamic = "force-dynamic";

/** 查看某个版本的完整正文；`version` 可传版本号（1.2.0）或快照 id（sv_xxx） */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = await params;
  try {
    const skill = await getSkillOrThrow(id);
    const snapshot = version.startsWith("sv_") ? await getVersionById(skill.id, version) : await getVersion(skill.id, version);
    return jsonOk(snapshot);
  } catch (error) {
    return toErrorResponse(error);
  }
}
