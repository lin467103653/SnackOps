import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import { getAgentRun } from "@/lib/agent/run-store";

export const dynamic = "force-dynamic";

/** GET /api/runs/[id] —— 完整 RunRecord（含 Plan、Trace、风险结果） */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const run = await getAgentRun(decodeURIComponent(id));
    if (!run) return jsonError(`运行记录不存在：${id}`, 404);
    return jsonOk(run);
  } catch (error) {
    return toErrorResponse(error);
  }
}
