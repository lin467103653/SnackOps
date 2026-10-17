/**
 * Tool 注册中心：读注册表（data/tools.json）+ 绑定代码里的 handler。
 *
 * 一个 Tool 只有在「注册表里有定义」且「代码里有实现」时才可执行；
 * 只注册没实现（或反之）会在清单里标出来，避免 Planner 拿到一个空壳工具。
 */
import { ApiError } from "../api";
import { saveCollection } from "../collections";
import { getTools } from "../data";
import { entityIdPattern } from "../schemas";
import type { Tool } from "../types";
import { ToolError, toolHandlers } from "./handlers";

export interface ToolExecutionResult {
  toolId: string;
  input: unknown;
  output: Record<string, unknown>;
  durationMs: number;
  testedAt: string;
  usedSampleInput: boolean;
}

export function assertToolId(id: string): string {
  if (!id || id.length > 48 || !entityIdPattern.test(id)) {
    throw new ApiError(400, `非法的 Tool id「${id}」`);
  }
  return id;
}

export function hasHandler(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(toolHandlers, id);
}

export function handlerIds(): string[] {
  return Object.keys(toolHandlers);
}

export async function listTools(): Promise<Tool[]> {
  const tools = await getTools();
  return [...tools].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listEnabledTools(): Promise<Tool[]> {
  return (await listTools()).filter((tool) => tool.enabled);
}

export async function getToolOrThrow(id: string): Promise<Tool> {
  const tools = await getTools();
  const tool = tools.find((item) => item.id === id);
  if (!tool) throw new ApiError(404, `Tool 不存在：${id}`);
  return tool;
}

export async function setToolEnabled(id: string, enabled: boolean): Promise<Tool> {
  const tools = await getTools();
  const index = tools.findIndex((item) => item.id === id);
  if (index < 0) throw new ApiError(404, `Tool 不存在：${id}`);

  const next: Tool = { ...tools[index]!, enabled, updatedAt: new Date().toISOString() };
  await saveCollection(
    "tools",
    tools.map((item, i) => (i === index ? next : item)),
  );
  return next;
}

/** 注册表与实现不一致的清单（页面用于提示「未实现」/「孤儿实现」） */
export function auditTools(tools: Tool[]): { unimplemented: string[]; orphanHandlers: string[] } {
  const registered = new Set(tools.map((tool) => tool.id));
  return {
    unimplemented: tools.filter((tool) => !hasHandler(tool.id)).map((tool) => tool.id),
    orphanHandlers: handlerIds().filter((id) => !registered.has(id)),
  };
}

/**
 * 执行单个 Tool。
 * input 省略时使用注册表里的 sampleInput（即「可测试入口」的默认值）。
 */
export async function runTool(id: string, input?: unknown): Promise<ToolExecutionResult> {
  const toolId = assertToolId(id);
  const tool = await getToolOrThrow(toolId);

  const handler = toolHandlers[toolId as keyof typeof toolHandlers];
  if (!handler) throw new ApiError(501, `Tool 尚无实现：${toolId}`);

  const usedSampleInput = input === undefined || input === null;
  const payload = usedSampleInput ? tool.sampleInput : input;
  const startedAt = performance.now();

  try {
    const output = await handler(payload);
    return {
      toolId,
      input: payload,
      output,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      testedAt: new Date().toISOString(),
      usedSampleInput,
    };
  } catch (error) {
    if (error instanceof ToolError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_INPUT" ? 422 : 500;
      throw new ApiError(status, `[${toolId}] ${error.message}`);
    }
    throw new ApiError(500, `[${toolId}] 执行失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}
