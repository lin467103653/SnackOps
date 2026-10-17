/**
 * openai-compatible Provider：任何兼容 /chat/completions 的服务。
 * 读取 OPENAI_API_KEY / OPENAI_BASE_URL / LLM_MODEL；缺任何一个必需项都抛结构化错误，绝不降级。
 */
import { DEMO_HINT, LlmError, type LlmCallOptions, type LlmMessage, type LlmProvider, type LlmResult } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

function readConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.LLM_MODEL?.trim() ?? "";

  const missing: string[] = [];
  if (!apiKey) missing.push("OPENAI_API_KEY");
  if (!model) missing.push("LLM_MODEL");

  if (missing.length > 0) {
    throw new LlmError(
      "CONFIG",
      `openai-compatible Provider 缺少配置：${missing.join("、")}`,
      `${DEMO_HINT}（当前模式：openai-compatible，缺少 ${missing.join("、")}，不会自动降级）`,
    );
  }

  return { apiKey, baseUrl, model, timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 30_000) };
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

export function createOpenAiCompatibleProvider(): LlmProvider {
  const config = readConfig();

  return {
    id: "openai-compatible",
    label: `OpenAI 兼容（${config.baseUrl}）`,
    model: config.model,
    fixture: false,
    async complete(messages: LlmMessage[], options: LlmCallOptions): Promise<LlmResult> {
      const startedAt = performance.now();
      const payload: Record<string, unknown> = {
        model: options.model ?? config.model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        temperature: options.temperature ?? 0.3,
      };
      if (options.maxTokens) payload.max_tokens = options.maxTokens;
      if (options.json) payload.response_format = { type: "json_object" };

      let response: Response;
      try {
        response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new LlmError(
          isTimeout ? "TIMEOUT" : "UPSTREAM",
          isTimeout ? `模型调用超时（>${config.timeoutMs}ms）` : `模型调用失败：${error instanceof Error ? error.message : "网络错误"}`,
          "检查 OPENAI_BASE_URL 是否可达；或切换到 classroom-fixture 先跑通链路",
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new LlmError(
          "UPSTREAM",
          `模型返回 HTTP ${response.status}：${body.slice(0, 200)}`,
          "检查 OPENAI_API_KEY 权限与模型名 LLM_MODEL 是否可用",
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) throw new LlmError("BAD_RESPONSE", "模型返回了空内容", "换一个模型或降低 temperature 后重试");

      return {
        text,
        provider: "openai-compatible",
        model: data.model ?? config.model,
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
        },
        fixture: false,
      };
    },
  };
}
