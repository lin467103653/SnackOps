import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import {
  exportSkillFile,
  getSkillFileState,
  getSkillOrThrow,
  setSkillEnabled,
  updateSkillMeta,
} from "@/lib/skills/registry";
import { listVersions } from "@/lib/skills/versions";
import { skillPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 单个 Skill 详情：元数据 + 正文 + 镜像文件一致性 + 版本数 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const skill = await getSkillOrThrow(id);
    const [file, versions] = await Promise.all([getSkillFileState(skill), listVersions(skill.id)]);
    return jsonOk({
      skill,
      file: { path: skill.filePath, exists: file.exists, inSync: file.inSync, hash: file.fileHash },
      versions: { total: versions.length, latest: versions[0] ?? null },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * 修改 Skill：启用/停用 + 元数据（模型、温度、工具、名称等）。
 * 正文不走这里，走 PUT /api/skills/[id]/content（会生成版本快照）。
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const patch = await parseJsonBody(request, skillPatchSchema);

    // 只有 enabled 时走启停专用路径，避免误改其他字段
    const keys = Object.keys(patch);
    const skill =
      keys.length === 1 && typeof patch.enabled === "boolean"
        ? await setSkillEnabled(id, patch.enabled)
        : await updateSkillMeta(id, patch);

    revalidatePath("/skills");
    revalidatePath(`/skills/${id}`);
    revalidatePath("/");
    return jsonOk(skill);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** 重新导出镜像文件（当 skills/<id>.md 与注册表不一致时使用） */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await getSkillOrThrow(id);
    const result = await exportSkillFile(id);
    revalidatePath(`/skills/${id}`);
    return jsonOk({ exported: true, ...result });
  } catch (error) {
    return toErrorResponse(error);
  }
}
