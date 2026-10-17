/**
 * Skill 版本快照的读写。
 *
 * 一次保存会写两条记录的场景：编辑前自动快照（保住上一份可回滚）+ 保存后的新版本。
 * 所有写入都走 updateJson（文件锁 + 原子 rename），并在写入前用 zod 校验整个数组，
 * 避免半截数据落盘。
 */
import { z } from "zod";

import { ApiError } from "../api";
import { loadCollection } from "../collections";
import { getSkills } from "../data";
import { skillVersionSchema } from "../schemas";
import { updateJson } from "../store";
import type { SkillVersion } from "../types";

const COLLECTION_FILE = "skill-versions.json";
const versionsSchema = z.array(skillVersionSchema);

export async function listVersions(skillId: string): Promise<SkillVersion[]> {
  const all = await readVersions();
  return all
    .filter((version) => version.skillId === skillId)
    .sort((a, b) => {
      const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (byTime !== 0) return byTime;
      return compareVersion(b.version, a.version);
    });
}

export async function readVersions(): Promise<SkillVersion[]> {
  // 纯读取：不能走 updateJson，否则每次打开页面都会重写文件并产生 .bak
  return loadCollection("skill-versions");
}

export async function getVersion(skillId: string, version: string): Promise<SkillVersion> {
  const versions = await listVersions(skillId);
  const found = versions.find((item) => item.version === version);
  if (!found) throw new ApiError(404, `版本不存在：${skillId}@${version}`);
  return found;
}

export async function getVersionById(skillId: string, id: string): Promise<SkillVersion> {
  const versions = await listVersions(skillId);
  const found = versions.find((item) => item.id === id);
  if (!found) throw new ApiError(404, `版本快照不存在：${id}`);
  return found;
}

export async function appendVersions(records: SkillVersion[]): Promise<SkillVersion[]> {
  if (records.length === 0) return [];
  const next = await mutateVersions((current) => [...records, ...current]);
  return records.filter((record) => next.some((item) => item.id === record.id));
}

export async function countVersions(skillId: string): Promise<number> {
  return (await listVersions(skillId)).length;
}

/** 取版本对应的正文：支持 `current`（当前保存中的正文） */
export async function resolveVersionContent(skillId: string, version: string): Promise<{ content: string; label: string }> {
  if (version === "current") {
    const skills = await getSkills();
    const skill = skills.find((item) => item.id === skillId);
    if (!skill) throw new ApiError(404, `Skill 不存在：${skillId}`);
    return { content: skill.systemPrompt, label: "当前正文" };
  }
  const found = await getVersion(skillId, version);
  return { content: found.content, label: `版本 ${found.version}` };
}

export function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number(part) || 0);
  const pb = b.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < 3; index += 1) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function bumpPatch(version: string): string {
  const [major = "1", minor = "0", patch = "0"] = version.split(".");
  return `${Number(major) || 1}.${Number(minor) || 0}.${(Number(patch) || 0) + 1}`;
}

async function mutateVersions(mutator: (current: SkillVersion[]) => SkillVersion[]): Promise<SkillVersion[]> {
  const { value } = await updateJson<SkillVersion[]>(COLLECTION_FILE, (current) => {
    const next = mutator(current ?? []);
    const parsed = versionsSchema.safeParse(next);
    if (!parsed.success) {
      throw new ApiError(
        500,
        `版本数据不符合契约：${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.map(String).join(".") || "<root>"} ${issue.message}`)
          .join("; ")}`,
      );
    }
    return parsed.data;
  });
  return value;
}
