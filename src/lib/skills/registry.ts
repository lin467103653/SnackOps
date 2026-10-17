/**
 * Skill 注册中心。
 *
 * 读：skills.json（唯一注册表）→ 取排序、启用过滤、与镜像文件的一致性。
 * 写：改元数据（模型/温度/工具/启停）、保存正文（自动快照 + 版本递增 + 镜像文件）。
 *
 * 一致性策略：skills.json 是主存储（原子写 + 校验），skills/<id>.md 是可读镜像。
 * 保存顺序「注册表 → 版本 → 镜像」，镜像失败只告警不回滚，页面用 fileInSync 标出差异。
 */
import { ApiError } from "../api";
import { saveCollection } from "../collections";
import { getSkills } from "../data";
import { skillIdPattern, skillSchema } from "../schemas";
import type { Skill, SkillVersion } from "../types";
import { OPERATOR } from "../constants";
import { defaultSkillFilePath, hashContent, normalizeSkillFilePath, readSkillFile, resolveSkillFilePath, writeSkillFile } from "./files";
import { appendVersions, bumpPatch, listVersions } from "./versions";

export interface SkillFileState {
  exists: boolean;
  inSync: boolean;
  fileHash: string | null;
}

export interface SaveSkillContentInput {
  id: string;
  content: string;
  changeNote?: string;
  /** 可选：另存为新的文件路径（必须仍在 skills/ 内） */
  filePath?: string;
}

export interface SaveSkillContentResult {
  changed: boolean;
  skill: Skill;
  snapshot: SkillVersion | null;
  /** 本次编辑前自动新建的快照（仅当旧正文还没有任何快照时才会创建） */
  autoSnapshot: SkillVersion | null;
  /** 旧正文在版本库里的落点：可能是刚自动新建的，也可能是复用的已有快照 */
  beforeSnapshot: { id: string; version: string; changeNote: string } | null;
  fileInSync: boolean;
}

export function assertSkillId(id: string): string {
  if (!id || id.length > 48 || !skillIdPattern.test(id)) {
    throw new ApiError(400, `非法的 Skill id「${id}」`);
  }
  return id;
}

export async function listSkills(): Promise<Skill[]> {
  const skills = await getSkills();
  return [...skills].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-CN"));
}

export async function listEnabledSkills(): Promise<Skill[]> {
  return (await listSkills()).filter((skill) => skill.enabled);
}

export async function getSkillOrThrow(id: string): Promise<Skill> {
  const skills = await getSkills();
  const skill = skills.find((item) => item.id === id);
  if (!skill) throw new ApiError(404, `Skill 不存在：${id}`);
  return skill;
}

