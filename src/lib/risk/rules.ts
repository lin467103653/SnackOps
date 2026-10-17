/**
 * 可审计的风险规则（R1–R8）。
 *
 * 两处使用：
 * 1. 课堂 fixture 的 risk-check —— 无外部模型时用同一套规则给出确定性判定；
 * 2. `/api/explain` 的解释素材。
 *
 * 规则与 skills/risk-check.md 里的 R1–R8 一一对应，改规则时两边一起改。
 */
import type { RiskFinding, RiskResult } from "../types";

export interface RiskContext {
  /** 已知商品价格（来自 query_products / calculate_price 的真实返回），用于价格一致性 */
  knownPrices?: number[];
  /** 用户是否新客（来自 users.json），用于新客优惠判断 */
  isNewCustomer?: boolean;
}

interface RuleOutcome {
  hit: boolean;
  evidence?: string;
  suggestion?: string;
}

interface RiskRule {
  id: string;
  name: string;
  level: "block" | "warn";
  description: string;
  detect: (text: string, context: RiskContext) => RuleOutcome;
}

const EXTREME_WORDS = [
  "绝对",
  "第一",
  "最好",
  "最低价",
  "全网最",
  "100%",
  "百分百",
  "零风险",
  "包治",
  "治疗",
  "降血糖",
  "降血压",
  "减肥",
  "无副作用",
  "国家级",
  "顶级",
  "特效",
  "根治",
];

const OVER_PROMISE = [
  "无条件退款",
  "无条件退货",
  "一定赔",
  "一定退",
  "保证退款",
  "全额赔偿",
  "假一赔十",
  "终身保修",
  "终身质保",
  "包退包换",
  "永久有效",
  "什么时候都能退",
];

const BLAME_WORDS = [
  "不是我们的问题",
  "不是我们的责任",
  "找平台",
  "你自己操作问题",
  "无法处理",
  "与我无关",
  "不予受理",
  "不归我们管",
  "你自己看着办",
];

const SPECIAL_GROUPS = ["儿童", "小孩", "宝宝", "婴儿", "幼儿", "孕妇", "哺乳", "糖尿病", "过敏", "老人"];
const SAFETY_WORDS = ["成人陪同", "咨询医生", "遵医嘱", "注意过敏", "过敏原", "少量", "不建议", "不适合", "谨慎"];

const SCAM_TRIGGERS = ["中奖", "返现", "领奖", "领红包", "退款到账", "扫码领取", "加客服", "客服电话", "保证金"];
const SCAM_REMINDERS = {
  noTransfer: ["不要转账", "不要汇款", "不转账", "不要付款"],
  noSensitive: ["验证码", "银行卡", "身份证", "敏感信息"],
  noPrizePromise: ["不承诺兑奖", "无法兑奖", "不保证中奖", "不承诺中奖"],
  officialOnly: ["官方渠道", "官方客服", "官方核验", "官方App", "官方 APP"],
};

