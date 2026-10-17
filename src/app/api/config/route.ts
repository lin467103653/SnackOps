import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { saveConfig } from "@/lib/mutations";
import { configInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 保存运行时配置：模型参数（llm-config）或兜底策略（runtime-fallback） */
export async function PUT(request: Request) {
  try {
    const input = await parseJsonBody(request, configInputSchema);
    const saved = await saveConfig(input);
    revalidatePath("/");
    revalidatePath("/settings");
    return jsonOk(saved);
  } catch (error) {
    return toErrorResponse(error);
  }
}
