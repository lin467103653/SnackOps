/**
 * 业务类型：全部由 zod schema 推导，避免「类型与校验两份定义」漂移。
 */
import type { z } from "zod";
import type * as schemas from "./schemas";

export type Product = z.infer<typeof schemas.productSchema>;
export type Activity = z.infer<typeof schemas.activitySchema>;
export type ActivityRule = z.infer<typeof schemas.activityRuleSchema>;
export type Coupon = z.infer<typeof schemas.couponSchema>;
export type OrderItem = z.infer<typeof schemas.orderItemSchema>;
export type Order = z.infer<typeof schemas.orderSchema>;
export type User = z.infer<typeof schemas.userSchema>;
export type ReturnPolicy = z.infer<typeof schemas.returnPolicySchema>;
export type LogisticsRecord = z.infer<typeof schemas.logisticsSchema>;
export type Faq = z.infer<typeof schemas.faqSchema>;
export type HandoffRule = z.infer<typeof schemas.handoffRuleSchema>;
export type Ticket = z.infer<typeof schemas.ticketSchema>;
export type AgentRun = z.infer<typeof schemas.runSchema>;
export type RunStep = z.infer<typeof schemas.runStepSchema>;
export type Rating = z.infer<typeof schemas.ratingSchema>;
export type Annotation = z.infer<typeof schemas.annotationSchema>;
export type Improvement = z.infer<typeof schemas.improvementSchema>;
export type Skill = z.infer<typeof schemas.skillSchema>;
export type SkillVersion = z.infer<typeof schemas.skillVersionSchema>;
export type Tool = z.infer<typeof schemas.toolSchema>;
export type ToolConfig = z.infer<typeof schemas.toolConfigSchema>;
export type EvalCaseV2 = z.infer<typeof schemas.evalCaseSchemaV2>;
export type EvalBatchV2 = z.infer<typeof schemas.evalBatchSchemaV2>;
export type EvalCaseResult = z.infer<typeof schemas.evalCaseResultSchema>;
export type AbTest = z.infer<typeof schemas.abTestSchema>;
export type LlmConfig = z.infer<typeof schemas.llmConfigSchema>;
export type RuntimeFallback = z.infer<typeof schemas.runtimeFallbackSchema>;

export type AgentPlan = z.infer<typeof schemas.planSchema>;
export type PlanValidation = z.infer<typeof schemas.planValidationSchema>;
export type RiskFinding = z.infer<typeof schemas.riskFindingSchema>;
export type RiskResult = z.infer<typeof schemas.riskResultSchema>;
export type AgentRunStep = z.infer<typeof schemas.agentRunStepSchema>;
export type AgentRunRecord = z.infer<typeof schemas.agentRunSchema>;
export type AgentRunStatus = AgentRunRecord["status"];
export type AgentRunSource = AgentRunRecord["source"];
export type StepType = AgentRunStep["type"];
export type StepStatus = AgentRunStep["status"];

export type ProductStatus = Product["status"];
export type OrderStatus = Order["status"];
export type LogisticsStatus = Order["logisticsStatus"];
export type AfterSalesStatus = Order["afterSalesStatus"];
export type TicketStatus = Ticket["status"];
export type TicketIntent = Ticket["intent"];
export type RunStatus = AgentRun["status"];
export type SkillStage = Skill["stage"];
export type ToolKind = Tool["kind"];
export type ImprovementStatus = Improvement["status"];
export type AnnotationTag = Annotation["tag"];
export type Priority = Ticket["priority"];
export type HandoffAction = HandoffRule["action"];
