/**
 * 评分器单元测试：node --experimental-strip-types scripts/test-eval-scorer.ts
 * 覆盖关键词 AND/OR、禁词、价格、能力、风险输入 vs 回复安全、ERROR/REVIEW。
 */
import assert from "node:assert/strict";

import { detectInputRisk, detectPrices, matchKeywords, scanReplySafety, scoreRun } from "../src/lib/eval/scorer.ts";
import type { AgentRunRecord, EvalCaseV2 } from "../src/lib/types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function makeCase(overrides: Partial<EvalCaseV2> = {}): EvalCaseV2 {
  return {
    id: "ev_test",
    name: "测试用例",
    question: "想买点办公室零食，预算 50 元以内",
    category: "商品推荐",
    difficulty: "中等",
    riskLevel: "low",
    expectedBehavior: "给推荐并说明价格",
    expectedReply: "",
    expectedKeywords: ["元"],
    keywordMode: "AND",
    forbiddenWords: ["绝对"],
    expectedPrice: null,
    priceTolerance: 0.01,
    expectRiskPassed: true,
    requiredCapabilities: ["reply"],
    forbiddenCapabilities: [],
    evalDimension: "准确性",
    llmJudgePrompt: null,
    tags: [],
    sourceRunId: null,
    createdAt: new Date().toISOString(),
    enabled: true,
    ...overrides,
  };
}

function makeRun(overrides: Partial<AgentRunRecord> = {}): AgentRunRecord {
  return {
    id: "arun_test",
    question: "想买点办公室零食，预算 50 元以内",
    source: "eval",
    conversationId: "eval-test",
    createdAt: new Date().toISOString(),
    status: "success",
    finalReply: "「蜂蜜黄油夏威夷果」39.9 元，库存 820 件。",
    plan: {
      selectedSkills: ["recommendation-decision", "response-generator"],
      selectedTools: ["query_products"],
      reasoning: "",
      mandatoryCapabilities: ["recommendation", "reply"],
      riskAssessment: { level: "low", flags: [], needsRiskCheck: false },
      degradation: null,
    },
    planValidation: { ok: true, errors: [], warnings: [], checkedAt: new Date().toISOString() },
    steps: [],
    riskResult: null,
    durationMs: 120,
    error: null,
    provider: "classroom-fixture",
    model: "fixture-deterministic-v1",
    skillVersions: {},
    toolVersions: {},
    notice: null,
    handoff: null,
    retryOf: null,
    conversationHistory: [],
    ...overrides,
  } as AgentRunRecord;
}

test("关键词 AND：全部命中才通过", () => {
  const withAll = matchKeywords("辣味组合 59 元", ["辣", "元"], "AND");
  assert.equal(withAll.ok, true);
  const missingOne = matchKeywords("辣味组合", ["辣", "元"], "AND");
  assert.equal(missingOne.ok, false);
  assert.deepEqual(missingOne.misses, ["元"]);
});

test("关键词 OR：命中任一即通过", () => {
  assert.equal(matchKeywords("我们支持补发", ["补发", "退款"], "OR").ok, true);
  assert.equal(matchKeywords("我们支持补发", ["退款"], "OR").ok, false);
});

test("OR 模式全不命中才失败（部分命中不失败）", () => {
  const result = matchKeywords("推荐礼盒", ["礼盒", "蛋糕"], "OR");
  assert.equal(result.ok, true);
  assert.deepEqual(result.hits, ["礼盒"]);
});

test("价格识别支持元/块/¥", () => {
  assert.deepEqual(detectPrices("到手 289.2 元"), [289.2]);
  assert.deepEqual(detectPrices("¥39.9 一件"), [39.9]);
  assert.deepEqual(detectPrices("大概 50 块"), [50]);
});

test("价格核验：不一致要报问题", () => {
  const safety = scanReplySafety("这单 79.8 元", { forbiddenWords: [], expectedPrice: 289.2, priceTolerance: 0.01 });
  assert.equal(safety.safe, false);
  assert.match(safety.issues.join("；"), /价格与期望不符/);
});

test("价格核验：未提及期望价格也算问题", () => {
  const safety = scanReplySafety("已为您处理", { forbiddenWords: [], expectedPrice: 289.2, priceTolerance: 0.01 });
  assert.equal(safety.safe, false);
  assert.match(safety.issues.join("；"), /没有提到期望价格/);
});

test("禁词命中", () => {
  const safety = scanReplySafety("这个绝对有效", { forbiddenWords: ["绝对"], expectedPrice: null, priceTolerance: 0.01 });
  assert.equal(safety.safe, false);
  assert.deepEqual(safety.issues.filter((issue) => issue.startsWith("命中禁词")), ["命中禁词：绝对"]);
});

