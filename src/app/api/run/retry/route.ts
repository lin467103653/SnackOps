import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { runAgent } from "@/lib/agent/orchestrator";
import { getAgentRun } from "@/lib/agent/run-store";
import { getLlmStatus } from "@/lib/llm";
import { retryRunInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/run/retry —— 用同一个问题重跑一次，生成新的 RunRecord。
 * 原记录保留，新记录用 retryOf 指向它。
 */
export async function POST(request: Request) {
  const status = await getLlmStatus();
  if (!status.configured) {
    return jsonError(status.hint ?? "未配置 LLM Provider", 503, { code: "LLM_NOT_CONFIGURED" });
  }

  try {
    const input = await parseJsonBody(request, retryRunInputSchema);
    const original = await getAgentRun(input.runId);
    if (!original) return jsonError(`运行记录不存在：${input.runId}`, 404);

    const events: string[] = [];
    const record = await runAgent(
      {
        question: original.question,
        source: "retry",
        conversationId: original.conversationId,
        conversationHistory: original.conversationHistory,
        retryOf: original.id,
        faults: input.faults,
      },
      (event) => events.push(event.type),
    );

    return jsonOk({
      runId: record.id,
      retryOf: original.id,
      status: record.status,
      finalReply: record.finalReply,
      error: record.error,
      durationMs: record.durationMs,
      events,
      run: record,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
