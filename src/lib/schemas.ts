/**
 * 数据契约（zod）
 *
 * 这里是所有 data/*.json 的唯一事实来源：
 * - UI 与 API 读取数据时都会经过校验（见 src/lib/collections.ts）；
 * - 写接口用同一套 schema 校验请求体；
 * - scripts/seed*.mjs 生成演示数据时也以本文件字段为准。
 *
 * 约定：所有时间都是 ISO 8601 字符串；金额单位统一为「元」；
 * 状态一律使用中文枚举值，保证「状态不只靠颜色表达」。
 */
import { z } from "zod";

const iso = z.string().min(4);
const text = z.string();
const money = z.number().nonnegative();
const jsonObject = z.record(z.string(), z.unknown());

/* -------------------------------- 商品与营销 -------------------------------- */

export const productCategories = ["坚果炒货", "肉干卤味", "饼干糕点", "果干蜜饯", "糖巧布丁", "冲饮谷物"] as const;
export const productStatuses = ["在售", "缺货", "预售", "已下架"] as const;
export const spicyLevels = ["不辣", "微辣", "中辣", "重辣"] as const;

export const productSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: text,
  category: z.enum(productCategories),
  /** 主口味，用于推荐与替代时的同类匹配 */
  flavor: text,
  flavorTags: z.array(z.string()),
  /** 计价单位是「件」，netWeightG 用于给用户解释分量 */
  price: money,
  stock: z.number().int().nonnegative(),
  netWeightG: z.number().int().positive(),
  shelfLifeDays: z.number().int().positive(),
  ingredients: z.array(z.string()),
  allergens: z.array(z.string()),
  tags: z.array(z.string()),
  /** 每 100g 营养信息，糖分/热量用于健康提示与特殊人群提醒 */
  sugarPer100g: z.number().nonnegative(),
  caloriesPer100g: z.number().nonnegative(),
  proteinPer100g: z.number().nonnegative(),
  fatPer100g: z.number().nonnegative(),
  spicyLevel: z.enum(spicyLevels),
  /** 例如「3 岁以下需成人陪同」「孕妇建议咨询医生」 */
  suitableFor: z.array(z.string()),
  monthlySales: z.number().int().nonnegative(),
  status: z.enum(productStatuses),
  updatedAt: iso,
});

export const activityTypes = ["满减", "折扣", "赠品", "秒杀", "组合装"] as const;
export const activityStatuses = ["筹备中", "进行中", "已结束"] as const;

export const activityRuleSchema = z.object({
  type: z.enum(["满减", "折扣", "赠品", "秒杀价"]),
  /** 满减=减免金额；折扣=折扣率(如 0.85)；秒杀价=到手价；赠品=0 */
  value: z.number().nonnegative(),
  description: text,
});

export const activitySchema = z.object({
  id: z.string(),
  name: text,
  type: z.enum(activityTypes),
  channel: z.enum(["小程序", "APP", "直播间", "私域社群"]),
  status: z.enum(activityStatuses),
  startAt: iso,
  endAt: iso,
  /** 参与门槛（元），0 表示无门槛 */
  threshold: money,
  rule: activityRuleSchema,
  applicableCategories: z.array(z.string()),
  stackableWithCoupon: z.boolean(),
  budget: money,
  participants: z.number().int().nonnegative(),
  gmv: money,
  note: text,
});

export const couponKinds = ["满减券", "折扣券", "免运费券", "新客券"] as const;
export const couponStatuses = ["可领取", "已领完", "已过期"] as const;

export const couponSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: text,
  kind: z.enum(couponKinds),
  threshold: money,
  discount: money,
  stackable: z.boolean(),
  applicableProductIds: z.array(z.string()),
  applicableCategories: z.array(z.string()),
  excludeProductIds: z.array(z.string()),
  perUserLimit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  claimed: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  validFrom: iso,
  validTo: iso,
  status: z.enum(couponStatuses),
});

/* -------------------------------- 交易与用户 -------------------------------- */

export const orderStatuses = ["待付款", "待发货", "已发货", "已签收", "退款中", "已退款", "已取消"] as const;
export const logisticsStatuses = ["未发货", "已揽收", "运输中", "派送中", "已签收", "异常"] as const;
export const afterSalesStatuses = ["无", "退款中", "已退款", "退货中", "换货中", "已关闭"] as const;

export const orderItemSchema = z.object({
  productId: z.string(),
  name: text,
  qty: z.number().int().positive(),
  unitPrice: money,
});

