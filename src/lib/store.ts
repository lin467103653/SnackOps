/**
 * SnackOps JSON 存储层（仅服务端）
 *
 * 设计约束（与「数据存储层」验收项一一对应）：
 * 1. JSON 读取            -> readJson / readJsonValidated
 * 2. JSON 写入            -> writeJson
 * 3. 进程级按文件加锁      -> withFileLock（同一文件串行，不同文件并行）
 * 4. 临时文件 + 原子 rename -> writeJson 内部 .tmp -> fsync -> rename
 * 5. 写失败保留上一份数据    -> 序列化失败不落盘；rename 失败清理 tmp；.bak 兜底
 * 6. 数据目录可推导        -> SNACKOPS_DATA_DIR 或 <cwd>/data
 * 7. 客户端不可直接读写     -> 本模块只允许在 Node 运行时执行 + API 路由统一出口
 *
 * 这里只有「存储原语」，业务语义在 src/lib/data.ts / queries.ts。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ZodType } from "zod";

if (typeof window !== "undefined") {
  throw new Error("store.ts 只能在服务端运行：客户端禁止直接读写 data/*.json");
}

/* -------------------------------------------------------------------------- */
/* 类型与错误                                                                  */
/* -------------------------------------------------------------------------- */

export type StoreErrorCode =
  | "INVALID_FILE_NAME"
  | "NOT_FOUND"
  | "READ_FAILED"
  | "PARSE_ERROR"
  | "SERIALIZE_ERROR"
  | "WRITE_FAILED"
  | "LOCK_TIMEOUT";

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  readonly file: string;

  constructor(code: StoreErrorCode, message: string, options: { file?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StoreError";
    this.code = code;
    this.file = options.file ?? "";
  }
}

export interface WriteResult {
  file: string;
  path: string;
  bytes: number;
  durationMs: number;
  replacedExisting: boolean;
}

export interface DataFileInfo {
  file: string;
  bytes: number;
  modifiedAt: string;
  /** 顶层是否为数组，方便通用数据浏览器渲染 */
  shape: "array" | "object" | "unknown";
  count: number;
}

export interface StoreMetricsSnapshot {
  reads: number;
  writes: number;
  lockAcquisitions: number;
  lockContentions: number;
  maxLockQueueDepth: number;
  activeLocks: number;
  recoveryCount: number;
}

/* -------------------------------------------------------------------------- */
/* 路径解析                                                                    */
/* -------------------------------------------------------------------------- */

const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

/** 数据目录：环境变量优先，其次项目根目录/data（不依赖 process.cwd 之外的绝对路径） */
export function getDataDir(): string {
  const configured = process.env.SNACKOPS_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "data");
}

export function isValidDataFileName(file: string): boolean {
  return FILE_NAME_PATTERN.test(file) && !file.includes("..");
}

function assertFileName(file: string): void {
  if (!isValidDataFileName(file)) {
    throw new StoreError("INVALID_FILE_NAME", `非法的数据文件名：${file}（只允许 <name>.json）`, { file });
  }
}

/** 统一的数据文件绝对路径；拒绝路径穿越 */
export function dataFilePath(file: string): string {
  assertFileName(file);
  const dir = getDataDir();
  const resolved = path.resolve(dir, file);
  if (path.dirname(resolved) !== dir) {
    throw new StoreError("INVALID_FILE_NAME", `数据文件必须直接位于数据目录：${file}`, { file });
  }
  return resolved;
}

export function getBackupPath(target: string): string {
  return `${target}.bak`;
}

