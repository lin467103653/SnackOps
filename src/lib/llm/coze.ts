/**
 * coze Provider：通过 coze-coding-dev-sdk 调用。
 *
 * SDK 是可选依赖（体积较大），未安装时给出结构化错误而不是静默降级。
 * 真实调用形态（SDK 0.7.x）：
 *   const config = new Config({ apiKey, timeout });
 *   const client = new LLMClient(config);
 *   const res = await client.invoke(messages, { model, temperature, streaming: false });
 *   res.content
 */
import { DEMO_HINT, LlmError, type LlmCallOptions, type LlmMessage, type LlmProvider, type LlmResult } from "./types";

interface CozeLlmClient {
  invoke(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    options?: { model?: string; temperature?: number; streaming?: boolean },
  ): Promise<{ content?: string }>;
}

interface CozeSdk {
  Config: new (config: { apiKey: string; baseUrl?: string; timeout?: number }) => unknown;
  LLMClient: new (config: unknown) => CozeLlmClient;
}

const SDK_PACKAGE = "coze-coding-dev-sdk";

async function loadSdk(): Promise<CozeSdk> {
  // 用变量做动态 import：SDK 未安装时不应该在构建期报类型错误
  const specifier = SDK_PACKAGE;
  try {
    const mod = (await import(/* webpackIgnore: true */ specifier)) as unknown as Partial<CozeSdk>;
    if (!mod.Config || !mod.LLMClient) {
      throw new LlmError("CONFIG", "coze-coding-dev-sdk 已安装但缺少 Config / LLMClient 导出", "确认 SDK 版本 >= 0.7.0");
    }
    return mod as CozeSdk;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    throw new LlmError(
      "CONFIG",
      "coze Provider 需要安装 coze-coding-dev-sdk",
      `${SDK_PACKAGE} 未安装：先执行 pnpm add ${SDK_PACKAGE}，并配置 COZE_API_KEY（可选 COZE_MODEL / COZE_BASE_URL）。${DEMO_HINT}`,
    );
  }
}

export function createCozeProvider(): LlmProvider {
  const apiKey = process.env.COZE_API_KEY?.trim() ?? "";
  const model = process.env.COZE_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "";
  const baseUrl = process.env.COZE_BASE_URL?.trim() || undefined;

  return {
    id: "coze",
    label: "Coze（coze-coding-dev-sdk）",
    model: model || "未配置",
    fixture: false,
    async complete(messages: LlmMessage[], options: LlmCallOptions): Promise<LlmResult> {
      if (!apiKey) {
        throw new LlmError("CONFIG", "coze Provider 缺少 COZE_API_KEY", `${DEMO_HINT}（当前模式：coze）`);
      }
      if (!model) {
        throw new LlmError("CONFIG", "coze Provider 缺少 COZE_MODEL / LLM_MODEL", DEMO_HINT);
      }

      const sdk = await loadSdk();
      const startedAt = performance.now();

      try {
        const client = new sdk.LLMClient(new sdk.Config({ apiKey, baseUrl, timeout: Number(process.env.LLM_TIMEOUT_MS ?? 30_000) }));
        const response = await client.invoke(
          messages.map((message) => ({ role: message.role, content: message.content })),
          { model: options.model ?? model, temperature: options.temperature ?? 0.3, streaming: false },
        );
        const text = response.content?.trim() ?? "";
        if (!text) throw new LlmError("BAD_RESPONSE", "coze 返回了空内容");

        return {
          text,
          provider: "coze",
          model: options.model ?? model,
          latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
          usage: {
            inputTokens: Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4),
            outputTokens: Math.ceil(text.length / 4),
          },
          fixture: false,
        };
      } catch (error) {
        if (error instanceof LlmError) throw error;
        throw new LlmError(
          "UPSTREAM",
          `coze 调用失败：${error instanceof Error ? error.message : "未知错误"}`,
          "检查 COZE_API_KEY 与 COZE_MODEL；或设置 LLM_PROVIDER=classroom-fixture 先跑通链路",
        );
      }
    },
  };
}
