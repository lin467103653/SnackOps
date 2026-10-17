import { jsonError, parseJsonBody } from "@/lib/api";
import { runAgent, type AgentEvent } from "@/lib/agent/orchestrator";
import { getLlmStatus } from "@/lib/llm";
import { agentRunInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/agent/run —— SSE 流式返回 Agent 主链路事件。
 *
 * event: run_start | plan | validation | step | risk | final | error | done
 * 每个事件都带 `data: <json>`，客户端按行解析即可。
 */
export async function POST(request: Request) {
  const status = await getLlmStatus();
  if (!status.configured) {
    return jsonError(status.hint ?? "未配置 LLM Provider", 503, {
      code: "LLM_NOT_CONFIGURED",
      llm: status,
      howToEnableDemo: "在 .env.local 设置 LLM_PROVIDER=classroom-fixture 后重启服务",
    });
  }

  let input;
  try {
    input = await parseJsonBody(request, agentRunInputSchema);
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求体不合法";
    return jsonError(message, 422, { code: "INVALID_INPUT" });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        await runAgent(
          {
            question: input.question,
            source: input.source ?? "api",
            conversationId: input.conversationId,
            conversationHistory: input.conversationHistory,
            userId: input.userId,
            faults: input.faults,
          },
          send,
        );
      } catch (error) {
        send({
          type: "error",
          code: "RUN_FAILED",
          message: error instanceof Error ? error.message : "运行失败",
          hint: null,
        });
        send({ type: "done", runId: "", status: "failed", durationMs: 0 });
      } finally {
        try {
          controller.close();
        } catch {
          // 客户端可能已经断开
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
