import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { explainQuestion, explainRun } from "@/lib/agent/explain";
import { getLlmStatus } from "@/lib/llm";
import { explainInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/explain —— 解释一条运行或一个风险判断。
 * { runId } 走模型（fixture 则确定性生成）；{ question } 走规则引擎，不依赖模型。
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, explainInputSchema);

    if (input.runId) {
      const status = await getLlmStatus();
      if (!status.configured) {
        return jsonError(status.hint ?? "未配置 LLM Provider", 503, { code: "LLM_NOT_CONFIGURED" });
      }
      const result = await explainRun(input.runId);
      return jsonOk({ mode: "run", ...result });
    }

    return jsonOk({ mode: "question", ...explainQuestion(input.question!) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("不存在")) {
      return jsonError(error.message, 404);
    }
    return toErrorResponse(error);
  }
}
