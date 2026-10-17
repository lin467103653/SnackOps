/**
 * 写操作（全部落在本地 JSON 上）。
 *
 * 约定：
 * - 所有读-改-写都走 updateJson，天然带文件锁，避免并发丢更新；
 * - 返回值是写入后的实体，API 直接回给前端，前端 router.refresh() 刷新服务端页面；
 * - Skill 正文与版本的写入在 src/lib/skills/*，Tool 执行在 src/lib/tools/*，不在这里。
 */
import { ApiError } from "./api";
import { saveCollection } from "./collections";
import { OPERATOR } from "./constants";
import {
  getAgentRuns,
  getEvalCases,
  getLlmConfig,
  getRuns,
  getRuntimeFallback,
  getSkillVersions,
  getSkills,
  getTickets,
} from "./data";
import type { Annotation, Improvement, LlmConfig, RuntimeFallback, Ticket } from "./types";
import { updateJson } from "./store";
import type { AnnotationInput, ConfigInput, ImprovementInput, TakeoverInput } from "./validation";

export { OPERATOR };

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/* -------------------------------------------------------------------------- */
/* 标注                                                                        */
/* -------------------------------------------------------------------------- */

async function annotationTargetExists(targetType: AnnotationInput["targetType"], targetId: string): Promise<boolean> {
  switch (targetType) {
    case "run":
      return (await getRuns()).some((run) => run.id === targetId);
    case "agent_run":
      return (await getAgentRuns()).some((run) => run.id === targetId);
    case "skill_version":
      return (await getSkillVersions()).some((version) => version.id === targetId);
    case "eval_case":
      return (await getEvalCases()).some((testCase) => testCase.id === targetId);
    case "ticket":
      return (await getTickets()).some((ticket) => ticket.id === targetId);
    default:
      return false;
  }
}

export async function createAnnotation(input: AnnotationInput): Promise<Annotation> {
  const exists = await annotationTargetExists(input.targetType, input.targetId);
  if (!exists) {
    throw new ApiError(404, `标注目标不存在：${input.targetType} / ${input.targetId}`);
  }

  const record: Annotation = {
    id: makeId("ann"),
    targetType: input.targetType,
    targetId: input.targetId,
    tag: input.tag,
    note: input.note,
    author: OPERATOR,
    createdAt: nowIso(),
    status: "pending",
    dimensions: null,
    source: "run_detail",
  };

  await updateJson<Annotation[]>("annotations.json", (current) => [record, ...(current ?? [])]);
  return record;
}

/* -------------------------------------------------------------------------- */
/* 工单接管                                                                    */
/* -------------------------------------------------------------------------- */

export async function takeoverTicket(ticketId: string, input: TakeoverInput = {}): Promise<Ticket> {
  let updated: Ticket | null = null;

  await updateJson<Ticket[]>("tickets.json", (current) => {
    const tickets = current ?? [];
    const index = tickets.findIndex((ticket) => ticket.id === ticketId);
    if (index < 0) throw new ApiError(404, "工单不存在，可能已被清理，请刷新列表");

    const ticket = tickets[index]!;
    if (ticket.status === "已解决") throw new ApiError(409, "该工单已解决，无需接管");
    if (ticket.status === "已接管") throw new ApiError(409, "该工单已被接管，请刷新后查看当前负责人");

    const minutes = Math.max(0, Math.round((Date.now() - new Date(ticket.createdAt).getTime()) / 60_000));
    updated = {
      ...ticket,
      status: "已接管",
      assignee: input.assignee ?? OPERATOR,
      firstResponseMinutes: ticket.firstResponseMinutes ?? minutes,
    };
    tickets[index] = updated;
    return [...tickets];
  });

  if (!updated) throw new ApiError(500, "接管失败：写入后未取回工单");
  return updated;
}

/* -------------------------------------------------------------------------- */
/* 改进项                                                                      */
/* -------------------------------------------------------------------------- */

export async function createImprovement(input: ImprovementInput): Promise<Improvement> {
  const skills = await getSkills();
  if (!skills.some((skill) => skill.id === input.skillKey)) {
    throw new ApiError(404, `Skill 不存在：${input.skillKey}`);
  }

  const dueAt = input.dueAt ? new Date(input.dueAt) : new Date(Date.now() + 14 * 86_400_000);
  if (Number.isNaN(dueAt.getTime())) throw new ApiError(422, "截止时间格式不正确");

  const record: Improvement = {
    id: makeId("imp"),
    title: input.title,
    source: input.source,
    skillKey: input.skillKey,
    priority: input.priority,
    status: "待评估",
    owner: input.owner,
    expectedGain: input.expectedGain,
    createdAt: nowIso(),
    dueAt: dueAt.toISOString(),
    linkedRuns: [],
    direction: "Skill",
  };

  await updateJson<Improvement[]>("improvements.json", (current) => [record, ...(current ?? [])]);
  return record;
}

/* -------------------------------------------------------------------------- */
/* 运行时配置                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveConfig(input: ConfigInput): Promise<LlmConfig | RuntimeFallback> {
  if (input.key === "llm-config") {
    const current = await getLlmConfig();
    const next: LlmConfig = {
      ...current,
      ...input.value,
      updatedAt: nowIso(),
      updatedBy: OPERATOR,
    };
    await saveCollection("llm-config", next);
    return next;
  }

  const current = await getRuntimeFallback();
  const next: RuntimeFallback = {
    ...current,
    ...input.value,
    updatedAt: nowIso(),
  };
  await saveCollection("runtime-fallback", next);
  return next;
}
