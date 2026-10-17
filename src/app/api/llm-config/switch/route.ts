import { revalidatePath } from "next/cache";

import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { switchProvider } from "@/lib/llm";
import { llmSwitchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/llm-config/switch —— 切换 Provider，写入 data/llm-config.json。
 *
 * 目标 Provider 缺配置时：切换仍会保存（便于在页面上看到明确的缺配置错误），
 * 但 `configured=false`，后续运行会返回 503，**不会**自动退回演示模式。
 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, llmSwitchSchema);
    const result = await switchProvider(input.provider);

    revalidatePath("/models");
    revalidatePath("/settings");
    revalidatePath("/");

    if (!result.configured) {
      return jsonOk({
        switched: true,
        warning: result.warning,
        status: result.status,
        previous: result.previous,
      });
    }

    return jsonOk({ switched: true, warning: result.warning, status: result.status, previous: result.previous });
  } catch (error) {
    if (error instanceof Error && error.message.includes("未知的 Provider")) {
      return jsonError(error.message, 400);
    }
    return toErrorResponse(error);
  }
}