function findFirst(text: string, words: string[]): string | null {
  for (const word of words) {
    if (text.includes(word)) return word;
  }
  return null;
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export const RISK_RULES: RiskRule[] = [
  {
    id: "R1",
    name: "价格一致性",
    level: "block",
    description: "回复中的价格必须来自 query_products / calculate_price 的真实返回",
    detect: (text, context) => {
      const prices = [...text.matchAll(/¥?\s?(\d+(?:\.\d{1,2})?)\s?元/g)].map((match) => Number(match[1]));
      if (prices.length === 0) return { hit: false };
      if (!context.knownPrices || context.knownPrices.length === 0) {
        return { hit: false };
      }
      const known = new Set(context.knownPrices.map((price) => Math.round(price * 100) / 100));
      const mismatch = prices.find((price) => !known.has(Math.round(price * 100) / 100));
      if (mismatch === undefined) return { hit: false };
      return {
        hit: true,
        evidence: `回复出现的 ${mismatch} 元不在工具返回的价格集合内`,
        suggestion: "改用工具返回的价格，或把金额改写为「以结算页为准」",
      };
    },
  },
  {
    id: "R2",
    name: "禁止极限词与夸大功效",
    level: "block",
    description: "不得使用「绝对 / 第一 / 最好 / 100% / 治疗 / 降血糖」等表达",
    detect: (text) => {
      const hit = findFirst(text, EXTREME_WORDS);
      return hit ? { hit: true, evidence: `命中极限词「${hit}」`, suggestion: "改为可验证的事实描述，例如「本周销量靠前」" } : { hit: false };
    },
  },
  {
    id: "R3",
    name: "不做超出售后政策的承诺",
    level: "block",
    description: "赔付与时效必须以 return-policies 的口径为准",
    detect: (text) => {
      const hit = findFirst(text, OVER_PROMISE);
      return hit ? { hit: true, evidence: `出现政策外的承诺「${hit}」`, suggestion: "改为引用政策原文，并说明以审核结果为准" } : { hit: false };
    },
  },
  {
    id: "R4",
    name: "新客优惠判断",
    level: "block",
    description: "只有 isNewCustomer=true 才能承诺新客券",
    detect: (text, context) => {
      const mentions = hasAny(text, ["新客", "首单", "新人"]);
      if (!mentions) return { hit: false };
      if (context.isNewCustomer === false) {
        return { hit: true, evidence: "对老客承诺了新客/首单优惠", suggestion: "改为常规券或会员权益" };
      }
      if (context.isNewCustomer === undefined) {
        return { hit: false };
      }
      return { hit: false };
    },
  },
  {
    id: "R5",
    name: "特殊人群安全提示",
    level: "block",
    description: "涉及儿童/孕妇/过敏等人群时必须附安全提示",
    detect: (text) => {
      const group = findFirst(text, SPECIAL_GROUPS);
      if (!group) return { hit: false };
      if (hasAny(text, SAFETY_WORDS)) return { hit: false };
      return {
        hit: true,
        evidence: `提到「${group}」但缺少安全提示`,
        suggestion: "补充「请咨询医生 / 成人陪同 / 注意过敏原」等提示",
      };
    },
  },
  {
    id: "R6",
    name: "投诉与售后不能推诿",
    level: "block",
    description: "禁止把责任推给用户或平台",
    detect: (text) => {
      const hit = findFirst(text, BLAME_WORDS);
      return hit ? { hit: true, evidence: `命中推诿表达「${hit}」`, suggestion: "先致歉共情，再给明确下一步与时限" } : { hit: false };
    },
  },
  {
    id: "R7",
    name: "疑似中奖或返现诈骗",
    level: "block",
    description: "必须提示不转账、不提供敏感信息、不承诺兑奖、走官方渠道核验",
    detect: (text) => {
      const trigger = findFirst(text, SCAM_TRIGGERS);
      const askingForMoney = /(请|需要|先)\s*(转账|汇款|付款|缴纳)/.test(text);
      if (!trigger && !askingForMoney) return { hit: false };

      const missing: string[] = [];
      if (!hasAny(text, SCAM_REMINDERS.noTransfer)) missing.push("不要转账");
      if (!hasAny(text, SCAM_REMINDERS.noSensitive)) missing.push("不提供验证码/银行卡");
      if (!hasAny(text, SCAM_REMINDERS.noPrizePromise)) missing.push("不承诺兑奖");
      if (!hasAny(text, SCAM_REMINDERS.officialOnly)) missing.push("官方渠道核验");

      if (askingForMoney) {
        return {
          hit: true,
          evidence: "回复里出现了要求用户转账/付款的表达",
          suggestion: "删除转账要求，改为风险提示与官方核验路径",
        };
      }
      if (missing.length > 0) {
        return {
          hit: true,
          evidence: `疑似诈骗场景缺少必要提示：${missing.join("、")}`,
          suggestion: "补齐四要素：不要转账、不提供敏感信息、不承诺兑奖、走官方渠道核验",
        };
      }
      return { hit: false };
    },
  },
];

export function evaluateRisk(text: string, context: RiskContext = {}): RiskResult {
  const findings: RiskFinding[] = [];

  for (const rule of RISK_RULES) {
    const outcome = rule.detect(text, context);
    if (!outcome.hit) continue;
    findings.push({
      ruleId: rule.id,
      level: rule.level,
      evidence: outcome.evidence ?? rule.description,
      suggestion: outcome.suggestion ?? "按规则改写后再发送",
    });
  }

  const blocked = findings.some((finding) => finding.level === "block");

  return {
    verdict: blocked ? "block" : "allow",
    findings,
    rewritten: blocked ? buildSafeReply(findings) : null,
    checkedAt: new Date().toISOString(),
    checkedBy: "rule-engine/R1-R8",
    note: blocked ? "命中阻断规则，已改用安全回复" : "全部阻断项未命中，允许发送",
  };
}

/** 命中阻断项时给运营的可发送兜底话术（不承诺、不推诿） */
export function buildSafeReply(findings: RiskFinding[]): string {
  const rules = findings.map((finding) => finding.ruleId).join("、");
  return [
    "这个问题涉及我需要再核实的内容，先不给你不确定的结论。",
    "我这边会同步给人工同事一起确认，稍后在 15 分钟内回复你具体处理方案。",
    `（安全兜底：命中风险规则 ${rules}，已阻止直接发送）`,
  ].join("");
}

export function ruleCatalog(): { id: string; name: string; level: string; description: string }[] {
  return RISK_RULES.map((rule) => ({
    id: rule.id,
    name: rule.name,
    level: rule.level,
    description: rule.description,
  }));
}
