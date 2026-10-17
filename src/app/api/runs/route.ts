import { jsonOk, toErrorResponse } from "@/lib/api";
import { listAgentRuns } from "@/lib/agent/run-store";

export const dynamic = "force-dynamic";

/** GET /api/runs?limit=20&offset=0 —— 分页返回 RunRecord（按创建时间倒序） */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

    const { total, items } = await listAgentRuns(limit, offset);
    return jsonOk({
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
      items: items.map((run) => ({
        id: run.id,
        question: run.question,
        status: run.status,
        source: run.source,
        createdAt: run.createdAt,
        durationMs: run.durationMs,
        provider: run.provider,
        model: run.model,
        error: run.error,
        skillCount: run.plan?.selectedSkills.length ?? 0,
        toolCount: run.plan?.selectedTools.length ?? 0,
        riskVerdict: run.riskResult?.verdict ?? null,
        handoff: Boolean(run.handoff),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
