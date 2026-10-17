/**
 * 课堂 fixture Provider：无外部密钥时的确定性演示输出。
 *
 * 它不是「绕过主链路的假答案」：编排器仍然会走 Planner → 校验 → Skill/Tool 执行 → risk-check，
 * fixture 只替代「模型生成本身」，并且：
 * - 所有输出都打上课堂演示标识（模型名 fixture-deterministic-v1 + 回复 footer）；
 * - Planner 输出的是合规的 Plan JSON，照样要被 Validator 校验；
 * - risk-check 用 R1–R8 规则引擎给出确定性判定，不是写死 PASS。
 */
import {
  FIXTURE_MODEL,
  LlmError,
  type LlmCallOptions,
  type LlmMessage,
  type LlmProvider,
  type LlmResult,
} from "./types";
import { evaluateRisk } from "../risk/rules";

interface FixtureContext {
  question?: string;
  conversationHistory?: { role: string; content: string }[];
  mandatoryCapabilities?: string[];
  availableSkills?: { id: string; name: string; stage: string; capabilities: string[]; order: number }[];
  availableTools?: { id: string; name: string; capabilities: string[] }[];
  skill?: { id: string; name: string; stage: string; version: string };
  priorSteps?: { type: string; name: string; status: string; summary: string }[];
  toolResults?: { toolId: string; output: unknown }[];
  draftReply?: string;
  knownPrices?: number[];
  isNewCustomer?: boolean;
  run?: Record<string, unknown>;
}

const CONTEXT_PATTERN = /<<<CONTEXT>>>\s*([\s\S]*?)\s*<<<END_CONTEXT>>>/;

function readContext(messages: LlmMessage[]): FixtureContext {
  const joined = messages.map((message) => message.content).join("\n");
  const match = CONTEXT_PATTERN.exec(joined);
  // 连接测试 / 健康检查等「无上下文」的调用：fixture 仍然可用，返回一个确定性占位
  if (!match) throw new LlmError("BAD_RESPONSE", "fixture 找不到上下文块，无法生成确定性输出");
  try {
    return JSON.parse(match[1]!) as FixtureContext;
  } catch {
    throw new LlmError("BAD_RESPONSE", "fixture 上下文块不是合法 JSON");
  }
}

const SKILL_BY_CAPABILITY: Record<string, string[]> = {
  intent: ["need-extraction"],
  clarification: ["clarification-question"],
  recommendation: ["recommendation-decision", "gift-scenario-advisor"],
  substitution: ["product-substitution"],
  reasoning: ["recommendation-reason"],
  reply: ["response-generator"],
  risk: ["risk-check", "complaint-triage"],
  safety: ["allergy-risk-reminder"],
  allergy: ["allergy-risk-reminder"],
  after_sales: ["after-sales-classification"],
  refund: ["after-sales-classification"],
  complaint: ["complaint-triage"],
  handoff: ["human-handoff-decision"],
  gift: ["gift-scenario-advisor"],
  summary: ["conversation-summary"],
  greeting: ["对话问候-skill"],
  price: [],
  order: [],
  logistics: [],
  coupon: [],
  activity: [],
  product: [],
};

const TOOL_BY_CAPABILITY: Record<string, string[]> = {
  price: ["calculate_price"],
  order: ["query_orders"],
  logistics: ["query_logistics"],
  coupon: ["query_coupons"],
  activity: ["query_activities"],
  product: ["query_products"],
  promotion: ["query_activities", "query_coupons"],
};

