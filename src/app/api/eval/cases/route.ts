import { revalidatePath } from "next/cache";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { loadCollection } from "@/lib/collections";
import { getAgentRun } from "@/lib/agent/run-store";
import { evalCaseSchemaV2 } from "@/lib/schemas";
import { updateJson } from "@/lib/store";
import { evalCaseCreateSchema } from "@/lib/validation";
import type { EvalCaseV2 } from "@/lib/types";

export const dynamic = "force-dynamic";

function makeId(): string {
  return `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
}

/** POST /api/eval/cases —— 新增用例；可用 sourceRunId 从一次 Run 复制问题 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, evalCaseCreateSchema);

    let question = input.question;
    let sourceRunId = input.sourceRunId ?? null;
    if ((!question || question.length < 4) && sourceRunId) {
      const run = await getAgentRun(sourceRunId);
      if (!run) throw new ApiError(404, `来源运行不存在：${sourceRunId}`);
      question = run.question;
    }
    if (!question) throw new ApiError(422, "缺少 question（或提供一个存在的 sourceRunId）");

    const record: EvalCaseV2 = {
      id: makeId(),
      name: input.name,
      question,
      category: input.category,
      difficulty: input.difficulty,
      riskLevel: input.riskLevel,
      expectedBehavior: input.expectedBehavior,
      expectedReply: input.expectedReply ?? "",
      expectedKeywords: input.expectedKeywords ?? [],
      keywordMode: input.keywordMode ?? "AND",
      forbiddenWords: input.forbiddenWords ?? [],
      expectedPrice: input.expectedPrice ?? null,
      priceTolerance: input.priceTolerance ?? 0.01,
      expectRiskPassed: input.expectRiskPassed ?? true,
      requiredCapabilities: input.requiredCapabilities ?? [],
      forbiddenCapabilities: input.forbiddenCapabilities ?? [],
      evalDimension: input.evalDimension,
      llmJudgePrompt: input.llmJudgePrompt ?? null,
      tags: input.tags ?? [],
      sourceRunId,
      createdAt: new Date().toISOString(),
      enabled: input.enabled ?? true,
    };

    const parsed = evalCaseSchemaV2.safeParse(record);
    if (!parsed.success) {
      throw new ApiError(422, `用例不合法：${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("；")}`);
    }

    await updateJson<EvalCaseV2[]>("eval-cases.json", (current) => [parsed.data, ...(current ?? [])]);
    revalidatePath("/eval");
    return jsonOk(parsed.data, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET() {
  try {
    const cases = await loadCollection("eval-cases");
    return jsonOk({ total: cases.length, items: cases });
  } catch (error) {
    return toErrorResponse(error);
  }
}
