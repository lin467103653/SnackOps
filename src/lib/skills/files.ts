/**
 * Skill 提示词文件（skills/<id>.md）的读写与路径防护。
 *
 * 这是本项目里唯一会写「数据目录之外」的地方，所以规则写死在这里：
 * - 只接受 `skills/<id>.md` 形态的路径；
 * - 解析后的绝对路径必须仍位于 skills/ 目录内（双重校验，防 `../` 与符号链接式越界）；
 * - 写入用临时文件 + 原子 rename，避免半截文件；
 * - 任何越界请求抛 ApiError(400)，由 API 层转成可读错误。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { ApiError } from "../api";

export const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_PATTERN = /^skills\/[\p{L}\p{N}_-]+\.md$/u;

export function projectRoot(): string {
  return process.cwd();
}

export function skillsDir(): string {
  return path.join(projectRoot(), SKILLS_DIR_NAME);
}

/** 把逻辑路径规范化为 `skills/<name>.md`（统一正斜杠、去掉多余空白） */
export function normalizeSkillFilePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

/**
 * 校验并解析 Skill 文件路径；非法或越界直接抛 400。
 * 返回值是绝对路径，供 fs 使用。
 */
export function resolveSkillFilePath(filePath: string): string {
  const normalized = normalizeSkillFilePath(filePath);

  if (!SKILL_FILE_PATTERN.test(normalized)) {
    throw new ApiError(400, `非法的 Skill 文件路径「${filePath}」：只允许 skills/<id>.md 形式`);
  }

  const dir = skillsDir();
  const absolute = path.resolve(dir, path.basename(normalized));
  const relative = path.relative(dir, absolute);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ApiError(400, `路径越界「${filePath}」：Skill 文件必须位于 skills/ 目录内`);
  }

  return absolute;
}

export function defaultSkillFilePath(id: string): string {
  return `${SKILLS_DIR_NAME}/${id}.md`;
}

/** 内容指纹：sha256 前 16 位，足够做版本比对与一致性检测 */
export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
}

export interface SkillFileState {
  filePath: string;
  content: string | null;
  exists: boolean;
  hash: string | null;
}

export async function readSkillFile(filePath: string): Promise<SkillFileState> {
  const absolute = resolveSkillFilePath(filePath);
  try {
    const content = await fs.readFile(absolute, "utf8");
    return { filePath, content, exists: true, hash: hashContent(content) };
  } catch (error) {
    if (isNotFound(error)) {
      return { filePath, content: null, exists: false, hash: null };
    }
    throw new ApiError(500, `读取 Skill 文件失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/** 原子写入：同目录 .tmp → fsync → rename */
export async function writeSkillFile(filePath: string, content: string): Promise<{ absolutePath: string; bytes: number }> {
  const absolute = resolveSkillFilePath(filePath);
  const dir = path.dirname(absolute);
  await fs.mkdir(dir, { recursive: true });

  const tmp = path.join(dir, `.${path.basename(absolute)}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`);
  try {
    const handle = await fs.open(tmp, "wx", 0o644);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, absolute);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw new ApiError(500, `写入 Skill 文件失败：${error instanceof Error ? error.message : "未知错误"}`);
  }

  return { absolutePath: absolute, bytes: Buffer.byteLength(content, "utf8") };
}

/** 列出 skills/ 下的注册文件（.md，排除隐藏文件与 README） */
export async function listSkillFiles(): Promise<string[]> {
  const dir = skillsDir();
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".") && entry.name !== "README.md")
    .map((entry) => `${SKILLS_DIR_NAME}/${entry.name}`)
    .sort();
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
