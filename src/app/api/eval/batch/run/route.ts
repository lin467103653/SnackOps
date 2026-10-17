import { z } from "zod";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { createBatch, runBatch } from "@/lib/eval/batch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  name: z.string().trim().max(60).optional(),
  versionLabel: z.string().trim().max(40).optional(),
  changeNote: z.string().trim().max(200).optional(),
  caseIds: z.array(z.string().trim().min(1)).max(200).optional(),
});

/**
 * POST /api/eval/batch/run —— 创建批次并立即在后台跑。
 * 返回 batchId，前端轮询 GET /api/eval/batch/[id]。
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, bodySchema);
    const { batch, reused } = await createBatch(input);

    if (!reused) {
      // 后台执行：不阻塞响应；每条结果都会落盘
      void runBatch(batch.id).catch(() => {});
    }

    return jsonOk({ batchId: batch.id, batch, reused }, 202);
  } catch (error) {
    return toErrorResponse(error);
  }
}