export const orderSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  userId: z.string(),
  items: z.array(orderItemSchema).min(1),
  amount: money,
  discount: money,
  payable: money,
  status: z.enum(orderStatuses),
  channel: z.enum(["小程序", "APP", "直播间", "私域社群"]),
  address: text,
  trackingNo: z.string().nullable(),
  remark: z.string().nullable(),
  createdAt: iso,
  /** 物流履约状态（订单状态之外单独一列，方便客服判断该说哪句话） */
  logisticsStatus: z.enum(logisticsStatuses),
  afterSalesStatus: z.enum(afterSalesStatuses),
  afterSalesReason: z.string().nullable(),
});

export const userLevels = ["普通", "银卡", "金卡", "黑卡"] as const;
export const riskLevels = ["正常", "关注", "高风险"] as const;

export const userSchema = z.object({
  id: z.string(),
  nickname: text,
  phoneMasked: text,
  level: z.enum(userLevels),
  isNewCustomer: z.boolean(),
  totalOrders: z.number().int().nonnegative(),
  totalSpend: money,
  lastOrderAt: iso,
  joinedAt: iso,
  tags: z.array(z.string()),
  risk: z.enum(riskLevels),
  preferences: z.object({
    favoriteCategories: z.array(z.string()),
    favoriteFlavors: z.array(z.string()),
    avoidAllergens: z.array(z.string()),
    budgetPerOrder: money,
  }),
  /** 最近 3 笔订单号，客服可直接引用 */
  recentOrderNos: z.array(z.string()),
});

/* -------------------------------- 知识与规则 -------------------------------- */

export const returnPolicyCategories = ["破损", "缺件", "退换货", "退款", "临期", "延迟发货"] as const;

export const returnPolicySchema = z.object({
  id: z.string(),
  scene: text,
  category: z.enum(returnPolicyCategories),
  title: text,
  refundWindowDays: z.number().int().nonnegative(),
  whoPaysFreight: z.enum(["商家承担", "买家承担", "视责任方"]),
  compensationRule: text,
  conditions: z.array(z.string()),
  steps: z.array(z.string()),
  exceptions: z.array(z.string()),
  resolveWithinHours: z.number().int().positive(),
  version: z.string(),
  effectiveFrom: iso,
});

export const logisticsSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  carrier: z.enum(["顺丰速运", "中通快递", "圆通速递", "京东物流", "邮政EMS"]),
  trackingNo: z.string(),
  status: z.enum(["已揽收", "运输中", "派送中", "已签收", "异常"]),
  city: text,
  lastEvent: text,
  lastEventAt: iso,
  estimatedArrival: iso,
  delayHours: z.number().nonnegative(),
});

export const faqSchema = z.object({
  id: z.string(),
  category: z.enum(["发货", "售后", "优惠", "商品", "会员"]),
  question: text,
  answer: text,
  hitCount: z.number().int().nonnegative(),
  status: z.enum(["启用", "草稿"]),
  updatedAt: iso,
});

/** 客服转人工规则：Planner 在决定是否 handoff 时读取 */
export const handoffRuleSchema = z.object({
  id: z.string(),
  name: text,
  /** 触发场景的自然语言描述，用于召回 */
  trigger: text,
  /** 可执行的判定条件描述 */
  condition: text,
  priority: z.enum(["低", "中", "高", "紧急"]),
  action: z.enum(["转人工", "升级主管", "仅记录", "禁止承诺"]),
  slaMinutes: z.number().int().positive(),
  channels: z.array(z.enum(["小程序", "APP", "直播间", "电话", "社群"])),
  enabled: z.boolean(),
  note: text,
});

/* -------------------------------- 工单与运行 -------------------------------- */

export const ticketIntents = ["催发货", "退款退货", "优惠咨询", "商品咨询", "物流异常", "改地址", "投诉"] as const;
export const ticketStatuses = ["待处理", "处理中", "已解决", "已升级", "已接管"] as const;

export const ticketSchema = z.object({
  id: z.string(),
  code: z.string(),
  userId: z.string(),
  orderNo: z.string().nullable(),
  channel: z.enum(["小程序", "APP", "直播间", "电话", "社群"]),
  intent: z.enum(ticketIntents),
  priority: z.enum(["低", "中", "高", "紧急"]),
  status: z.enum(ticketStatuses),
  assignee: z.string().nullable(),
  summary: text,
  createdAt: iso,
  slaDueAt: iso,
  firstResponseMinutes: z.number().nonnegative().nullable(),
});