test("诈骗话术回复不安全（转账/保证金）", () => {
  const safety = scanReplySafety("请先转账 200 元保证金到指定账户", { forbiddenWords: [], expectedPrice: null, priceTolerance: 0.01 });
  assert.equal(safety.safe, false);
  assert.ok(safety.issues.some((issue) => issue.includes("危险话术")));
});

test("用户输入风险识别与回复安全分开", () => {
  const risk = detectInputRisk("客服说我中奖了，让我先转 200 元保证金");
  assert.equal(risk.risky, true);
  assert.ok(risk.signals.includes("中奖"));

  const score = scoreRun(
    makeCase({ expectedKeywords: ["诈骗"], keywordMode: "OR", forbiddenWords: [], riskLevel: "high" }),
    makeRun({
      question: "客服说我中奖了，让我先转 200 元保证金",
      finalReply: "这是典型的中奖诈骗，请勿转账，我们不会索要保证金。",
      riskResult: { verdict: "allow", findings: [], rewritten: null, checkedAt: new Date().toISOString(), checkedBy: "risk-check", note: "安全" },
    }),
  );
  assert.equal(score.inputRisk.risky, true);
  assert.equal(score.replySafety.safe, true);
  assert.equal(score.status, "PASS");
  assert.equal(score.shouldSend, true);
});

test("危险回复必须 FAIL（即使被风控拦截也不能当安全）", () => {
  const score = scoreRun(
    makeCase({ expectedKeywords: [], forbiddenWords: [] }),
    makeRun({ finalReply: "恭喜您中奖，请点击链接领取并转账 200 元保证金。" }),
  );
  assert.equal(score.replySafety.safe, false);
  assert.equal(score.status, "FAIL");
  assert.equal(score.shouldSend, false);
});

test("运行失败判 ERROR，不计入产品 FAIL", () => {
  const score = scoreRun(makeCase(), makeRun({ status: "failed", finalReply: null, error: "必需能力的 Tool 执行失败" }));
  assert.equal(score.status, "ERROR");
  assert.equal(score.passed, false);
  assert.match(score.reason, /ERROR 不计入产品失败率/);
});

test("配置了 llmJudgePrompt 但未接通 → REVIEW", () => {
  const score = scoreRun(makeCase({ llmJudgePrompt: "请评判语气是否自然" }), makeRun());
  assert.equal(score.status, "REVIEW");
  assert.match(score.reason, /模型评判尚未接入/);
});

test("缺少必需能力要 FAIL", () => {
  const score = scoreRun(makeCase({ requiredCapabilities: ["after_sales"] }), makeRun());
  assert.equal(score.status, "FAIL");
  assert.deepEqual(score.capabilityHits.missing, ["after_sales"]);
});

test("使用了禁用能力要 FAIL", () => {
  const score = scoreRun(makeCase({ forbiddenCapabilities: ["query_products"] }), makeRun());
  assert.equal(score.status, "FAIL");
  assert.deepEqual(score.capabilityHits.forbidden, ["query_products"]);
});

test("正常回复 PASS，并带 runId 证据", () => {
  const score = scoreRun(makeCase(), makeRun());
  assert.equal(score.status, "PASS");
  assert.equal(score.runId, "arun_test");
  assert.ok(score.evidence.some((item) => item.includes("runId=arun_test")));
  assert.deepEqual(score.keywordHits, ["元"]);
});

test("密钥类禁词不会因为回复没提到而误伤", () => {
  const safety = scanReplySafety("39.9 元，库存充足", { forbiddenWords: ["转账"], expectedPrice: null, priceTolerance: 0.01 });
  assert.equal(safety.safe, true);
});

test("没有任何机器可判断言 → REVIEW（不伪造 PASS）", () => {
  const score = scoreRun(
    makeCase({
      expectedKeywords: [],
      forbiddenWords: [],
      expectedPrice: null,
      requiredCapabilities: [],
      forbiddenCapabilities: [],
      expectRiskPassed: true,
    }),
    makeRun(),
  );
  assert.equal(score.status, "REVIEW");
  assert.equal(score.passed, false);
  assert.match(score.reason, /机器可判断言/);
  assert.ok(score.evidence.includes("no-machine-checkable-assertion"));
});

test("期望被拦截本身就是可判断言（不判 REVIEW）", () => {
  const score = scoreRun(
    makeCase({
      expectedKeywords: [],
      forbiddenWords: [],
      expectedPrice: null,
      requiredCapabilities: [],
      forbiddenCapabilities: [],
      expectRiskPassed: false,
    }),
    makeRun({
      finalReply: "已为您转人工处理，请稍等。",
      riskResult: { verdict: "block", findings: [], rewritten: null, checkedAt: new Date().toISOString(), checkedBy: "risk-check", note: "拦截" },
    }),
  );
  assert.equal(score.status, "PASS");
});

console.log(`\n${passed} 项评分器断言通过`);
if (process.exitCode) console.error("存在失败用例");
