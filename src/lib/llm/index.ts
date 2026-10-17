/**
 * LLM 入口：Provider 解析、切换、连接测试、统一 complete()。
 *
 * 解析优先级：
 * 1. 管理后台持久化的 provider（data/llm-config.json 的 provider 字段）；
 * 2. 环境变量 LLM_PROVIDER；
 * 3. 按已配置的密钥自动推断（COZE_API_KEY → coze，OPENAI_API_KEY → openai-compatible）；
 * 4. 都没有 → 结构化 CONFIG 错误（**不会**静默使用 fixture）。
 */
import { loadCollection, saveCollection } from "../collections";
import { OPERATOR } from "../constants";
import { createCozeProvider } from "./coze";
import { createFixtureProvider } from "./fixture";
import { createOpenAiCompatibleProvider } from "./openai-compatible";
import { redactSecrets } from "./redact";
import {
  DEMO_HINT,
  FIXTURE_MODEL,
  LlmError,
  type LlmCallOptions,
  type LlmMessage,
  type LlmProvider,
  type LlmProviderId,
  type LlmResult,
  type LlmStatus,
} from "./types";

export { LlmError, DEMO_HINT, FIXTURE_MODEL } from "./types";
export type { LlmCallOptions, LlmMessage, LlmProvider, LlmProviderId, LlmResult, LlmStatus } from "./types";

const ALIASES: Record<string, LlmProviderId> = {
  coze: "coze",
  "openai-compatible": "openai-compatible",
  openai: "openai-compatible",
  "classroom-fixture": "classroom-fixture",
  fixture: "classroom-fixture",
};

export interface ProviderCatalogEntry {
  id: LlmProviderId;
  label: string;
  vendor: string;
  description: string;
  /** 生效需要的环境变量；空数组表示不需要外部配置 */
  requires: string[];
  fixture: boolean;
  defaultModel: string;
  docs: string;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "classroom-fixture",
    label: "课堂演示模式",
    vendor: "fixture",
    description: "确定性输出，不调用任何外部服务；用于没有密钥时跑通完整链路。所有产物都会标注「课堂演示模式」。",
    requires: [],
    fixture: true,
    defaultModel: FIXTURE_MODEL,
    docs: "在 .env.local 设置 LLM_PROVIDER=classroom-fixture，或在下方一键切换。",
  },
  {
    id: "openai-compatible",
    label: "OpenAI 兼容",
    vendor: "openai",
    description: "任何兼容 /chat/completions 的服务（OpenAI、DeepSeek、vLLM、OneAPI…），读取 OPENAI_API_KEY / OPENAI_BASE_URL / LLM_MODEL。",
    requires: ["OPENAI_API_KEY", "LLM_MODEL"],
    fixture: false,
    defaultModel: "gpt-4o-mini",
    docs: "至少配置 OPENAI_API_KEY 与 LLM_MODEL，OPENAI_BASE_URL 默认 https://api.openai.com/v1。",
  },
  {
    id: "coze",
    label: "Coze",
    vendor: "coze",
    description: "通过 coze-coding-dev-sdk 调用 Coze 模型服务，读取 COZE_API_KEY / COZE_MODEL。",
    requires: ["COZE_API_KEY", "COZE_MODEL"],
    fixture: false,
    defaultModel: "doubao-1-5-pro-32k-250115",
    docs: "需要 pnpm add coze-coding-dev-sdk，并配置 COZE_API_KEY（COZE_MODEL 可选，缺省读 LLM_MODEL）。",
  },
];

export function providerCatalogEntry(id: LlmProviderId): ProviderCatalogEntry {
  return PROVIDER_CATALOG.find((entry) => entry.id === id) ?? PROVIDER_CATALOG[0]!;
}

export interface LlmRuntimeConfig {
  provider: LlmProviderId | null;
  defaultModel: string;
  plannerModel: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  plannerMaxSteps: number;
  enabledTools: string[];
  updatedAt: string;
  updatedBy: string;
  notes: string;
}

