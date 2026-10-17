/**
 * 时间 / 金额 / 比率格式化。统一按 Asia/Shanghai 展示，
 * 避免服务端容器时区为 UTC 时运营看到错位的日期。
 */
const TIME_ZONE = "Asia/Shanghai";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** YYYY-MM-DD（上海时区） */
export function dayKey(value: string | Date): string {
  return dayKeyFormatter.format(toDate(value));
}

export function formatDate(value: string | Date): string {
  return dateFormatter.format(toDate(value));
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(toDate(value)).replace(/\//g, "-");
}

export function formatTime(value: string | Date): string {
  return timeFormatter.format(toDate(value));
}

export function formatMoney(value: number, options: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = options;
  const formatted = value.toLocaleString("zh-CN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `¥${formatted}` : formatted;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatPercentPoint(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatCompact(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)} 亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`;
  if (value >= 1_000) return value.toLocaleString("zh-CN");
  return String(value);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} 分 ${seconds} 秒`;
}

export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const diff = toDate(value).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const suffix = diff <= 0 ? "前" : "后";
  if (abs < 60_000) return diff <= 0 ? "刚刚" : "即将";
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)} 分钟${suffix}`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)} 小时${suffix}`;
  if (abs < 30 * 86_400_000) return `${Math.round(abs / 86_400_000)} 天${suffix}`;
  return formatDate(value);
}

export function isPast(value: string | Date, now: Date = new Date()): boolean {
  return toDate(value).getTime() < now.getTime();
}

/** 最近 N 天的日期键（含今天），升序 */
export function lastDayKeys(days: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  const base = now.getTime();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(dayKey(new Date(base - offset * 86_400_000)));
  }
  return keys;
}

export function shortDayLabel(key: string): string {
  return key.slice(5).replace("-", "/");
}
