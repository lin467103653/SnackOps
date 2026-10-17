/**
 * 能力模型：把「用户要什么」翻译成「链路必须覆盖哪些能力」。
 *
 * 这是 Planner 的输入之一（mandatoryCapabilities），也是 Validator 的检查依据。
 * 它只做意图归类，不生成任何回复内容。
 */
export const CAPABILITY_LABELS: Record<string, string> = {
  intent: "意图抽取",
  clarification: "澄清提问",
  recommendation: "推荐",
  product: "商品查询",
  substitution: "商品替代",
  reasoning: "推荐理由",
  reply: "话术生成",
  risk: "风险审查",
  safety: "特殊人群安全",
  allergy: "过敏原",
  after_sales: "售后判定",
  refund: "退款",
  complaint: "投诉处理",
  handoff: "转人工",
  gift: "送礼场景",
  summary: "会话摘要",
  greeting: "问候",
  price: "价格计算",
  order: "订单查询",
  logistics: "物流查询",
  coupon: "优惠券",
  activity: "活动",
  promotion: "营销优惠",
};

/** Tool 提供的能力（Tool 注册表里没有 capabilities 字段，这里显式声明） */
export const TOOL_CAPABILITIES: Record<string, string[]> = {
  query_products: ["product"],
  query_activities: ["activity", "promotion"],
  query_coupons: ["coupon", "promotion"],
  calculate_price: ["price"],
  query_orders: ["order"],
  query_logistics: ["logistics"],
};

interface IntentRule {
  capability: string;
  pattern: RegExp;
  /** 附加能力，例如投诉同时需要 risk */
  also?: string[];
}

const INTENT_RULES: IntentRule[] = [
  { capability: "price", pattern: /价格|多少钱|多少钱一|贵|便宜|优惠|折扣|满减|券后|总价|到手价|算一下|算算|预算|性价比|凑单/ },
  { capability: "order", pattern: /订单|订单号|我的单|买的|下单|SG\d{8,}/i },
  { capability: "logistics", pattern: /物流|快递|发货|揽收|签收|到货|什么时候到|运单|顺丰|中通|圆通|京东物流|邮政|派送/ },
  {
    capability: "after_sales",
    pattern: /退货|退款|售后|换货|破损|压坏|碎了|少了|缺件|发错|临期|过期|变质|坏了|腥味|异味|赔/,
    also: ["refund"],
  },
  { capability: "risk", pattern: /中奖|返现|领奖|领红包|转账|验证码|银行卡|身份证|扫码|加客服|客服电话|保证金|冻结/ },
  { capability: "complaint", pattern: /投诉|12315|曝光|差评|律师|起诉|举报|维权/, also: ["risk"] },
  { capability: "safety", pattern: /过敏|孕妇|哺乳|儿童|宝宝|小孩|婴儿|糖尿病|忌口|不能吃|三高/ },
  { capability: "recommendation", pattern: /推荐|买什么|好吃的|送人|礼物|礼盒|年货|囤货|有什么|尝尝|口味/, also: ["product"] },
  { capability: "gift", pattern: /送礼|送人|伴手礼|生日礼|过节|探病|看望/ },
];

/**
 * 从问题里推导出必须覆盖的能力。
 * 始终要求 reply：没有话术生成能力的链路不应该被判定为成功。
 */
export function deriveMandatoryCapabilities(question: string): string[] {
  const caps: string[] = [];
  const add = (capability: string) => {
    if (!caps.includes(capability)) caps.push(capability);
  };

  for (const rule of INTENT_RULES) {
    if (!rule.pattern.test(question)) continue;
    add(rule.capability);
    for (const extra of rule.also ?? []) add(extra);
  }

  add("reply");
  return caps;
}

export function labelForCapability(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? capability;
}

/** 能力 → 是否需要 Tool（用于 Planner 提示与校验提示语） */
export const CAPABILITY_TOOL_HINT: Record<string, string> = {
  price: "calculate_price",
  order: "query_orders",
  logistics: "query_logistics",
  product: "query_products",
  coupon: "query_coupons",
  activity: "query_activities",
  promotion: "query_activities",
};