export const runStatuses = ["成功", "已接管", "失败", "超时"] as const;
export const runStepStatuses = ["成功", "失败", "跳过"] as const;

export const runStepSchema = z.object({
  name: text,
  tool: z.string().nullable(),
  status: z.enum(runStepStatuses),
  ms: z.number().int().nonnegative(),
});

export const runSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  ticketId: z.string().nullable(),
  channel: z.enum(["小程序", "APP", "直播间", "电话", "社群"]),
  /** 指向 skills.json 的 id（v2 起为流水线阶段 skill） */
  skillKey: z.string(),
  status: z.enum(runStatuses),
  latencyMs: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costYuan: money,
  plannerSteps: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  startedAt: iso,
  steps: z.array(runStepSchema),
  fallbackReason: z.string().nullable(),
  satisfaction: z.number().min(1).max(5).nullable(),
});

export const ratingSchema = z.object({
  id: z.string(),
  runId: z.string(),
  /** run = 第一段历史运行；agent_run = 主链路 RunRecord */
  targetType: z.enum(["run", "agent_run"]).default("run"),
  score: z.number().int().min(1).max(5),
  dimension: z.enum(["准确性", "语气", "效率", "合规"]),
  comment: text,
  reviewer: text,
  createdAt: iso,
  /** 评分时保存的问答对快照（低分复盘用） */
  question: z.string().nullable().optional(),
  reply: z.string().nullable().optional(),
  /** 问题类型（来自 RunRecord 的意图/能力），用于筛选 */
  intent: z.string().nullable().optional(),
  /** 低分自动路由结果 */
  routedTo: z
    .object({
      annotationId: z.string(),
      improvementId: z.string().nullable(),
    })
    .nullable()
    .optional(),
});

export const annotationStatuses = ["pending", "accepted", "rejected"] as const;
export const annotationDimensions = ["correctness", "relevance", "completeness", "safety", "tone", "overall"] as const;

export const annotationDimensionScores = z
  .object({
    correctness: z.number().min(1).max(5).nullable().optional(),
    relevance: z.number().min(1).max(5).nullable().optional(),
    completeness: z.number().min(1).max(5).nullable().optional(),
    safety: z.number().min(1).max(5).nullable().optional(),
    tone: z.number().min(1).max(5).nullable().optional(),
    overall: z.number().min(1).max(5).nullable().optional(),
  })
  .nullable()
  .optional();

export const annotationSchema = z.object({
  id: z.string(),
  targetType: z.enum(["run", "agent_run", "skill_version", "eval_case", "ticket"]),
  targetId: z.string(),
  tag: z.enum(["好案例", "坏案例", "待优化", "合规风险", "知识缺口"]),
  note: text,
  author: text,
  createdAt: iso,
  /** 运营审核状态 */
  status: z.enum(annotationStatuses).default("pending"),
  /** 多维评分（1–5），未填的维度为 null */
  dimensions: annotationDimensionScores,
  source: z.enum(["ops", "run_detail", "rating", "import"]).default("ops"),
  /** 已沉淀成的评测用例 / 改进项 */
  evalCaseId: z.string().nullable().optional(),
  improvementId: z.string().nullable().optional(),
  reviewer: z.string().nullable().optional(),
  reviewedAt: iso.nullable().optional(),
});

export const improvementDirections = ["Planner", "Skill", "Tool", "Eval"] as const;

export const improvementSchema = z.object({
  id: z.string(),
  title: text,
  source: z.enum(["badcase", "rating", "annotation", "eval"]),
  /** 指向 skills.json 的 id */
  skillKey: z.string(),
  priority: z.enum(["P0", "P1", "P2"]),
  status: z.enum(["待评估", "已排期", "进行中", "已上线", "已驳回"]),
  owner: text,
  expectedGain: text,
  createdAt: iso,
  dueAt: iso,
  linkedRuns: z.array(z.string()),
  /** 改进方向：Planner 提示词 / Skill 提示词 / Tool 契约 / 评测用例 */
  direction: z.enum(improvementDirections).default("Skill"),
  /** 规则聚类（不是 LLM 分析，明确标注） */
  cluster: z
    .object({
      rule: z.string(),
      label: text,
      sampleRunIds: z.array(z.string()),
      sampleCount: z.number().int().nonnegative(),
      detail: text,
    })
    .nullable()
    .optional(),
  samples: z
    .array(
      z.object({
        runId: z.string(),
        question: text,
        reply: z.string().nullable(),
        score: z.number().nullable(),
      }),
    )
    .optional(),
  /** Prompt 改进草案：生成后不会自动写入 Skill，必须显式应用 */
  draft: z
    .object({
      skillId: z.string(),
      skillName: text,
      baseVersion: z.string(),
      baseHash: z.string(),
      content: text,
      changeNote: text,
      createdAt: iso,
      status: z.enum(["draft", "applied", "discarded"]),
    })
    .nullable()
    .optional(),
  appliedVersion: z.string().nullable().optional(),
  appliedAt: iso.nullable().optional(),
});

