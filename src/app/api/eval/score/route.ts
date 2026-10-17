import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getAgentRun } from "@/lib/agent/run-store";
import { loadCollection } from "@/lib/collections";
import { scoreRun } from "@/lib/eval/scorer";
import { evalScoreSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/eval/score —— 用**已持久化的本次运行**打分。
 * 评分证据里的 runId 指向真实 RunRecord，页面可点开对照 Trace。
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, evalScoreSchema);
    const [cases, run] = await Promise.all([loadCollection("eval-cases"), getAgentRun(input.runId)]);

    if (!run) throw new ApiError(404, `运行记录不存在：${input.runId}`);
    const evalCase = cases.find((item) => item.id === input.caseId);
    if (!evalCase) throw new ApiError(404, `评测用例不存在：${input.caseId}`);

    const score = scoreRun(evalCase, run);

    return jsonOk({
      score,
      case: {
        id: evalCase.id,
        name: evalCase.name,
        expectedKeywords: evalCase.expectedKeywords,
        keywordMode: evalCase.keywordMode,
        forbiddenWords: evalCase.forbiddenWords,
        expectedPrice: evalCase.expectedPrice,
        expectRiskPassed: evalCase.expectRiskPassed,
        requiredCapabilities: evalCase.requiredCapabilities,
        forbiddenCapabilities: evalCase.forbiddenCapabilities,
        evalDimension: evalCase.evalDimension,
      },
      run: {
        id: run.id,
        status: run.status,
        question: run.question,
        finalReply: run.finalReply,
        plan: run.plan,
        riskResult: run.riskResult,
        provider: run.provider,
        model: run.model,
        durationMs: run.durationMs,
        steps: run.steps.map((step) => ({
          stepId: step.stepId,
          type: step.type,
          name: step.name,
          status: step.status,
          durationMs: step.durationMs,
          error: step.error,
        })),
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