export async function getLlmRuntimeConfig(): Promise<LlmRuntimeConfig> {
  const config = await loadCollection("llm-config");
  return config;
}

/** 管理后台持久化的 provider 选择 */
async function getPersistedProvider(): Promise<LlmProviderId | null> {
  try {
    const config = await getLlmRuntimeConfig();
    return config.provider ?? null;
  } catch {
    return null;
  }
}

export interface ProviderSelection {
  id: LlmProviderId;
  source: "config" | "env" | "auto";
}

export async function resolveProviderId(): Promise<ProviderSelection> {
  const persisted = await getPersistedProvider();
  if (persisted) return { id: persisted, source: "config" };

  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    const id = ALIASES[explicit];
    if (!id) {
      throw new LlmError(
        "CONFIG",
        `未知的 LLM_PROVIDER：${explicit}`,
        `可选值：coze / openai-compatible / classroom-fixture。${DEMO_HINT}`,
      );
    }
    return { id, source: "env" };
  }

  if (process.env.COZE_API_KEY?.trim()) return { id: "coze", source: "auto" };
  if (process.env.OPENAI_API_KEY?.trim()) return { id: "openai-compatible", source: "auto" };

  throw new LlmError("CONFIG", "未配置 LLM Provider（既没有后台选择，也没有环境变量或 API Key）", DEMO_HINT);
}

export async function resolveProvider(): Promise<LlmProvider> {
  const { id } = await resolveProviderId();
  switch (id) {
    case "coze":
      return createCozeProvider();
    case "openai-compatible":
      return createOpenAiCompatibleProvider();
    case "classroom-fixture":
      return createFixtureProvider();
  }
}

function missingEnvFor(id: LlmProviderId): string[] {
  const entry = providerCatalogEntry(id);
  return entry.requires.filter((key) => {
    if (key === "COZE_MODEL") return !(process.env.COZE_MODEL?.trim() || process.env.LLM_MODEL?.trim());
    return !process.env[key]?.trim();
  });
}

/** 某个 Provider 缺少哪些环境变量（页面展示用，不含值） */
export function providerMissingEnv(id: LlmProviderId): string[] {
  return missingEnvFor(id);
}

/** 供页面/接口展示：永远不抛错（除了读配置本身失败） */
export async function getLlmStatus(): Promise<LlmStatus> {
  const envKeys = [
    "LLM_PROVIDER",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "LLM_MODEL",
    "COZE_API_KEY",
    "COZE_MODEL",
  ] as const;

  const env: LlmStatus["env"] = {
    LLM_PROVIDER: process.env.LLM_PROVIDER?.trim() || null,
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
    OPENAI_BASE_URL: Boolean(process.env.OPENAI_BASE_URL?.trim()),
    LLM_MODEL: process.env.LLM_MODEL?.trim() || null,
    COZE_API_KEY: Boolean(process.env.COZE_API_KEY?.trim()),
    COZE_MODEL: process.env.COZE_MODEL?.trim() || null,
  };

  try {
    const selection = await resolveProviderId();
    const missing = missingEnvFor(selection.id);
    const entry = providerCatalogEntry(selection.id);

    if (missing.length > 0) {
      return {
        provider: selection.id,
        label: entry.label,
        model: entry.defaultModel,
        configured: false,
        fixture: entry.fixture,
        source: selection.source,
        hint: `${entry.label} 缺少配置：${missing.join("、")}。补齐后重启服务即可生效；或切回 classroom-fixture 继续用演示模式。`,
        missing,
        env,
        envKeys: [...envKeys],
      };
    }

    const provider = await resolveProvider();
    return {
      provider: provider.id,
      label: provider.label,
      model: provider.model,
      configured: true,
      fixture: provider.fixture,
      source: selection.source,
      hint: provider.fixture
        ? "当前是课堂演示模式：输出由确定性 fixture 生成，未调用外部模型；界面与 RunRecord 都会标注。"
        : null,
      missing: [],
      env,
      envKeys: [...envKeys],
    };
  } catch (error) {
    const missing = error instanceof LlmError ? [] : [];
    return {
      provider: null,
      label: "未配置",
      model: "—",
      configured: false,
      fixture: false,
      source: null,
      hint: error instanceof LlmError ? redactSecrets(error.hint ?? error.message) : DEMO_HINT,
      missing,
      env,
      envKeys: [...envKeys],
    };
  }
}