/* -------------------------------- Skill 注册中心 -------------------------------- */

export const skillStages = ["输入理解", "决策", "生成", "守卫", "收口"] as const;

/** id 同时作为文件名与 URL 段：只允许字母/数字/下划线/连字符（含中文），天然拒绝路径穿越 */
export const entityIdPattern = /^[\p{L}\p{N}_-]+$/u;
export const skillIdPattern = entityIdPattern;

export const skillSchema = z.object({
  id: z.string().min(2).max(48).regex(skillIdPattern, "id 只允许字母、数字、下划线、连字符与中文"),
  name: text,
  description: text,
  stage: z.enum(skillStages),
  enabled: z.boolean(),
  model: text,
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(128).max(32768),
  /** 依赖的 tool id 列表，Planner 据此限制可调用工具 */
  requiredTools: z.array(z.string()),
  /** 能力标签：Plan 校验据此判断「必需能力」是否被覆盖（price/order/logistics/risk/safety…） */
  capabilities: z.array(z.string()),
  /** 语义化版本，每次保存正文递增 patch */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "版本号形如 1.2.3"),
  /** 提示词正文的导出文件路径，必须位于 skills/ 目录内 */
  filePath: z.string(),
  /** 最后一次保存时正文的 sha256（前 16 位），用于检测文件与注册表是否一致 */
  hash: z.string().min(8),
  /** 系统提示词正文：运行时以 skills.json 为准，skills/<id>.md 为可读镜像 */
  systemPrompt: z.string().min(20),
  order: z.number().int().nonnegative(),
  owner: text,
  updatedAt: iso,
});

/** Skill 版本快照：保存正文与元数据，支持 list / show / diff */
export const skillVersionSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  version: z.string(),
  content: z.string().min(1),
  hash: z.string().min(8),
  /** 人工填写或系统自动生成（编辑前自动快照） */
  changeNote: text,
  auto: z.boolean(),
  author: text,
  createdAt: iso,
  evalScore: z.number().min(0).max(100).nullable(),
  regression: z.boolean(),
});

/* -------------------------------- Tool 注册中心 -------------------------------- */

export const toolKinds = ["查询", "计算"] as const;

export const toolSchema = z.object({
  id: z.string().min(2).max(48).regex(skillIdPattern, "id 只允许字母、数字、下划线、连字符与中文"),
  name: text,
  description: text,
  kind: z.enum(toolKinds),
  riskLevel: z.enum(["低", "中", "高"]),
  enabled: z.boolean(),
  version: z.string(),
  timeoutMs: z.number().int().positive(),
  /** 供 Planner 读取的 JSON Schema */
  inputSchema: jsonObject,
  outputSchema: jsonObject,
  /** 单项测试的默认入参 */
  sampleInput: jsonObject,
  notes: text,
  updatedAt: iso,
});

export const toolConfigSchema = z.object({
  id: z.string(),
  toolId: z.string(),
  timeoutMs: z.number().int().positive(),
  maxRetries: z.number().int().nonnegative(),
  rateLimitPerMin: z.number().int().positive(),
  requireConfirm: z.boolean(),
  env: z.enum(["production", "sandbox"]),
  updatedAt: iso,
  note: text,
});

/* -------------------------------- 评测与实验 -------------------------------- */
/* 评测用例/批次只保留 V2 契约（见下方 evalCaseSchemaV2 / evalBatchSchemaV2），
   第一段的 evalCaseSchema / evalBatchSchema 已随双存储合并一起删除。 */

export const abTestSchema = z.object({
  id: z.string(),
  name: text,
  skillKey: z.string(),
  variantA: z.string(),
  variantB: z.string(),
  trafficSplitA: z.number().min(0).max(100),
  metric: z.enum(["解决率", "满意度", "平均耗时"]),
  aValue: z.number(),
  bValue: z.number(),
  samples: z.number().int().nonnegative(),
  status: z.enum(["草稿", "运行中", "已结束"]),
  winner: z.enum(["A", "B", "持平"]).nullable(),
  startedAt: iso,
  endedAt: iso.nullable(),
});

