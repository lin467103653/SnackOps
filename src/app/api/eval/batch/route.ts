import { jsonOk, toErrorResponse } from "@/lib/api";
import { listBatches } from "@/lib/eval/batch";

export const dynamic = "force-dynamic";

/** GET /api/eval/batch —— 批次列表（新建在前） */
export async function GET() {
  try {
    const batches = await listBatches();
    return jsonOk({ total: batches.length, items: batches });
  } catch (error) {
    return toErrorResponse(error);
  }
}