export interface SwitchProviderResult {
  status: LlmStatus;
  previous: LlmProviderId | null;
  /** 目标 Provider 缺少配置时为 false：切换已保存，但后续运行会以结构化错误拒绝 */
  configured: boolean;
  warning: string | null;
}

/** 切换 Provider：写 data/llm-config.json，立即影响后续运行 */
export async function switchProvider(rawId: string): Promise<SwitchProviderResult> {
  const id = ALIASES[rawId.trim().toLowerCase()];
  if (!id) {
    throw new LlmError("CONFIG", `未知的 Provider：${rawId}`, "可选值：coze / openai-compatible / classroom-fixture");
  }

  const config = await getLlmRuntimeConfig();
  const previous = config.provider ?? null;
  const missing = missingEnvFor(id);
  const entry = providerCatalogEntry(id);

  await saveCollection("llm-config", {
    ...config,
    provider: id,
    updatedAt: new Date().toISOString(),
    updatedBy: OPERATOR,
  });

  const status = await getLlmStatus();
  const warning =
    missing.length > 0
      ? `已切换到 ${entry.label}，但它缺少 ${missing.join("、")}：后续运行会返回结构化错误，不会退回演示模式。`
      : entry.fixture
        ? "当前为课堂演示模式（确定性输出），适合没有外部密钥时验证链路。"
        : null;

  return { status, previous, configured: missing.length === 0, warning: redactSecrets(warning ?? "") || null };
}

export interface ProviderTestResult {
  ok: boolean;
  provider: LlmProviderId | null;
  model: string;
  latencyMs: number;
  error: { code: string; message: string; hint: string | null } | null;
  fixture: boolean;
  checkedAt: string;
}

/** 测试连接：真实发一次最小请求，失败返回结构化错误（不透出密钥） */
export async function testProvider(): Promise<ProviderTestResult> {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();

  try {
    const provider = await resolveProvider();
    const result = await provider.complete(
      [
        { role: "system", content: "只回复两个字：可用" },
        { role: "user", content: "ping" },
      ],
      { maxTokens: 16, temperature: 0 },
    );

    return {
      ok: true,
      provider: provider.id,
      model: result.model,
      latencyMs: Math.round(performance.now() - startedAt),
      error: null,
      fixture: result.fixture,
      checkedAt,
    };
  } catch (error) {
    const llmError = error instanceof LlmError ? error : null;
    return {
      ok: false,
      provider: (await getLlmStatus()).provider,
      model: (await getLlmStatus()).model,
      latencyMs: Math.round(performance.now() - startedAt),
      error: {
        code: llmError?.code ?? "UNKNOWN",
        message: redactSecrets(error instanceof Error ? error.message : "连接测试失败"),
        hint: llmError?.hint ? redactSecrets(llmError.hint) : null,
      },
      fixture: false,
      checkedAt,
    };
  }
}

export async function complete(messages: LlmMessage[], options: LlmCallOptions = {}): Promise<LlmResult> {
  const provider = await resolveProvider();
  return provider.complete(messages, options);
}

/** 从模型输出里提取 JSON（容忍 ```json 围栏与前后废话） */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new LlmError("BAD_RESPONSE", "模型输出不是合法 JSON", "检查 prompt 中是否明确要求返回 JSON");
  }
}
