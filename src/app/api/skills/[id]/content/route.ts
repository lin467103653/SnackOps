import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getSkillOrThrow, saveSkillContent } from "@/lib/skills/registry";
import { skillContentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * 保存 Skill 正文（核心写入口）：
 * 1. 编辑前自动快照当前正文；
 * 2. 版本号 patch +1 并写入 skills.json；
 * 3. 追加保存后的版本快照；
 * 4. 同步写 skills/<id>.md 镜像。
 *
 * 请求体里的 filePath 会被严格校验，`../../` 之类的越界路径直接 400。
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await getSkillOrThrow(id);
    const input = await parseJsonBody(request, skillContentSchema);
    const result = await saveSkillContent({
      id,
      content: input.content,
      changeNote: input.changeNote,
      filePath: input.filePath,
    });

    revalidatePath("/skills");
    revalidatePath(`/skills/${id}`);
    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
