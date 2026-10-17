/**
 * 业务数据访问层：把「集合名」收敛成有语义的函数，
 * 页面只调用 getXxx()，不关心文件名与路径。
 */
import { loadCollection } from "./collections";

export const getProducts = () => loadCollection("products");
export const getActivities = () => loadCollection("activities");
export const getCoupons = () => loadCollection("coupons");
export const getOrders = () => loadCollection("orders");
export const getUsers = () => loadCollection("users");
export const getReturnPolicies = () => loadCollection("return-policies");
export const getLogistics = () => loadCollection("logistics");
export const getFaq = () => loadCollection("faq");
export const getHandoffRules = () => loadCollection("handoff-rules");
export const getTickets = () => loadCollection("tickets");
export const getRuns = () => loadCollection("runs");
export const getAgentRuns = () => loadCollection("agent-runs");
export const getRatings = () => loadCollection("ratings");
export const getAnnotations = () => loadCollection("annotations");
export const getSkills = () => loadCollection("skills");
export const getSkillVersions = () => loadCollection("skill-versions");
export const getTools = () => loadCollection("tools");
export const getToolConfigs = () => loadCollection("tools-config");
export const getImprovements = () => loadCollection("improvements");
/** 评测只有一份存储：eval-cases.json（用例）/ eval-batch.json（批次），与 /eval 页面同源 */
export const getEvalCases = () => loadCollection("eval-cases");
export const getEvalBatches = () => loadCollection("eval-batch");
export const getAbTests = () => loadCollection("ab-tests");
export const getLlmConfig = () => loadCollection("llm-config");
export const getRuntimeFallback = () => loadCollection("runtime-fallback");
