import { revalidatePath } from "next/cache";

import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getAgentRun, updateAgentRun } from "@/lib/agent/run-store";
import { OPERATOR } from "@/lib/constants";
import { handoffInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST /api/runs/[id]/handoff —— 标记人工接管 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const input = await parseJsonBody(request, handoffInputSchema);
    const runId = decodeURIComponent(id);
    const existing = await getAgentRun(runId);
    if (!existing) return jsonError(`运行记录不存在：${runId}`, 404);
    if (existing.handoff) return jsonError("该运行已经人工接管过了", 409);

    const updated = await updateAgentRun(runId, (run) => ({
      ...run,
      status: "handoff",
      handoff: {
        at: new Date().toISOString(),
        assignee: input.assignee ?? OPERATOR,
        reason: input.reason ?? null,
      },
    }));

    revalidatePath(`/runs/${runId}`);
    revalidatePath("/runs");
    return jsonOk(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
