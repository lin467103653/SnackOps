import { revalidatePath } from "next/cache";

import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getAgentRun } from "@/lib/agent/run-store";
import { createAnnotation } from "@/lib/mutations";
import { runAnnotationInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST /api/runs/[id]/annotate —— 给这条运行写标注（进入统一标注库） */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const input = await parseJsonBody(request, runAnnotationInputSchema);
    const runId = decodeURIComponent(id);
    const run = await getAgentRun(runId);
    if (!run) return jsonError(`运行记录不存在：${runId}`, 404);

    const annotation = await createAnnotation({
      targetType: "agent_run",
      targetId: runId,
      tag: input.tag,
      note: input.note,
    });

    revalidatePath(`/runs/${runId}`);
    return jsonOk(annotation, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
