/**
 * 密钥脱敏：任何要返回给前端 / 写日志的文本都过一遍，
 * 保证 API Key 不会出现在页面、客户端 bundle 或日志里。
 */
const SECRET_ENV_KEYS = ["OPENAI_API_KEY", "COZE_API_KEY"] as const;

export function redactSecrets(input: string): string {
  let output = input;

  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value && value.length >= 6) {
      output = output.split(value).join("***");
    }
  }

  // 兜底：常见的密钥字体
  return output
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-***")
    .replace(/\b(?:pat|sat)_[A-Za-z0-9]{10,}\b/g, "***");
}

export interface EnvFlag {
  key: string;
  present: boolean;
  /** 已配置时只显示长度与尾号，绝不回传原文 */
  masked: string | null;
}

export function envFlag(key: string): EnvFlag {
  const raw = process.env[key]?.trim() ?? "";
  if (!raw) return { key, present: false, masked: null };
  const tail = raw.length > 4 ? raw.slice(-4) : "";
  return { key, present: true, masked: `已配置（${raw.length} 位${tail ? `，尾号 ${tail}` : ""}）` };
}

export function secretEnvFlags(keys: readonly string[]): EnvFlag[] {
  return keys.map((key) => envFlag(key));
}
