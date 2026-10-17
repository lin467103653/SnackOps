import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import { compareBatches, getBatch } from "@/lib/eval/batch";

export const dynamic = "force-dynamic";

/** GET /api/eval/compare?base=&target= —— 两个批次的可比性与差异 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const baseId = url.searchParams.get("base");
    const targetId = url.searchParams.get("target");
    if (!baseId || !targetId) {
      return jsonError("缺少 base 或 target 参数", 400);
    }
    if (baseId === targetId) {
      return jsonError("base 与 target 是同一个批次，无法比较", 400);
    }

    const [base, target] = await Promise.all([getBatch(baseId), getBatch(targetId)]);
    if (!base) return jsonError(`基线批次不存在：${baseId}`, 404, { code: "BATCH_NOT_FOUND" });
    if (!target) return jsonError(`目标批次不存在：${targetId}`, 404, { code: "BATCH_NOT_FOUND" });

    return jsonOk(compareBatches(base, target));
  } catch (error) {
    return toErrorResponse(error);
  }
}