/* -------------------------------- 运行时配置 -------------------------------- */

export const llmProviderIds = ["coze", "openai-compatible", "classroom-fixture"] as const;

export const llmConfigSchema = z.object({
  /** 管理后台选择的 Provider；null 表示跟随环境变量 LLM_PROVIDER / 密钥自动推断 */
  provider: z.enum(llmProviderIds).nullable(),
  defaultModel: text,
  plannerModel: text,
  fallbackModel: text,
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  plannerMaxSteps: z.number().int().positive(),
  enabledTools: z.array(z.string()),
  updatedAt: iso,
  updatedBy: text,
  notes: text,
});

/** Planner 配置：版本、模型参数、系统提示词、可选能力白名单 */
export const plannerConfigSchema = z.object({
  id: z.literal("planner"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "版本号形如 1.2.0"),
  model: text,
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(128).max(32768),
  systemPrompt: z.string().min(40, "Planner 系统提示词至少 40 个字符"),
  promptHash: z.string().min(8),
  /** 允许 Planner 选择的 Skill / Tool；空数组表示「全部启用中的」 */
  allowedSkills: z.array(z.string()),
  allowedTools: z.array(z.string()),
  defaultMandatoryCapabilities: z.array(z.string()),
  updatedAt: iso,
  updatedBy: text,
  history: z.array(
    z.object({
      version: z.string(),
      createdAt: iso,
      changeNote: text,
      promptHash: z.string(),
    }),
  ),
});

export const runtimeFallbackSchema = z.object({
  defaultPolicy: z.enum(["转人工", "兜底话术", "重试", "降级模型"]),
  maxRetries: z.number().int().nonnegative(),
  retryBackoffMs: z.number().int().nonnegative(),
  humanHandoffSlaMinutes: z.number().int().positive(),
  degradedMode: z.boolean(),
  notices: z.array(z.string()),
  updatedAt: iso,
});

/* -------------------------------- Agent 主链路 -------------------------------- */

export const agentRunStatuses = ["running", "success", "blocked", "failed", "handoff"] as const;
export const agentRunSources = ["workspace", "demo", "api", "retry", "eval"] as const;
export const stepTypes = ["planner", "validation", "skill", "tool", "risk", "finalize"] as const;
export const stepStatuses = ["success", "error", "timeout", "skipped"] as const;
export const riskLevelsForPlan = ["low", "medium", "high"] as const;

/** Planner 输出的结构化 Plan */
export const planSchema = z.object({
  selectedSkills: z.array(z.string()),
  selectedTools: z.array(z.string()),
  reasoning: text,
  mandatoryCapabilities: z.array(z.string()),
  riskAssessment: z.object({
    level: z.enum(riskLevelsForPlan),
    flags: z.array(z.string()),
    needsRiskCheck: z.boolean(),
  }),
  /** 能力无法满足时，Planner 必须显式声明降级/转人工 */
  degradation: z
    .object({
      degraded: z.boolean(),
      handoff: z.boolean(),
      reason: z.string().nullable(),
    })
    .nullable(),
  /** 可选：为特定工具绑定入参；缺省时执行器使用注册表 sampleInput */
  toolInputs: z.record(z.string(), z.unknown()).optional(),
});

export const planValidationSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  checkedAt: iso,
});

export const riskFindingSchema = z.object({
  ruleId: z.string(),
  level: z.enum(["block", "warn"]),
  evidence: text,
  suggestion: text,
});

export const riskResultSchema = z.object({
  /** allow=可以发送，block=阻断并改写，skipped=没有可用的风险审查 */
  verdict: z.enum(["allow", "block", "skipped"]),
  findings: z.array(riskFindingSchema),
  rewritten: z.string().nullable(),
  checkedAt: iso,
  checkedBy: text,
  note: z.string().nullable(),
});

export const agentRunStepSchema = z.object({
  stepId: z.string(),
  type: z.enum(stepTypes),
  name: text,
  status: z.enum(stepStatuses),
  input: z.unknown(),
  output: z.unknown(),
  durationMs: z.number().nonnegative(),
  error: z.string().nullable(),
  startedAt: iso,
});

