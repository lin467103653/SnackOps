import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import { getBatch } from "@/lib/eval/batch";

export const dynamic = "force-dynamic";

/** GET /api/eval/batch/[id] —— 返回 { batch }；不存在时结构化 404 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const batch = await getBatch(decodeURIComponent(id));
    if (!batch) {
      return jsonError(`批次不存在：${id}`, 404, { code: "BATCH_NOT_FOUND" });
    }
    return jsonOk({ batch });
  } catch (error) {
    return toErrorResponse(error);
  }
}
