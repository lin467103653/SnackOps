import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { saveCollection } from "@/lib/collections";
import { OPERATOR } from "@/lib/constants";
import {
  PROVIDER_CATALOG,
  getLlmRuntimeConfig,
  getLlmStatus,
  providerCatalogEntry,
} from "@/lib/llm";
import { secretEnvFlags } from "@/lib/llm/redact";
import { llmConfigUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ENV_KEYS = ["LLM_PROVIDER", "OPENAI_API_KEY", "OPENAI_BASE_URL", "LLM_MODEL", "COZE_API_KEY", "COZE_MODEL"];
const SECRET_KEYS = ["OPENAI_API_KEY", "COZE_API_KEY"];

/** GET /api/llm-config —— Provider 状态、模型配置、目录与「是否已配置」标记（不含密钥） */
export async function GET() {
  try {
    const [status, config] = await Promise.all([getLlmStatus(), getLlmRuntimeConfig()]);

    return jsonOk({
      status,
      config,
      providers: PROVIDER_CATALOG.map((entry) => {
        const missing = entry.requires.filter((key) => {
          if (key === "COZE_MODEL") return !(process.env.COZE_MODEL?.trim() || process.env.LLM_MODEL?.trim());
          return !process.env[key]?.trim();
        });
        return {
          id: entry.id,
          label: entry.label,
          vendor: entry.vendor,
          description: entry.description,
          requires: entry.requires,
          fixture: entry.fixture,
          defaultModel: entry.defaultModel,
          docs: entry.docs,
          configured: missing.length === 0,
          missing,
          active: status.provider === entry.id,
        };
      }),
      env: secretEnvFlags(ENV_KEYS).map((flag) => ({
        key: flag.key,
        present: flag.present,
        masked: SECRET_KEYS.includes(flag.key) ? (flag.present ? "已配置（已隐藏）" : null) : flag.masked,
      })),
      activeProvider: status.provider ? providerCatalogEntry(status.provider) : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PUT /api/llm-config —— 修改模型参数（defaultModel / plannerModel / fallbackModel / 采样参数） */
export async function PUT(request: Request) {
  try {
    const input = await parseJsonBody(request, llmConfigUpdateSchema);
    const current = await getLlmRuntimeConfig();
    const next = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
      updatedBy: OPERATOR,
    };
    await saveCollection("llm-config", next);
    revalidatePath("/models");
    revalidatePath("/settings");
    return jsonOk({ config: next, status: await getLlmStatus() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
