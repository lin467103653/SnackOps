/**
 * 写接口的请求体契约。与 src/lib/schemas.ts 的存储契约分开：
 * 请求体是「用户的一次操作」，比完整实体更窄。
 */
import { z } from "zod";

import { evalDifficulties, evalDimensions, evalRiskLevels, llmConfigSchema, runtimeFallbackSchema, skillIdPattern, skillStages } from "./schemas";

export const annotationInputSchema = z.object({
  targetType: z.enum(["run", "agent_run", "skill_version", "eval_case", "ticket"]),
  targetId: z.string().min(1, "请提供目标对象"),
  tag: z.enum(["好案例", "坏案例", "待优化", "合规风险", "知识缺口"]),
  note: z.string().trim().min(4, "请至少描述 4 个字").max(280, "最多 280 字"),
});

export const takeoverInputSchema = z.object({
  assignee: z.string().trim().min(1).max(24).optional(),
});

export const improvementInputSchema = z.object({
  title: z.string().trim().min(4, "标题至少 4 个字").max(80, "标题最多 80 字"),
  skillKey: z.string().min(1, "请选择关联 Skill"),
  priority: z.enum(["P0", "P1", "P2"]),
  source: z.enum(["badcase", "rating", "annotation", "eval"]),
  owner: z.string().trim().min(1, "请填写负责人").max(24),
  expectedGain: z.string().trim().min(2, "请写一句预期收益").max(80),
  dueAt: z.string().optional(),
});

export const configInputSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("llm-config"), value: llmConfigSchema.partial() }),
  z.object({ key: z.literal("runtime-fallback"), value: runtimeFallbackSchema.partial() }),
]);

/* -------------------------------- Skill 管理 -------------------------------- */

/** 启停 + 元数据修改合并到一个 PATCH：至少给一个字段 */
export const skillPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().trim().min(2, "名称至少 2 个字").max(40).optional(),
    description: z.string().trim().min(4, "描述至少 4 个字").max(200).optional(),
    stage: z.enum(skillStages).optional(),
    model: z.string().trim().min(2).max(60).optional(),
    temperature: z.number().min(0, "温度不能小于 0").max(2, "温度不能大于 2").optional(),
    maxTokens: z.number().int().min(128).max(32768).optional(),
    requiredTools: z
      .array(z.string().regex(skillIdPattern, "工具 id 不合法"))
      .max(8, "最多绑定 8 个工具")
      .optional(),
    owner: z.string().trim().min(1).max(24).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个要修改的字段" });

export const skillContentSchema = z.object({
  content: z.string().min(20, "提示词正文至少 20 个字符").max(60_000, "提示词正文过长"),
  changeNote: z.string().trim().max(120, "变更说明最多 120 字").optional(),
  /** 可选另存路径：必须是 skills/<id>.md，越界会被拒绝 */
  filePath: z.string().trim().max(120).optional(),
});

export const skillDiffQuerySchema = z.object({
  from: z.string().min(1).max(32),
  to: z.string().min(1).max(32).default("current"),
});

/* -------------------------------- Tool 管理 -------------------------------- */

export const toolPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个要修改的字段" });

export const toolRunSchema = z.object({
  /** 省略则使用注册表里的 sampleInput */
  input: z.record(z.string(), z.unknown()).optional(),
});

/* -------------------------------- Agent 主链路 -------------------------------- */

const faultSchema = z
  .object({
    tools: z.array(z.string().min(1)).max(6).optional(),
    skills: z.array(z.string().min(1)).max(6).optional(),
    mode: z.enum(["error", "timeout"]).optional(),
  })
  .optional();

export const agentRunInputSchema = z.object({
  question: z.string().trim().min(2, "问题至少 2 个字").max(600, "问题最多 600 字"),
  source: z.enum(["workspace", "demo", "api", "eval"]).optional(),
  conversationId: z.string().trim().max(64).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .max(12)
    .optional(),
  userId: z.string().trim().max(32).optional(),
  /** 故障注入：仅在 SNACKOPS_ALLOW_FAULTS=1 时生效 */
  faults: faultSchema,
});

export const retryRunInputSchema = z.object({
  runId: z.string().trim().min(1, "缺少 runId"),
  faults: faultSchema,
});

