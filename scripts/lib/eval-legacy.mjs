/**
 * 第一段评测用例（v1 契约）→ V2 契约的迁移映射。
 *
 * 为什么迁移后一律 `enabled: false`：
 * v1 的断言是自然语言（例如「必须引用退货政策 v3.1」），评分器无法机器判定；
 * 如果直接启用，0 条机器可判断言会被判成 PASS——那是伪造分数。
 * 因此迁移只保留内容（问题 / 期望行为 / 旧断言全文 / 标签 / 时间），
 * 等运营补出关键词、禁词或价格后再手动启用。
 *
 * v1 的 id（ec_001…）原样保留，标注里对用例的引用才不会断。
 */

export const LEGACY_EVAL_TAGS = ["旧版断言", "迁移自 v1"];

const DIFFICULTY_MAP = { 易: "简单", 中: "中等", 难: "困难" };
const DIMENSION_BY_INTENT = { 投诉: "安全性", 退款退货: "准确性", 售后: "准确性", 物流异常: "完整性" };

/**
 * @param {Record<string, unknown>} legacy 第一段的 evalCaseSchema 记录
 * @returns {Record<string, unknown>} evalCaseSchemaV2 记录（enabled=false）
 */
export function toV2EvalCase(legacy) {
  const intent = String(legacy.intent ?? "商品咨询");
  const assertions = Array.isArray(legacy.assertions) ? legacy.assertions.map(String) : [];
  const head = String(legacy.expected ?? "");
  const tail = assertions.length > 0 ? `旧版断言：${assertions.join("；")}` : "";

  return {
    id: String(legacy.id),
    name: String(legacy.name ?? legacy.id),
    question: String(legacy.input ?? "").slice(0, 600),
    category: intent,
    difficulty: DIFFICULTY_MAP[String(legacy.difficulty)] ?? "中等",
    riskLevel: intent === "投诉" ? "high" : "low",
    expectedBehavior: [head, tail].filter(Boolean).join("\n").slice(0, 400),
    expectedReply: "",
    expectedKeywords: [],
    keywordMode: "AND",
    forbiddenWords: [],
    expectedPrice: null,
    priceTolerance: 0.01,
    expectRiskPassed: true,
    requiredCapabilities: [],
    forbiddenCapabilities: [],
    evalDimension: DIMENSION_BY_INTENT[intent] ?? "准确性",
    llmJudgePrompt: null,
    tags: [...(Array.isArray(legacy.tags) ? legacy.tags.map(String) : []), ...LEGACY_EVAL_TAGS],
    sourceRunId: null,
    createdAt: String(legacy.updatedAt ?? new Date().toISOString()),
    enabled: false,
  };
}
