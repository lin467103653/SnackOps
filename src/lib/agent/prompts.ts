/**
 * Prompt 组装。
 *
 * 约定：每个请求都把结构化上下文放在 `<<<CONTEXT>>> … <<<END_CONTEXT>>>` 块里，
 * 真实模型读整段提示词，课堂 fixture 只解析这个块来生成确定性输出 ——
 * 两条路径吃的是同一份输入，走的是同一条链路。
 */
import type { LlmMessage } from "../llm";
import type { Skill, Tool } from "../types";
import type { RiskFinding } from "../types";

export function contextBlock(context: object): string {
  return `<<<CONTEXT>>>\n${JSON.stringify(context, null, 2)}\n<<<END_CONTEXT>>>`;
}

export interface PlannerInput {
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  skills: Skill[];
  tools: Tool[];
  mandatoryCapabilities: string[];
  /** Planner 系统提示词（来自 data/planner-config.json，可被管理后台编辑） */
  systemPrompt: string;
}

export function plannerMessages(input: PlannerInput): LlmMessage[] {
  const catalog = {
    question: input.question,
    conversationHistory: input.history.slice(-6),
    mandatoryCapabilities: input.mandatoryCapabilities,
    availableSkills: input.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      stage: skill.stage,
      capabilities: skill.capabilities,
      order: skill.order,
    })),
    availableTools: input.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      capabilities: [tool.id === "calculate_price" ? "price" : tool.kind === "计算" ? "price" : tool.id.replace("query_", "")],
    })),
  };

  const system = [
    input.systemPrompt.trim(),
    "",
    "只输出如下 JSON：",
    JSON.stringify(
      {
        selectedSkills: ["skill-id"],
        selectedTools: ["tool-id"],
        reasoning: "一句话说明为什么这样选",
        mandatoryCapabilities: ["reply"],
        riskAssessment: { level: "low|medium|high", flags: ["risk"], needsRiskCheck: true },
        degradation: null,
        toolInputs: {},
      },
      null,
      2,
    ),
  ].join("\n");

  const user = [
    `用户问题：${input.question}`,
    input.history.length > 0
      ? `历史对话（最近 ${Math.min(6, input.history.length)} 条）：\n${input.history
          .slice(-6)
          .map((item) => `${item.role === "user" ? "用户" : "客服"}：${item.content}`)
          .join("\n")}`
      : "历史对话：无",
    contextBlock(catalog),
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface SkillPromptInput {
  skill: Skill;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  toolResults: { toolId: string; output: unknown }[];
  priorSkills: { skillId: string; text: string }[];
  mandatoryCapabilities: string[];
}

export function skillMessages(input: SkillPromptInput): LlmMessage[] {
  const facts = input.toolResults
    .map((entry) => `[${entry.toolId}]\n${truncate(JSON.stringify(entry.output), 1500)}`)
    .join("\n\n");

  const context = {
    question: input.question,
    conversationHistory: input.history.slice(-6),
    mandatoryCapabilities: input.mandatoryCapabilities,
    skill: { id: input.skill.id, name: input.skill.name, stage: input.skill.stage, version: input.skill.version },
    toolResults: input.toolResults,
    priorSteps: input.priorSkills.map((entry) => ({
      type: "skill",
      name: entry.skillId,
      status: "success",
      summary: truncate(entry.text, 300),
    })),
  };

  const user = [
    `用户问题：${input.question}`,
    facts ? `工具返回的真实数据：\n${facts}` : "工具返回：无（本次没有调用工具）",
    input.priorSkills.length > 0
      ? `上游 Skill 输出：\n${input.priorSkills.map((entry) => `- ${entry.skillId}: ${truncate(entry.text, 200)}`).join("\n")}`
      : "",
    "请按你的系统提示词要求输出。只输出给用户或下游 Skill 使用的内容，不要解释你是什么模型。",
    contextBlock(context),
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: input.skill.systemPrompt },
    { role: "user", content: user },
  ];
}

export function riskMessages(input: {
  question: string;
  draftReply: string;
  knownPrices: number[];
  isNewCustomer: boolean | undefined;
  findingsHint?: RiskFinding[];
}): LlmMessage[] {
  const context = {
    question: input.question,
    draftReply: input.draftReply,
    knownPrices: input.knownPrices,
    isNewCustomer: input.isNewCustomer ?? null,
    rules: "R1 价格一致性 / R2 极限词 / R3 超政策承诺 / R4 新客优惠 / R5 特殊人群 / R6 推诿 / R7 诈骗 / R8 放行判定",
  };

  const system = [
    "你是 risk-check Skill：发送前的最后一道闸。",
    "依据 R1–R8 规则检查待发送回复，只输出 JSON。",
    "安全回复可以发送，只有危险回复才阻断。",
    '输出结构：{"verdict":"allow|block","findings":[{"ruleId":"R1","level":"block|warn","evidence":"","suggestion":""}],"rewritten":null}',
  ].join("\n");

  const user = [
    `用户问题：${input.question}`,
    `待发送回复：\n${input.draftReply}`,
    `已知价格集合：${input.knownPrices.length > 0 ? input.knownPrices.join("、") : "无"}`,
    contextBlock(context),
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function explainMessages(input: { runSummary: object; question: string }): LlmMessage[] {
  const system = [
    "你是 SnackOps 的运营分析助手，负责解释一次 Agent 运行为什么得到这个结果。",
    "要求：基于给出的 Plan / 步骤 / 风险结果解释，不要编造没有记录的事实；用中文，输出 Markdown 小节。",
  ].join("\n");

  const user = [
    `用户问题：${input.question}`,
    "请解释这次运行：计划是否合理、执行中有没有异常、风险判断依据是什么、下次可以怎么改。",
    contextBlock({ question: input.question, run: input.runSummary }),
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
