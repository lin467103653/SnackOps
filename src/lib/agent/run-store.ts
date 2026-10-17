/**
 * RunRecord 持久化。所有写入都走 updateJson（文件锁 + 原子 rename），
 * 写入前用 zod 校验整个数组，保证刷新后历史记录仍然可读。
 */
import { z } from "zod";

import { ApiError } from "../api";
import { agentRunSchema } from "../schemas";
import { readJsonOrNull, updateJson } from "../store";
import type { AgentRunRecord } from "../types";

const FILE = "agent-runs.json";
const MAX_RECORDS = 300;
const runsSchema = z.array(agentRunSchema);

export async function readAgentRuns(): Promise<AgentRunRecord[]> {
  const raw = await readJsonOrNull<unknown>(FILE);
  if (raw === null) return [];
  const parsed = runsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(500, `agent-runs.json 结构损坏：${parsed.error.issues[0]?.message ?? "未知错误"}`);
  }
  return parsed.data;
}

export async function listAgentRuns(limit = 20, offset = 0): Promise<{ total: number; items: AgentRunRecord[] }> {
  const all = await readAgentRuns();
  const sorted = [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { total: sorted.length, items: sorted.slice(offset, offset + limit) };
}

export async function getAgentRun(id: string): Promise<AgentRunRecord | null> {
  const all = await readAgentRuns();
  return all.find((run) => run.id === id) ?? null;
}

export async function appendAgentRun(run: AgentRunRecord): Promise<void> {
  await updateJson<AgentRunRecord[]>(FILE, (current) => {
    const next = [run, ...(current ?? [])].slice(0, MAX_RECORDS);
    const parsed = runsSchema.safeParse(next);
    if (!parsed.success) {
      throw new ApiError(500, `RunRecord 不符合契约：${parsed.error.issues[0]?.message ?? "未知错误"}`);
    }
    return parsed.data;
  });
}

export async function updateAgentRun(
  id: string,
  patch: (run: AgentRunRecord) => AgentRunRecord,
): Promise<AgentRunRecord> {
  let updated: AgentRunRecord | null = null;

  await updateJson<AgentRunRecord[]>(FILE, (current) => {
    const list = current ?? [];
    const index = list.findIndex((run) => run.id === id);
    if (index < 0) throw new ApiError(404, `运行记录不存在：${id}`);
    updated = patch(list[index]!);
    const next = [...list];
    next[index] = updated;
    const parsed = runsSchema.safeParse(next);
    if (!parsed.success) {
      throw new ApiError(500, `RunRecord 更新后不符合契约：${parsed.error.issues[0]?.message ?? "未知错误"}`);
    }
    return parsed.data;
  });

  if (!updated) throw new ApiError(500, "更新失败：写入后未取回运行记录");
  return updated;
}
