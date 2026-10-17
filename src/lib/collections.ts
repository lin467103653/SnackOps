/**
 * 数据集合注册表 + 类型化读写入口。
 *
 * 23 个 JSON 文件与 zod schema、中文标签、分组在这里集中登记，
 * 页面、API、诊断接口都通过本模块访问数据，禁止各自拼接文件名。
 */
import type { ZodType } from "zod";
import { z } from "zod";
import * as s from "./schemas";
import { StoreError, readJson, writeJson, type WriteResult } from "./store";

type Entry = {
  file: string;
  label: string;
  group: string;
  summary: string;
  kind: "list" | "config";
  schema: ZodType<unknown>;
};

export const collectionRegistry = {
  products: {
    file: "products.json",
    label: "商品",
    group: "商品与营销",
    summary: "SKU、口味、配料、过敏原、糖分营养与库存",
    kind: "list",
    schema: z.array(s.productSchema),
  },
  activities: {
    file: "activities.json",
    label: "营销活动",
    group: "商品与营销",
    summary: "门槛、优惠规则、适用范围与有效期",
    kind: "list",
    schema: z.array(s.activitySchema),
  },
  coupons: {
    file: "coupons.json",
    label: "优惠券",
    group: "商品与营销",
    summary: "券规则、适用商品、叠加策略与核销",
    kind: "list",
    schema: z.array(s.couponSchema),
  },
  orders: {
    file: "orders.json",
    label: "订单",
    group: "交易与用户",
    summary: "订单明细、物流状态与售后状态",
    kind: "list",
    schema: z.array(s.orderSchema),
  },
  users: {
    file: "users.json",
    label: "用户",
    group: "交易与用户",
    summary: "新客标记、会员等级、偏好与过敏禁忌",
    kind: "list",
    schema: z.array(s.userSchema),
  },
  "return-policies": {
    file: "return-policies.json",
    label: "售后政策",
    group: "知识与规则",
    summary: "破损/缺件/退换货/退款的时效、赔付与例外",
    kind: "list",
    schema: z.array(s.returnPolicySchema),
  },
  logistics: {
    file: "logistics.json",
    label: "物流轨迹",
    group: "知识与规则",
    summary: "承运商、最新节点与延误时长",
    kind: "list",
    schema: z.array(s.logisticsSchema),
  },
  faq: {
    file: "faq.json",
    label: "FAQ 知识",
    group: "知识与规则",
    summary: "高频问答、命中次数与启用状态",
    kind: "list",
    schema: z.array(s.faqSchema),
  },
  "handoff-rules": {
    file: "handoff-rules.json",
    label: "转人工规则",
    group: "知识与规则",
    summary: "什么情况下必须转人工、升级或禁止承诺",
    kind: "list",
    schema: z.array(s.handoffRuleSchema),
  },
  tickets: {
    file: "tickets.json",
    label: "工单",
    group: "工单与运行",
    summary: "待处理会话、意图、优先级与 SLA",
    kind: "list",
    schema: z.array(s.ticketSchema),
  },
  runs: {
    file: "runs.json",
    label: "历史运行记录",
    group: "工单与运行",
    summary: "第一段的演示运行记录（运营视角）",
    kind: "list",
    schema: z.array(s.runSchema),
  },
  "agent-runs": {
    file: "agent-runs.json",
    label: "Agent 运行",
    group: "工单与运行",
    summary: "Agent 主链路 RunRecord：Plan、步骤 Trace、风险结果与最终回复",
    kind: "list",
    schema: z.array(s.agentRunSchema),
  },
  ratings: {
    file: "ratings.json",
    label: "评分",
    group: "工单与运行",
    summary: "人工评分、维度与点评",
    kind: "list",
    schema: z.array(s.ratingSchema),
  },
  annotations: {
    file: "annotations.json",
    label: "标注",
    group: "工单与运行",
    summary: "好/坏案例标注与知识缺口",
    kind: "list",
    schema: z.array(s.annotationSchema),
  },
  skills: {
    file: "skills.json",
    label: "Skill 注册表",
    group: "Agent 资产",
    summary: "流水线各阶段的 Skill：模型参数、依赖工具与提示词正文",
    kind: "list",
    schema: z.array(s.skillSchema),
  },
  "skill-versions": {
    file: "skill-versions.json",
    label: "Skill 版本",
    group: "Agent 资产",
    summary: "提示词快照：正文、哈希、变更说明与评测分",
    kind: "list",
    schema: z.array(s.skillVersionSchema),
  },
  tools: {
    file: "tools.json",
    label: "Tool 注册表",
    group: "Agent 资产",
    summary: "工具能力、输入输出 JSON Schema 与启用状态",
    kind: "list",
    schema: z.array(s.toolSchema),
  },
  "tools-config": {
    file: "tools-config.json",
    label: "Tool 运行配置",
    group: "Agent 资产",
    summary: "超时、重试、限流与二次确认",
    kind: "list",
    schema: z.array(s.toolConfigSchema),
  },
  improvements: {
    file: "improvements.json",
    label: "改进项",
    group: "评测与实验",
    summary: "从 badcase 到上线的改进闭环",
    kind: "list",
    schema: z.array(s.improvementSchema),
  },
  "eval-batch": {
    file: "eval-batch.json",
    label: "批量评测（Agent）",
    group: "评测与实验",
    summary: "批次快照、逐用例结果与版本对比",
    kind: "list",
    schema: z.array(s.evalBatchSchemaV2),
  },
  "eval-cases": {
    file: "eval-cases.json",
    label: "评测集（Agent）",
    group: "评测与实验",
    summary: "走 Agent 主链路评测：期望行为、关键词、禁词、价格、能力与风控字段（唯一评测存储）",
    kind: "list",
    schema: z.array(s.evalCaseSchemaV2),
  },
  "ab-tests": {
    file: "ab-tests.json",
    label: "AB 实验",
    group: "评测与实验",
    summary: "流量分配、指标差异与结论",
    kind: "list",
    schema: z.array(s.abTestSchema),
  },
  "llm-config": {
    file: "llm-config.json",
    label: "模型配置",
    group: "运行时配置",
    summary: "Provider、默认/规划/兜底模型与采样参数",
    kind: "config",
    schema: s.llmConfigSchema,
  },
  "planner-config": {
    file: "planner-config.json",
    label: "Planner 配置",
    group: "运行时配置",
    summary: "Planner 版本、系统提示词、可选 Skill/Tool 白名单与默认必需能力",
    kind: "config",
    schema: s.plannerConfigSchema,
  },
  "runtime-fallback": {
    file: "runtime-fallback.json",
    label: "兜底策略",
    group: "运行时配置",
    summary: "重试、转人工与降级开关",
    kind: "config",
    schema: s.runtimeFallbackSchema,
  },
} as const satisfies Record<string, Entry>;