export const handoffInputSchema = z.object({
  assignee: z.string().trim().min(1).max(24).optional(),
  reason: z.string().trim().max(200).optional(),
});

export const explainInputSchema = z
  .object({
    runId: z.string().trim().min(1).optional(),
    question: z.string().trim().min(2).max(600).optional(),
  })
  .refine((value) => Boolean(value.runId || value.question), { message: "请提供 runId 或 question" });

export const runAnnotationInputSchema = z.object({
  tag: z.enum(["好案例", "坏案例", "待优化", "合规风险", "知识缺口"]),
  note: z.string().trim().min(4, "请至少描述 4 个字").max(280, "最多 280 字"),
});

/* -------------------------------- 管理后台 -------------------------------- */

export const plannerUpdateSchema = z
  .object({
    model: z.string().trim().min(2).max(60).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(128).max(32768).optional(),
    systemPrompt: z.string().min(40, "Planner 提示词至少 40 个字符").max(20_000).optional(),
    allowedSkills: z.array(z.string().min(1)).max(30).optional(),
    allowedTools: z.array(z.string().min(1)).max(30).optional(),
    defaultMandatoryCapabilities: z.array(z.string().min(1)).max(20).optional(),
    changeNote: z.string().trim().max(120).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个要修改的字段" });

export const plannerPreviewSchema = z.object({
  question: z.string().trim().min(2, "问题至少 2 个字").max(600),
  /** 为空则使用「问题推导 ∪ 配置默认值」 */
  mandatoryCapabilities: z.array(z.string().min(1)).max(20).optional(),
  /** 为空则使用配置里的白名单（再为空表示全部启用能力） */
  allowedSkills: z.array(z.string().min(1)).max(30).optional(),
  allowedTools: z.array(z.string().min(1)).max(30).optional(),
});

export const llmConfigUpdateSchema = z
  .object({
    defaultModel: z.string().trim().min(2).max(60).optional(),
    plannerModel: z.string().trim().min(2).max(60).optional(),
    fallbackModel: z.string().trim().min(2).max(60).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(128).max(32768).optional(),
    timeoutMs: z.number().int().min(1000).max(120_000).optional(),
    plannerMaxSteps: z.number().int().min(1).max(20).optional(),
    notes: z.string().trim().max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个要修改的字段" });

export const llmSwitchSchema = z.object({
  provider: z.enum(["coze", "openai-compatible", "classroom-fixture"]),
});

export type PlannerUpdateInput = z.infer<typeof plannerUpdateSchema>;
export type PlannerPreviewInput = z.infer<typeof plannerPreviewSchema>;
export type LlmConfigUpdateInput = z.infer<typeof llmConfigUpdateSchema>;

/* -------------------------------- 运营中心 -------------------------------- */

export const ratingInputSchema = z.object({
  runId: z.string().trim().min(1, "缺少 runId"),
  score: z.number().int().min(1, "评分最小 1").max(5, "评分最大 5"),
  dimension: z.enum(["准确性", "语气", "效率", "合规"]).optional(),
  comment: z.string().trim().max(280).optional(),
  reviewer: z.string().trim().max(24).optional(),
});

export const annotationCreateSchema = annotationInputSchema.extend({
  dimensions: z
    .object({
      correctness: z.number().min(1).max(5).nullable().optional(),
      relevance: z.number().min(1).max(5).nullable().optional(),
      completeness: z.number().min(1).max(5).nullable().optional(),
      safety: z.number().min(1).max(5).nullable().optional(),
      tone: z.number().min(1).max(5).nullable().optional(),
      overall: z.number().min(1).max(5).nullable().optional(),
    })
    .optional(),
  status: z.enum(["pending", "accepted", "rejected"]).optional(),
  source: z.enum(["ops", "run_detail", "rating", "import"]).optional(),
});

export const annotationPatchSchema = z
  .object({
    status: z.enum(["pending", "accepted", "rejected"]).optional(),
    dimensions: z
      .object({
        correctness: z.number().min(1).max(5).nullable().optional(),
        relevance: z.number().min(1).max(5).nullable().optional(),
        completeness: z.number().min(1).max(5).nullable().optional(),
        safety: z.number().min(1).max(5).nullable().optional(),
        tone: z.number().min(1).max(5).nullable().optional(),
        overall: z.number().min(1).max(5).nullable().optional(),
      })
      .optional(),
    note: z.string().trim().min(2).max(280).optional(),
    action: z.enum(["to_eval_case", "to_improvement"]).optional(),
    skillId: z.string().trim().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个字段或 action" });

export const improvementFromRuleSchema = z.object({
  rule: z.string().trim().min(1, "缺少规则标识"),
});

export const improvementFromManualSchema = improvementInputSchema;

export const promptImprovementSchema = z.object({
  improvementId: z.string().trim().min(1, "缺少 improvementId"),
  confirm: z.boolean().optional(),
});

export const rollbackSchema = z.object({
  version: z.string().trim().min(1, "缺少目标版本"),
});

export const abTestCreateSchema = z.object({
  name: z.string().trim().min(4, "名称至少 4 个字").max(60),
  skillKey: z.string().trim().min(1, "缺少 skillKey"),
  variantA: z.string().trim().min(1, "缺少 A 组版本"),
  variantB: z.string().trim().min(1, "缺少 B 组版本"),
  trafficSplitA: z.number().int().min(1).max(99).optional(),
  metric: z.enum(["解决率", "满意度", "平均耗时"]).optional(),
});

export const abTestPatchSchema = z.object({
  status: z.enum(["草稿", "运行中", "已结束"]).optional(),
  winner: z.enum(["A", "B", "持平"]).nullable().optional(),
  aValue: z.number().optional(),
  bValue: z.number().optional(),
  samples: z.number().int().nonnegative().optional(),
});

export type AnnotationInput = z.infer<typeof annotationInputSchema>;
export type ImprovementInput = z.infer<typeof improvementInputSchema>;
export type ConfigInput = z.infer<typeof configInputSchema>;
export type TakeoverInput = z.infer<typeof takeoverInputSchema>;
export type SkillPatchInput = z.infer<typeof skillPatchSchema>;
export type SkillContentInput = z.infer<typeof skillContentSchema>;
export type ToolPatchInput = z.infer<typeof toolPatchSchema>;
export type ToolRunInput = z.infer<typeof toolRunSchema>;
export type AgentRunInput = z.infer<typeof agentRunInputSchema>;
export type RetryRunInput = z.infer<typeof retryRunInputSchema>;
export type HandoffInput = z.infer<typeof handoffInputSchema>;
export type ExplainInput = z.infer<typeof explainInputSchema>;
export type RunAnnotationInput = z.infer<typeof runAnnotationInputSchema>;
/* -------------------------------- 评测集 -------------------------------- */

export const evalCaseCreateSchema = z.object({
  name: z.string().trim().min(2, "名称至少 2 个字").max(60),
  question: z.string().trim().min(4, "问题至少 4 个字").max(600),
  category: z.string().trim().min(1, "缺少分类").max(30),
  difficulty: z.enum(evalDifficulties),
  riskLevel: z.enum(evalRiskLevels),
  expectedBehavior: z.string().trim().min(4, "期望行为至少 4 个字").max(400),
  expectedReply: z.string().max(2000).optional(),
  expectedKeywords: z.array(z.string().trim().min(1)).max(12).optional(),
  keywordMode: z.enum(["AND", "OR"]).optional(),
  forbiddenWords: z.array(z.string().trim().min(1)).max(12).optional(),
  expectedPrice: z.number().nonnegative().nullable().optional(),
  priceTolerance: z.number().nonnegative().max(10).optional(),
  expectRiskPassed: z.boolean().optional(),
  requiredCapabilities: z.array(z.string().trim().min(1)).max(10).optional(),
  forbiddenCapabilities: z.array(z.string().trim().min(1)).max(10).optional(),
  evalDimension: z.enum(evalDimensions),
  llmJudgePrompt: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(10).optional(),
  sourceRunId: z.string().trim().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const evalCasePatchSchema = evalCaseCreateSchema.partial();

export const evalScoreSchema = z.object({
  caseId: z.string().trim().min(1, "缺少 caseId"),
  runId: z.string().trim().min(1, "缺少 runId"),
});