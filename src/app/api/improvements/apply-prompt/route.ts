import { revalidatePath } from "next/cache";

import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { applyPromptDraft } from "@/lib/ops/service";
import { promptImprovementSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/improvements/apply-prompt
 *
 * 必须显式 confirm:true。应用前 saveSkillContent 会先给「当前正文」打快照，
 * 再写入新正文并让版本 patch +1。
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, promptImprovementSchema);
    if (input.confirm !== true) {
      return jsonError("应用草案需要显式确认（confirm: true）", 400);
    }

    const result = await applyPromptDraft(input.improvementId);
    revalidatePath("/ops");
    revalidatePath("/skills");
    revalidatePath(`/skills/${result.improvement.draft?.skillId ?? ""}`);

    return jsonOk({
      improvementId: result.improvement.id,
      status: result.improvement.status,
      appliedVersion: result.version,
      snapshotVersion: result.snapshotVersion,
      skillId: result.improvement.draft?.skillId,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