type Registry = typeof collectionRegistry;

export type CollectionName = keyof Registry;
export type CollectionData<C extends CollectionName> = z.infer<Registry[C]["schema"]>;

export const collectionNames = Object.keys(collectionRegistry) as CollectionName[];

export const collectionGroups = Array.from(new Set(collectionNames.map((name) => collectionRegistry[name].group)));

export function isCollectionName(value: string): value is CollectionName {
  return Object.prototype.hasOwnProperty.call(collectionRegistry, value);
}

export function collectionFile(name: CollectionName): string {
  return collectionRegistry[name].file;
}

/** 读取并按 schema 校验一个集合，失败直接抛 StoreError（页面会进入 error.tsx） */
export async function loadCollection<C extends CollectionName>(name: C): Promise<CollectionData<C>> {
  const entry = collectionRegistry[name];
  const raw = await readJson<unknown>(entry.file);
  const parsed = (entry.schema as unknown as ZodType<CollectionData<C>>).safeParse(raw);
  if (!parsed.success) {
    throw new StoreError(
      "PARSE_ERROR",
      `${entry.file} 结构校验失败：${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".") || "<root>"} ${issue.message}`)
        .join("; ")}`,
      { file: entry.file, cause: parsed.error },
    );
  }
  return parsed.data;
}

export type LoadOutcome<C extends CollectionName> =
  | { ok: true; name: C; data: CollectionData<C> }
  | { ok: false; name: C; error: string };

/** 容错读取：单个文件损坏时不拖垮整页（用于总览与数据浏览器） */
export async function loadCollectionSafe<C extends CollectionName>(name: C): Promise<LoadOutcome<C>> {
  try {
    const data = await loadCollection(name);
    return { ok: true, name, data };
  } catch (error) {
    return { ok: false, name, error: error instanceof Error ? error.message : "读取失败" };
  }
}

export async function saveCollection<C extends CollectionName>(
  name: C,
  data: CollectionData<C>,
): Promise<WriteResult> {
  const entry = collectionRegistry[name];
  const parsed = (entry.schema as unknown as ZodType<CollectionData<C>>).safeParse(data);
  if (!parsed.success) {
    throw new StoreError("SERIALIZE_ERROR", `${entry.file} 数据不符合契约，已拒绝写入`, {
      file: entry.file,
      cause: parsed.error,
    });
  }
  return writeJson(entry.file, parsed.data);
}

export function collectionLabel(name: CollectionName): string {
  return collectionRegistry[name].label;
}
