import { jsonOk, toErrorResponse } from "@/lib/api";
import { testProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/llm-config/test —— 真发一次最小请求。
 * 失败时返回结构化错误（code/message/hint），密钥已脱敏。
 */
export async function POST() {
  try {
    const result = await testProvider();
    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