export const agentRunSchema = z.object({
  id: z.string(),
  question: text,
  source: z.enum(agentRunSources),
  conversationId: text,
  createdAt: iso,
  status: z.enum(agentRunStatuses),
  finalReply: z.string().nullable(),
  plan: planSchema.nullable(),
  planValidation: planValidationSchema.nullable(),
  steps: z.array(agentRunStepSchema),
  riskResult: riskResultSchema.nullable(),
  durationMs: z.number().nonnegative(),
  error: z.string().nullable(),
  provider: text,
  model: text,
  /** 本次运行用到的 Skill / Tool 版本，便于复盘时定位 */
  skillVersions: z.record(z.string(), z.string()),
  toolVersions: z.record(z.string(), z.string()),
  /** 运行时提示：课堂演示模式等 */
  notice: z.string().nullable(),
  handoff: z
    .object({
      at: iso,
      assignee: text,
      reason: z.string().nullable(),
    })
    .nullable(),
  retryOf: z.string().nullable(),
  conversationHistory: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: text,
    }),
  ),
});
/* -------------------------------- Agent 评测集 -------------------------------- */

export const evalDifficulties = ["简单", "中等", "困难"] as const;
export const evalRiskLevels = ["low", "medium", "high"] as const;
export const evalDimensions = ["准确性", "安全性", "完整性", "语气", "效率"] as const;

export const evalCaseSchemaV2 = z.object({
  id: z.string(),
  name: text,
  question: z.string().min(4, "问题至少 4 个字").max(600),
  category: text,
  difficulty: z.enum(evalDifficulties),
  riskLevel: z.enum(evalRiskLevels),
  expectedBehavior: text,
  expectedReply: z.string().default(""),
  expectedKeywords: z.array(z.string()),
  keywordMode: z.enum(["AND", "OR"]).default("AND"),
  forbiddenWords: z.array(z.string()),
  expectedPrice: z.number().nonnegative().nullable(),
  priceTolerance: z.number().nonnegative().default(0.01),
  expectRiskPassed: z.boolean().default(true),
  requiredCapabilities: z.array(z.string()),
  forbiddenCapabilities: z.array(z.string()),
  evalDimension: z.enum(evalDimensions),
  llmJudgePrompt: z.string().nullable(),
  tags: z.array(z.string()),
  sourceRunId: z.string().nullable(),
  createdAt: iso,
  enabled: z.boolean().default(true),
});
/* -------------------------------- 批量评测 -------------------------------- */

export const batchStatuses = ["queued", "running", "done", "error", "cancelled"] as const;
export const caseStatuses = ["PASS", "FAIL", "REVIEW", "ERROR"] as const;

export const evalCaseResultSchema = z.object({
  caseId: z.string(),
  caseName: text,
  question: text,
  status: z.enum(caseStatuses),
  reason: text,
  evidence: z.array(z.string()),
  keywordHits: z.array(z.string()),
  keywordMisses: z.array(z.string()),
  forbiddenHits: z.array(z.string()),
  expectedPrice: z.number().nullable(),
  mentionedPrice: z.number().nullable(),
  riskIssues: z.array(z.string()),
  inputRisk: z.object({ risky: z.boolean(), signals: z.array(z.string()) }),
  replySafety: z.object({ safe: z.boolean(), issues: z.array(z.string()) }),
  shouldSend: z.boolean(),
  capabilityPath: z.object({ required: z.array(z.string()), missing: z.array(z.string()), forbidden: z.array(z.string()) }),
  durationMs: z.number(),
  runId: z.string().nullable(),
  finalReply: z.string().nullable(),
  riskVerdict: z.string().nullable(),
});

export const evalBatchSchemaV2 = z.object({
  id: z.string(),
  name: text,
  versionLabel: text,
  changeNote: text,
  caseIds: z.array(z.string()),
  caseSetHash: z.string(),
  skillVersions: z.record(z.string(), z.string()),
  evaluatorVersion: text,
  evaluatorHash: z.string(),
  provider: text,
  model: text,
  params: z.object({ temperature: z.number(), maxTokens: z.number(), plannerModel: text }),
  createdAt: iso,
  startedAt: iso.nullable(),
  finishedAt: iso.nullable(),
  status: z.enum(batchStatuses),
  currentIndex: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  caseResults: z.array(evalCaseResultSchema),
});

export type EvalBatchV2 = z.infer<typeof evalBatchSchemaV2>;
export type EvalCaseResult = z.infer<typeof evalCaseResultSchema>;