function pickSkills(context: FixtureContext, caps: string[]): string[] {
  const available = new Set((context.availableSkills ?? []).map((skill) => skill.id));
  const order = new Map((context.availableSkills ?? []).map((skill) => [skill.id, skill.order]));
  const picked: string[] = [];

  for (const capability of caps) {
    const candidates = SKILL_BY_CAPABILITY[capability] ?? [];
    const direct = candidates.find((id) => available.has(id));
    if (direct && !picked.includes(direct)) {
      picked.push(direct);
      continue;
    }
    // 能力标签兜底：找任何一个声明了该能力的启用 Skill
    const byCapability = (context.availableSkills ?? []).find(
      (skill) => skill.capabilities.includes(capability) && !picked.includes(skill.id),
    );
    if (byCapability) picked.push(byCapability.id);
  }

  return picked.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

function pickTools(context: FixtureContext, caps: string[]): string[] {
  const available = new Set((context.availableTools ?? []).map((tool) => tool.id));
  const picked: string[] = [];
  for (const capability of caps) {
    for (const toolId of TOOL_BY_CAPABILITY[capability] ?? []) {
      if (available.has(toolId) && !picked.includes(toolId)) picked.push(toolId);
    }
    const byCapability = (context.availableTools ?? []).find(
      (tool) => tool.capabilities.includes(capability) && !picked.includes(tool.id),
    );
    if (byCapability) picked.push(byCapability.id);
  }
  // 查询类在前，calculate_price 最后（依赖前面查询到的商品）
  return picked.sort((a, b) => (a === "calculate_price" ? 1 : 0) - (b === "calculate_price" ? 1 : 0));
}

function buildPlan(context: FixtureContext) {
  const caps = context.mandatoryCapabilities ?? [];
  const selectedSkills = pickSkills(context, caps);
  const selectedTools = pickTools(context, caps);

  const availableSkillIds = new Set((context.availableSkills ?? []).map((skill) => skill.id));
  const availableToolIds = new Set((context.availableTools ?? []).map((tool) => tool.id));
  const uncovered = caps.filter((capability) => {
    const fromSkill = (SKILL_BY_CAPABILITY[capability] ?? []).some((id) => availableSkillIds.has(id));
    const fromTool = (TOOL_BY_CAPABILITY[capability] ?? []).some((id) => availableToolIds.has(id));
    return !fromSkill && !fromTool;
  });

  const riskCaps = ["risk", "complaint", "safety"];
  const needsRiskCheck = caps.some((capability) => riskCaps.includes(capability));
  const level = needsRiskCheck ? "high" : caps.includes("after_sales") ? "medium" : "low";

  const reasoningParts = [
    `问题「${(context.question ?? "").slice(0, 40)}」被识别出的必需能力：${caps.length > 0 ? caps.join("、") : "无"}`,
    selectedSkills.length > 0 ? `选择 Skill：${selectedSkills.join("、")}（按流水线顺序）` : "没有可用的 Skill",
    selectedTools.length > 0 ? `选择 Tool：${selectedTools.join("、")}（查询优先，价格试算最后）` : "没有可用的 Tool",
  ];
  if (uncovered.length > 0) reasoningParts.push(`以下能力当前没有可用实现：${uncovered.join("、")}`);

  return {
    selectedSkills,
    selectedTools,
    mandatoryCapabilities: caps,
    reasoning: reasoningParts.join("；"),
    riskAssessment: {
      level,
      flags: caps.filter((capability) => riskCaps.includes(capability) || capability === "after_sales"),
      needsRiskCheck: needsRiskCheck || level === "high",
    },
    degradation:
      uncovered.length > 0
        ? {
            degraded: true,
            handoff: true,
            reason: `能力不足：${uncovered.join("、")} 没有启用的 Skill 或 Tool 可以覆盖，已转人工`,
          }
        : { degraded: false, handoff: false, reason: null },
  };
}

function buildSkillOutput(context: FixtureContext): string {
  const skill = context.skill;
  const question = context.question ?? "";
  const tools = context.toolResults ?? [];
  const products = tools.find((entry) => entry.toolId === "query_products")?.output as
    | { items?: { name: string; price: number; stock: number; sugarPer100g?: number; allergens?: string[] }[] }
    | undefined;
  const price = tools.find((entry) => entry.toolId === "calculate_price")?.output as
    | { payable?: number; subtotal?: number; totalDiscount?: number; notes?: string[] }
    | undefined;
  const orders = tools.find((entry) => entry.toolId === "query_orders")?.output as
    | { items?: { orderNo: string; status: string; logisticsStatus: string; afterSalesStatus: string }[] }
    | undefined;
  const logistics = tools.find((entry) => entry.toolId === "query_logistics")?.output as
    | { items?: { orderNo: string; carrier: string; lastEvent: string; delayHours: number; estimatedArrival: string }[] }
    | undefined;

  const facts: string[] = [];
  if (products?.items?.length) {
    const top = products.items[0]!;
    facts.push(
      `「${top.name}」当前 ${top.price} 元，库存 ${top.stock} 件${top.sugarPer100g !== undefined ? `，每 100g 含糖 ${top.sugarPer100g}g` : ""}`,
    );
    if (products.items[1]) facts.push(`同类还有「${products.items[1].name}」（${products.items[1].price} 元）`);
  }
  if (price?.payable !== undefined) {
    facts.push(`按当前明细试算，应付 ${price.payable} 元${price.totalDiscount ? `（已优惠 ${price.totalDiscount} 元）` : ""}`);
  }
  if (orders?.items?.length) {
    const order = orders.items[0]!;
    facts.push(`订单 ${order.orderNo} 当前状态是「${order.status}」，物流「${order.logisticsStatus}」，售后「${order.afterSalesStatus}」`);
  }
  if (logistics?.items?.length) {
    const track = logistics.items[0]!;
    facts.push(
      `运单 ${track.orderNo} 由 ${track.carrier} 承运，最新节点「${track.lastEvent}」${track.delayHours > 0 ? `，已延误 ${track.delayHours} 小时` : ""}`,
    );
  }

  const skillName = skill?.name ?? "Skill";
  if (skill?.id === "response-generator") {
    const body =
      facts.length > 0
        ? `${facts.join("；")}。`
        : `我先按你描述的情况帮你确认，稍后给出具体方案。`;
    return [
      `你好，关于「${question.slice(0, 40)}」：`,
      body,
      "如果还需要更细的信息，可以直接告诉我想看的商品或订单号。",
      "",
      "[课堂演示模式] 本回复由确定性 fixture 生成，未调用真实模型。",
    ].join("\n");
  }

  if (skill?.id === "need-extraction") {
    return JSON.stringify(
      {
        skill: "need-extraction",
        intents: context.mandatoryCapabilities ?? [],
        question,
        missingSlots: [],
        source: "fixture",
      },
      null,
      2,
    );
  }

  if (skill?.id === "recommendation-decision" && products?.items?.length) {
    return JSON.stringify(
      {
        skill: "recommendation-decision",
        candidates: products.items.slice(0, 3).map((item, index) => ({
          rank: index + 1,
          name: item.name,
          price: item.price,
          stock: item.stock,
        })),
      },
      null,
      2,
    );
  }

  return `【${skillName}】已处理问题「${question.slice(0, 40)}」，产出 ${facts.length} 条事实依据（fixture 确定性输出）。`;
}

function buildRiskResult(context: FixtureContext): string {
  const verdict = evaluateRisk(context.draftReply ?? "", {
    knownPrices: context.knownPrices,
    isNewCustomer: context.isNewCustomer,
  });
  return JSON.stringify(verdict, null, 2);
}

function buildExplanation(context: FixtureContext): string {
  const run = (context.run ?? {}) as Record<string, unknown>;
  const steps = (run.steps as { name: string; type: string; status: string; durationMs: number }[] | undefined) ?? [];
  const risk = run.riskResult as { verdict?: string; findings?: { ruleId: string; level: string }[] } | undefined;
  const plan = run.plan as { selectedSkills?: string[]; selectedTools?: string[]; reasoning?: string } | undefined;

  return [
    `# 运行解释（${String(run.id ?? "未知运行")}）`,
    "",
    "## 计划",
    plan ? `- 选择 Skill：${(plan.selectedSkills ?? []).join("、") || "无"}` : "- 没有可用的计划",
    plan ? `- 选择 Tool：${(plan.selectedTools ?? []).join("、") || "无"}` : "",
    plan?.reasoning ? `- 理由：${plan.reasoning}` : "",
    "",
    "## 执行",
    ...steps.map((step) => `- [${step.status}] ${step.type}/${step.name}（${step.durationMs} ms）`),
    "",
    "## 风险判断",
    risk
      ? `- 结论：${risk.verdict === "allow" ? "允许发送" : risk.verdict === "skipped" ? "未执行风险审查" : "已阻断并改写"}`
      : "- 没有风险结果",
    ...(risk?.findings ?? []).map((finding) => `- 命中 ${finding.ruleId}（${finding.level}）`),
    "",
    "> 该解释由课堂演示模式的确定性生成器产出，依据是 RunRecord 里真实记录的 Plan / 步骤 / 风险结果。",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function estimateTokens(messages: LlmMessage[], text: string): { inputTokens: number; outputTokens: number } {
  const inputChars = messages.reduce((total, message) => total + message.content.length, 0);
  return { inputTokens: Math.ceil(inputChars / 4), outputTokens: Math.ceil(text.length / 4) };
}

export function createFixtureProvider(): LlmProvider {
  return {
    id: "classroom-fixture",
    label: "课堂演示模式（确定性 fixture）",
    model: FIXTURE_MODEL,
    fixture: true,
    async complete(messages: LlmMessage[], options: LlmCallOptions): Promise<LlmResult> {
      const startedAt = performance.now();
      // 连接测试 / 健康检查：没有 task 时不走上下文解析，直接返回确定性文案
    if (!options.task) {
      return {
        text: "课堂演示模式连接正常（确定性 fixture，未调用外部模型）",
        provider: "classroom-fixture",
        model: FIXTURE_MODEL,
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
        usage: { inputTokens: 0, outputTokens: 0 },
        fixture: true,
      };
    }

    const context = readContext(messages);

      let text: string;
      switch (options.task) {
        case "plan":
          text = JSON.stringify(buildPlan(context), null, 2);
          break;
        case "skill":
          text = buildSkillOutput(context);
          break;
        case "risk":
          text = buildRiskResult(context);
          break;
        case "explain":
          text = buildExplanation(context);
          break;
        default:
          throw new LlmError("BAD_RESPONSE", `fixture 不支持的任务：${String(options.task)}`);
      }

      return {
        text,
        provider: "classroom-fixture",
        model: FIXTURE_MODEL,
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
        usage: estimateTokens(messages, text),
        fixture: true,
      };
    },
  };
}
