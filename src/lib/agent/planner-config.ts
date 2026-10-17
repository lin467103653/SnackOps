/**
 * Planner 配置：版本、模型参数、系统提示词与能力白名单。
 *
 * 页面上的「保存」会：校验 → 版本 patch +1 → 写历史（promptHash）→ 落盘。
 * 运行时（真实运行与预览）都读这份配置，所以 UI 上的改动会真的影响计划。
 */
import { ApiError } from "../api";
import { saveCollection } from "../collections";
import { loadCollection } from "../collections";
import { plannerConfigSchema } from "../schemas";
import { OPERATOR } from "../constants";
import { hashContent } from "../skills/files";
import type { z } from "zod";

export type PlannerConfig = z.infer<typeof plannerConfigSchema>;

export async function getPlannerConfig(): Promise<PlannerConfig> {
  return loadCollection("planner-config");
}

export interface PlannerConfigPatch {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  allowedSkills?: string[];
  allowedTools?: string[];
  defaultMandatoryCapabilities?: string[];
  changeNote?: string;
}

export async function updatePlannerConfig(patch: PlannerConfigPatch): Promise<PlannerConfig> {
  const current = await getPlannerConfig();
  const now = new Date().toISOString();
  const nextPrompt = patch.systemPrompt !== undefined ? `${patch.systemPrompt.replace(/\s+$/u, "")}\n` : current.systemPrompt;
  const nextHash = hashContent(nextPrompt);
  const promptChanged = nextHash !== current.promptHash;
  const nextVersion = bumpPatch(current.version);

  const candidate: PlannerConfig = {
    ...current,
    model: patch.model?.trim() || current.model,
    temperature: patch.temperature ?? current.temperature,
    maxTokens: patch.maxTokens ?? current.maxTokens,
    systemPrompt: nextPrompt,
    promptHash: nextHash,
    allowedSkills: patch.allowedSkills ?? current.allowedSkills,
    allowedTools: patch.allowedTools ?? current.allowedTools,
    defaultMandatoryCapabilities: patch.defaultMandatoryCapabilities ?? current.defaultMandatoryCapabilities,
    version: promptChanged ? nextVersion : current.version,
    updatedAt: now,
    updatedBy: OPERATOR,
    history:
      promptChanged
        ? [
            {
              version: nextVersion,
              createdAt: now,
              changeNote: patch.changeNote?.trim() || "更新 Planner 提示词",
              promptHash: nextHash,
            },
            ...current.history,
          ].slice(0, 20)
        : current.history,
  };

  const parsed = plannerConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ApiError(
      422,
      `Planner 配置不合法：${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".") || "字段"} ${issue.message}`)
        .join("；")}`,
    );
  }

  await saveCollection("planner-config", parsed.data);
  return parsed.data;
}

export function bumpPatch(version: string): string {
  const [major = "1", minor = "0", patch = "0"] = version.split(".");
  return `${Number(major) || 1}.${Number(minor) || 0}.${(Number(patch) || 0) + 1}`;
}
