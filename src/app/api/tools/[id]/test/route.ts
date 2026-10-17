import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { runTool } from "@/lib/tools/registry";
import { toolRunSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * 运行单个 Tool（「可测试入口」）。
 *
 * - 请求体 `{ input }` 省略时使用注册表里的 sampleInput；
 * - 实际读 data/*.json，返回真实记录，不是造数；
 * - 入参错误 → 422，引用的对象不存在 → 404，未实现 → 501。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await parseJsonBody(request, toolRunSchema);
    const result = await runTool(id, body.input);
    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
