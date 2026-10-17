import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import { listBatches } from "@/lib/eval/batch";

export const dynamic = "force-dynamic";

/**
 * 评测批次只读别名（第一段接口兼容）。
 * 数据来自 eval-batch.json，与 /eval、/api/eval、/api/eval/batch/[id] 完全同源。
 */
export async function GET() {
  try {
    return jsonOk(await listBatches());
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * 第一段的 POST 是「按用例 id 稳定散列」的本地模拟，会在批次里写出没有真实执行的通过率。
 * 双存储合并后它已被删除：批次必须由真实 Agent 执行产生，所以这里明确返回 410 而不是假装成功。
 */
export async function POST() {
  return jsonError(
    "POST /api/eval-batches 已下线：它曾写入没有真实执行的模拟批次。请改用 POST /api/eval/batch/run（逐条真实运行 Agent 主链路后评分）",
    410,
    {
      code: "ENDPOINT_GONE",
      hint: "请求体：{ name?, versionLabel?, caseIds?: string[] }；省略 caseIds 表示跑全部启用用例",
    },
  );
}
