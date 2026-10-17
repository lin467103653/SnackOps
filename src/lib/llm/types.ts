/**
 * LLM Provider 抽象。
 *
 * 三种实现：coze / openai-compatible / classroom-fixture。
 * 关键约束：真实 provider 缺少配置时抛结构化错误，**不会**静默降级成 fixture。
 */
export type LlmProviderId = "coze" | "openai-compatible" | "classroom-fixture";

export type LlmTask = "plan" | "skill" | "risk" | "explain";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCallOptions {
  /** 只用于 fixture 选择确定性生成策略；真实 provider 忽略它 */
  task?: LlmTask;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 要求返回 JSON（真实 provider 会设置 response_format） */
  json?: boolean;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  text: string;
  provider: LlmProviderId;
  model: string;
  latencyMs: number;
  usage: LlmUsage;
  /** 是否为确定性演示输出 */
  fixture: boolean;
}

export type LlmErrorCode = "CONFIG" | "UPSTREAM" | "TIMEOUT" | "BAD_RESPONSE";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly hint: string | null;

  constructor(code: LlmErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.hint = hint ?? null;
  }
}

export interface LlmProvider {
  id: LlmProviderId;
  label: string;
  model: string;
  fixture: boolean;
  complete(messages: LlmMessage[], options: LlmCallOptions): Promise<LlmResult>;
}

export interface LlmStatus {
  provider: LlmProviderId | null;
  label: string;
  model: string;
  configured: boolean;
  fixture: boolean;
  /** 当前选择来源：后台配置 / 环境变量 / 按密钥推断 */
  source: "config" | "env" | "auto" | null;
  /** 未配置时的中文说明 + 切换方式 */
  hint: string | null;
  /** 当前 Provider 缺少的环境变量名（不包含值） */
  missing: string[];
  env: {
    LLM_PROVIDER: string | null;
    OPENAI_API_KEY: boolean;
    OPENAI_BASE_URL: boolean;
    LLM_MODEL: string | null;
    COZE_API_KEY: boolean;
    COZE_MODEL: string | null;
  };
  envKeys: string[];
}

export interface LlmRuntimeConfig {
  providerId: LlmProviderId;
  model: string;
}

export const FIXTURE_MODEL = "fixture-deterministic-v1";

export const DEMO_HINT =
  "缺少 LLM 配置：请设置 LLM_PROVIDER=openai-compatible 并配置 OPENAI_API_KEY / OPENAI_BASE_URL / LLM_MODEL，" +
  "或设置 LLM_PROVIDER=coze 并配置 COZE_API_KEY（需要安装 coze-coding-dev-sdk）。" +
  "如果想在没有外部密钥的情况下演示，请显式设置 LLM_PROVIDER=classroom-fixture（确定性输出，会标注为课堂演示模式）。";
