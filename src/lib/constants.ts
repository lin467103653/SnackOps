/**
 * 前后端共用的枚举常量（不含 schema，客户端可以直接 import）。
 */

/** 演示环境的操作人；接入登录后由会话替换 */
export const OPERATOR = "值班运营 · 林小满";

export const ANNOTATION_TAGS = ["好案例", "坏案例", "待优化", "合规风险", "知识缺口"] as const;
export type AnnotationTagValue = (typeof ANNOTATION_TAGS)[number];

export const TICKET_INTENTS = [
  "催发货",
  "退款退货",
  "优惠咨询",
  "商品咨询",
  "物流异常",
  "改地址",
  "投诉",
] as const;

export const RUN_STATUSES = ["成功", "已接管", "失败", "超时"] as const;

export const CHANNELS = ["小程序", "APP", "直播间", "电话", "社群"] as const;

export const PRIORITIES = ["P0", "P1", "P2"] as const;

export const FALLBACK_POLICIES = ["转人工", "兜底话术", "重试", "降级模型"] as const;
