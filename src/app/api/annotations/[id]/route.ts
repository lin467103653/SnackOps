import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { annotationToEvalCase, annotationToImprovement, patchAnnotation } from "@/lib/ops/service";
import { annotationPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/annotations/[id]
 * - 状态 / 维度 / 备注
 * - action=to_eval_case → 沉淀为评测用例
 * - action=to_improvement → 转为改进项
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const input = await parseJsonBody(request, annotationPatchSchema);
    const annotationId = decodeURIComponent(id);

    if (input.action === "to_eval_case") {
      const result = await annotationToEvalCase(annotationId, { skillId: input.skillId });
      revalidatePath("/ops");
      revalidatePath("/evals");
      return jsonOk(result);
    }

    if (input.action === "to_improvement") {
      const result = await annotationToImprovement(annotationId);
      revalidatePath("/ops");
      revalidatePath("/improvements");
      return jsonOk(result);
    }

    const annotation = await patchAnnotation(annotationId, {
      status: input.status,
      dimensions: input.dimensions,
      note: input.note,
    });
    revalidatePath("/ops");
    return jsonOk(annotation);
  } catch (error) {
    return toErrorResponse(error);
  }
}