export async function ensureDataDir(): Promise<string> {
  const dir = getDataDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/* -------------------------------------------------------------------------- */
/* 指标                                                                        */
/* -------------------------------------------------------------------------- */

const metrics = {
  reads: 0,
  writes: 0,
  lockAcquisitions: 0,
  lockContentions: 0,
  maxLockQueueDepth: 0,
  activeLocks: 0,
  recoveryCount: 0,
};

export function getStoreMetrics(): StoreMetricsSnapshot {
  return { ...metrics };
}

/* -------------------------------------------------------------------------- */
/* 进程级按文件锁                                                              */
/* -------------------------------------------------------------------------- */

const lockTails = new Map<string, Promise<void>>();
const lockQueueDepth = new Map<string, number>();

/**
 * 同一个进程内对同一文件的写操作串行执行；不同文件互不阻塞。
 * 注意：这是进程级锁。跨进程（多实例）安全由「临时文件 + 原子 rename」保证，
 * 多实例部署需要换成文件锁/数据库，见 README「存储层边界」。
 */
export async function withFileLock<T>(target: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(target);
  const previous = lockTails.get(key) ?? Promise.resolve();
  const depth = (lockQueueDepth.get(key) ?? 0) + 1;
  lockQueueDepth.set(key, depth);
  metrics.maxLockQueueDepth = Math.max(metrics.maxLockQueueDepth, depth);
  if (depth > 1) metrics.lockContentions += 1;

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // 无论前序任务成功或失败，都要放行后续任务
  const tail = previous.then(
    () => gate,
    () => gate,
  );
  lockTails.set(key, tail);

  await previous.catch(() => undefined);

  metrics.lockAcquisitions += 1;
  metrics.activeLocks += 1;
  try {
    return await task();
  } finally {
    metrics.activeLocks -= 1;
    const remaining = (lockQueueDepth.get(key) ?? 1) - 1;
    if (remaining <= 0) lockQueueDepth.delete(key);
    else lockQueueDepth.set(key, remaining);
    release();
    if (lockTails.get(key) === tail) lockTails.delete(key);
  }
}

/* -------------------------------------------------------------------------- */
/* 读取                                                                        */
/* -------------------------------------------------------------------------- */

async function readFileIfExists(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return null;
    throw new StoreError("READ_FAILED", `读取失败：${path.basename(target)}`, { file: target, cause: error });
  }
}

/**
 * 读取原始文本。目标文件缺失或损坏时，尝试 .bak（上一份有效数据）并回填。
 */
async function readTextWithRecovery(target: string, file: string): Promise<string> {
  const primary = await readFileIfExists(target);

  if (primary !== null) {
    try {
      JSON.parse(primary);
      return primary;
    } catch (error) {
      // 主文件损坏：尝试备份，避免整站因为一次异常中断而不可用
      const backup = await readFileIfExists(getBackupPath(target));
      if (backup !== null && parses(backup)) {
        metrics.recoveryCount += 1;
        warn(`数据文件 ${file} 解析失败，已回退到备份 .bak`, error);
        return backup;
      }
      throw new StoreError("PARSE_ERROR", `数据文件 ${file} 不是合法 JSON`, { file, cause: error });
    }
  }

  const backup = await readFileIfExists(getBackupPath(target));
  if (backup !== null && parses(backup)) {
    metrics.recoveryCount += 1;
    warn(`数据文件 ${file} 缺失，已从备份 .bak 恢复`);
    return backup;
  }

  throw new StoreError("NOT_FOUND", `数据文件不存在：${file}`, { file });
}

export async function readJson<T = unknown>(file: string): Promise<T> {
  const target = dataFilePath(file);
  const text = await readTextWithRecovery(target, file);
  metrics.reads += 1;
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new StoreError("PARSE_ERROR", `数据文件 ${file} 不是合法 JSON`, { file, cause: error });
  }
}