export async function getSkillFileState(skill: Skill): Promise<SkillFileState> {
  try {
    const state = await readSkillFile(skill.filePath);
    return { exists: state.exists, inSync: state.hash === skill.hash, fileHash: state.hash };
  } catch {
    return { exists: false, inSync: false, fileHash: null };
  }
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<Skill> {
  const skills = await getSkills();
  const index = skills.findIndex((item) => item.id === id);
  if (index < 0) throw new ApiError(404, `Skill 不存在：${id}`);

  const next: Skill = { ...skills[index]!, enabled, updatedAt: new Date().toISOString() };
  const updated = skills.map((item, i) => (i === index ? next : item));
  await saveCollection("skills", updated);
  return next;
}

export interface SkillMetaPatch {
  name?: string;
  description?: string;
  stage?: Skill["stage"];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  requiredTools?: string[];
  owner?: string;
}

export async function updateSkillMeta(id: string, patch: SkillMetaPatch): Promise<Skill> {
  const skills = await getSkills();
  const index = skills.findIndex((item) => item.id === id);
  if (index < 0) throw new ApiError(404, `Skill 不存在：${id}`);

  const candidate: Skill = {
    ...skills[index]!,
    ...cleanPatch(patch),
    updatedAt: new Date().toISOString(),
  };

  const parsed = skillSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ApiError(
      422,
      `Skill 配置不合法：${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".") || "字段"} ${issue.message}`)
        .join("；")}`,
    );
  }

  const updated = skills.map((item, i) => (i === index ? parsed.data : item));
  await saveCollection("skills", updated);
  return parsed.data;
}

/**
 * 保存正文：
 * 1. 保证「修改前的正文」在版本库里有落点——没有同内容快照才新建，避免重复留档；
 * 2. 版本号 patch +1，写注册表（原子）；
 * 3. 追加「保存后」的快照；
 * 4. 同步写 skills/<id>.md 镜像。
 */
export async function saveSkillContent(input: SaveSkillContentInput): Promise<SaveSkillContentResult> {
  const id = assertSkillId(input.id);
  const skills = await getSkills();
  const index = skills.findIndex((item) => item.id === id);
  if (index < 0) throw new ApiError(404, `Skill 不存在：${id}`);
  const current = skills[index]!;

  const content = normalizeContent(input.content);
  if (content.trim().length < 20) throw new ApiError(422, "提示词正文至少需要 20 个字符");
  if (content.length > 60_000) throw new ApiError(422, "提示词正文过长（上限 60000 字符）");

  const targetPath = normalizeSkillFilePath(input.filePath ?? current.filePath);
  // 越界路径在这里就抛 400，绝不会带着非法 filePath 写进注册表
  resolveSkillFilePath(targetPath);
  const fileInSyncBefore = await getSkillFileState(current);

  if (content === current.systemPrompt) {
    return {
      changed: false,
      skill: current,
      snapshot: null,
      autoSnapshot: null,
      beforeSnapshot: null,
      fileInSync: fileInSyncBefore.inSync,
    };
  }

  const now = new Date().toISOString();
  const nextVersion = bumpPatch(current.version);
  const nextHash = hashContent(content);
  const versions = await listVersions(id);

  // 旧正文的落点：内容相同即视为已留档，不重复记录
  const beforeHash = hashContent(current.systemPrompt);
  const existingBefore = versions.find((version) => version.hash === beforeHash && version.content === current.systemPrompt);

  const autoSnapshot: SkillVersion | null = existingBefore
    ? null
    : {
        id: `sv_${id}_${current.version}_auto_${Date.now().toString(36)}`,
        skillId: id,
        version: current.version,
        content: current.systemPrompt,
        hash: beforeHash,
        changeNote: "编辑前自动快照",
        auto: true,
        author: OPERATOR,
        createdAt: now,
        evalScore: null,
        regression: false,
      };

  const beforeSnapshot = existingBefore
    ? { id: existingBefore.id, version: existingBefore.version, changeNote: existingBefore.changeNote }
    : autoSnapshot
      ? { id: autoSnapshot.id, version: autoSnapshot.version, changeNote: autoSnapshot.changeNote }
      : null;

  const snapshot: SkillVersion = {
    id: `sv_${id}_${nextVersion}`,
    skillId: id,
    version: nextVersion,
    content,
    hash: nextHash,
    changeNote: input.changeNote?.trim() || "保存当前正文",
    auto: false,
    author: OPERATOR,
    createdAt: now,
    evalScore: null,
    regression: false,
  };

  const next: Skill = {
    ...current,
    systemPrompt: content,
    hash: nextHash,
    version: nextVersion,
    filePath: targetPath,
    updatedAt: now,
  };

  // 先写主存储，再写历史，最后写镜像
  await saveCollection(
    "skills",
    skills.map((item, i) => (i === index ? next : item)),
  );
  await appendVersions(autoSnapshot ? [autoSnapshot, snapshot] : [snapshot]);

  let fileInSync = true;
  try {
    await writeSkillFile(targetPath, content);
  } catch (error) {
    fileInSync = false;
    console.warn(`[snackops/skills] 镜像文件写入失败：${error instanceof Error ? error.message : String(error)}`);
  }

  return { changed: true, skill: next, snapshot, autoSnapshot, beforeSnapshot, fileInSync };
}

/** 供「重新导出镜像」使用：把注册表正文写回文件 */
export async function exportSkillFile(id: string): Promise<{ filePath: string; bytes: number }> {
  const skill = await getSkillOrThrow(id);
  const result = await writeSkillFile(skill.filePath, skill.systemPrompt);
  return { filePath: skill.filePath, bytes: result.bytes };
}

/** 供初始化/修复使用：确保 filePath 存在且不越界 */
export function resolveFilePath(id: string, filePath?: string): string {
  return filePath ?? defaultSkillFilePath(id);
}

function normalizeContent(content: string): string {
  return `${content.replace(/\r\n/g, "\n").replace(/\s+$/u, "")}\n`;
}

function cleanPatch(patch: SkillMetaPatch): SkillMetaPatch {
  const cleaned: SkillMetaPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (cleaned as Record<string, unknown>)[key] = value;
  }
  return cleaned;
}
