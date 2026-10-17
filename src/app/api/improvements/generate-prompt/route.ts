import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { generatePromptDraft } from "@/lib/ops/service";
import { promptImprovementSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/improvements/generate-prompt
 *
 * 只生成草案并存在 improvement.draft 里，**不会**修改任何 Skill。
 * 必须再调用 apply-prompt 才会写入（并且会先留版本快照）。
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, promptImprovementSchema);
    const improvement = await generatePromptDraft(input.improvementId);
    revalidatePath("/ops");
    return jsonOk({
      improvementId: improvement.id,
      draft: improvement.draft,
      warning: "草案已生成，Skill 未做任何修改；确认 diff 后调用 apply-prompt 才会应用。",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