/** 读取并用 zod 校验，保证 UI/API 拿到的结构可信 */
export async function readJsonValidated<T>(file: string, schema: ZodType<T>): Promise<T> {
  const raw = await readJson<unknown>(file);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new StoreError("PARSE_ERROR", `数据文件 ${file} 结构校验失败：${formatZodError(parsed.error)}`, {
      file,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export async function readJsonOrNull<T = unknown>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (error) {
    if (error instanceof StoreError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* 写入                                                                        */
/* -------------------------------------------------------------------------- */

function serializeJson(value: unknown, file: string): string {
  try {
    return `${JSON.stringify(value, null, 2)}\n`;
  } catch (error) {
    // 循环引用 / BigInt 等序列化失败：绝不能在磁盘上留下半份数据
    throw new StoreError("SERIALIZE_ERROR", `无法序列化 ${file}，未写入任何内容`, { file, cause: error });
  }
}

async function writeJsonUnlocked(target: string, file: string, payload: string): Promise<WriteResult> {
  const startedAt = performance.now();
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });

  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`);
  const existed = await fs
    .stat(target)
    .then(() => true)
    .catch(() => false);

  try {
    // 1) 先写临时文件并 fsync，确保内容真正落盘
    const handle = await fs.open(tmp, "wx", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    // 2) 备份上一份有效数据（best effort，用于损坏时的回滚）
    if (existed) {
      try {
        await fs.copyFile(target, getBackupPath(target));
      } catch (error) {
        warn(`备份 ${file} 失败，继续写入`, error);
      }
    }

    // 3) 原子替换目标文件：同目录 rename，读方要么看到旧版本，要么看到新版本
    await fs.rename(tmp, target);
    await syncDirectory(dir);

    metrics.writes += 1;
    return {
      file,
      path: target,
      bytes: Buffer.byteLength(payload, "utf8"),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      replacedExisting: existed,
    };
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw new StoreError("WRITE_FAILED", `写入 ${file} 失败，已保留上一份有效数据`, { file, cause: error });
  }
}

export async function writeJson<T>(file: string, value: T): Promise<WriteResult> {
  const target = dataFilePath(file);
  const payload = serializeJson(value, file); // 序列化在加锁/落盘之前完成
  return withFileLock(target, () => writeJsonUnlocked(target, file, payload));
}

/**
 * 读-改-写：整个事务在同一个文件锁内完成，避免并发写导致的丢更新。
 */
export async function updateJson<T>(
  file: string,
  updater: (current: T | undefined) => T | Promise<T>,
): Promise<{ value: T; result: WriteResult }> {
  const target = dataFilePath(file);

  return withFileLock(target, async () => {
    let current: T | undefined;
    try {
      current = await readJson<T>(file);
    } catch (error) {
      if (!(error instanceof StoreError) || error.code !== "NOT_FOUND") throw error;
      current = undefined;
    }

    const next = await updater(current);
    const payload = serializeJson(next, file);
    const result = await writeJsonUnlocked(target, file, payload);
    return { value: next, result };
  });
}

/* -------------------------------------------------------------------------- */
/* 目录巡检                                                                    */
/* -------------------------------------------------------------------------- */

export async function listDataFiles(): Promise<DataFileInfo[]> {
  const dir = await ensureDataDir();
  // 数据目录是运行时内容，不属于构建产物：用 turbopackIgnore 让打包器跳过动态追踪
  const entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && isValidDataFileName(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const infos = await Promise.all(
    files.map(async (file) => {
      const target = path.join(/*turbopackIgnore: true*/ dir, file);
      const stat = await fs.stat(/*turbopackIgnore: true*/ target);
      let shape: DataFileInfo["shape"] = "unknown";
      let count = 0;
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ target, "utf8"));
        if (Array.isArray(parsed)) {
          shape = "array";
          count = parsed.length;
        } else if (parsed && typeof parsed === "object") {
          shape = "object";
          count = Object.keys(parsed as Record<string, unknown>).length;
        }
      } catch {
        shape = "unknown";
      }
      return {
        file,
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        shape,
        count,
      } satisfies DataFileInfo;
    }),
  );

  return infos;
}

/** 列出遗留的临时文件（正常情况下应为 0，用于验证原子写清理） */
export async function listStaleTempFiles(): Promise<string[]> {
  const dir = await ensureDataDir();
  const entries = await fs.readdir(/*turbopackIgnore: true*/ dir);
  return entries.filter((name) => name.endsWith(".tmp"));
}

/** 删除一个数据文件（同时清理 .bak），用于诊断临时文件收尾 */
export async function deleteJson(file: string): Promise<void> {
  const target = dataFilePath(file);
  await withFileLock(target, async () => {
    await fs.rm(target, { force: true });
    await fs.rm(getBackupPath(target), { force: true });
  });
}

/* -------------------------------------------------------------------------- */
/* 内部工具                                                                    */
/* -------------------------------------------------------------------------- */

function parses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

async function syncDirectory(dir: string): Promise<void> {
  if (process.platform === "win32") return; // Windows 不支持对目录 fsync
  try {
    const handle = await fs.open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // 目录 fsync 失败不影响原子写语义（rename 本身已经原子）
  }
}

function formatZodError(error: { issues: { path: (string | number | symbol)[]; message: string }[] }): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

function warn(message: string, error?: unknown): void {
  if (process.env.NODE_ENV === "test") return;
  console.warn(`[snackops/store] ${message}`, error instanceof Error ? error.message : (error ?? ""));
}
