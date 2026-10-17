/**
 * 端到端 API 验证（需要服务已启动，默认 http://127.0.0.1:5000）。
 * 覆盖：EvalCase CRUD、caseIds 精确过滤、空数组/无效 ID、批次轮询、
 * Provider 缺配置、Skill 版本快照、classroom reset 幂等、密钥不泄露。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.SNACKOPS_BASE_URL ?? "http://127.0.0.1:5000";
const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function ok(label, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`PASS ${label}${extra !== undefined ? " — " + extra : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${extra !== undefined ? " — " + extra : ""}`);
  }
}

async function api(method, route, body) {
  const response = await fetch(BASE + route, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function waitBatch(id, timeoutMs = 180000) {
  const started = Date.now();
  for (;;) {
    const result = await api("GET", `/api/eval/batch/${id}`);
    const batch = result.json?.data?.batch;
    if (!batch) return null;
    if (["done", "error", "cancelled"].includes(batch.status)) return batch;
    if (Date.now() - started > timeoutMs) return batch;
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}

/* ------------------------------- 页面可用性 ------------------------------- */
console.log("=== 页面 ===");
for (const route of [
  "/",
  "/demo",
  "/skills",
  "/tools",
  "/planner",
  "/ops",
  "/catalog",
  "/models",
  "/eval",
  "/evals",
  "/overview",
  "/data/eval-cases",
  "/data/eval-batch",
  "/runs",
]) {
  const response = await fetch(BASE + route);
  ok(`${route} 200`, response.status === 200, response.status);
}
// 重置后可能还没有运行记录：先真实跑一条，再验证详情页
let runs = await api("GET", "/api/runs?limit=1");
let runId = runs.json?.data?.items?.[0]?.id;
if (!runId) {
  const stream = await fetch(`${BASE}/api/agent/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "办公室零食推荐，预算 50 元以内", source: "api" }),
  });
  const text = await stream.text();
  const events = text.split("\n\n").map((frame) => frame.split("\n").find((line) => line.startsWith("data: "))).filter(Boolean).map((line) => JSON.parse(line.slice(6)));
  runId = events.find((event) => event.type === "done")?.runId;
  runs = await api("GET", "/api/runs?limit=1");
}
ok("Run 详情可打开", Boolean(runId) && (await fetch(`${BASE}/runs/${runId}`)).status === 200, runId);

/* ------------------------------ EvalCase CRUD ------------------------------ */
console.log("\n=== EvalCase CRUD ===");
const created = await api("POST", "/api/eval/cases", {
  name: "验证用例：CRUD",
  question: "办公室零食推荐，预算 50 元以内",
  category: "商品推荐",
  difficulty: "中等",
  riskLevel: "low",
  expectedBehavior: "给出推荐与价格",
  expectedKeywords: ["元"],
  keywordMode: "AND",
  forbiddenWords: [],
  expectRiskPassed: true,
  requiredCapabilities: ["reply"],
  evalDimension: "准确性",
  tags: ["verify"],
});
ok("创建 201", created.status === 201, created.status);
const caseId = created.json.data.id;
ok("读取包含新用例", (await api("GET", "/api/eval")).json.data.cases.some((item) => item.id === caseId));
ok("编辑生效", (await api("PATCH", `/api/eval/cases/${caseId}`, { name: "验证用例：CRUD-改" })).json.data.name === "验证用例：CRUD-改");
ok("刷新后仍存在", (await api("GET", "/api/eval")).json.data.cases.find((item) => item.id === caseId)?.name === "验证用例：CRUD-改");
ok("删除 200", (await api("DELETE", `/api/eval/cases/${caseId}`)).status === 200);
ok("删除后不存在", !(await api("GET", "/api/eval")).json.data.cases.some((item) => item.id === caseId));

/* --------------------------- 批次：caseIds 精确过滤 --------------------------- */
console.log("\n=== 批次 caseIds ===");
const three = ["ev_scam_prize", "ev_price_check", "ev_office_spicy"];
const batch = await api("POST", "/api/eval/batch/run", { name: "verify-3", versionLabel: "verify", caseIds: three });
ok("创建批次 202", batch.status === 202, batch.status);
const finished = await waitBatch(batch.json.data.batchId);
ok("轮询到终态", Boolean(finished) && finished.status === "done", finished?.status);
ok("total = 3", finished.total === 3, finished.total);
ok(
  "只运行这 3 条",
  JSON.stringify(finished.caseResults.map((item) => item.caseId).sort()) === JSON.stringify([...three].sort()),
);
ok("统计守恒", finished.total === finished.passed + finished.failed + finished.review + finished.errors);
ok("每条有实际回复或 runId", finished.caseResults.every((item) => item.runId || item.status === "ERROR"));
ok("含 evidence 字段", Array.isArray(finished.caseResults[0].evidence));

console.log("\n=== 批次参数校验 ===");
ok("空数组 → 400", (await api("POST", "/api/eval/batch/run", { caseIds: [] })).status === 400);
const invalid = await api("POST", "/api/eval/batch/run", { caseIds: ["ev_scam_prize", "ev_missing"] });
ok("无效 ID → 400 且列出", invalid.status === 400 && invalid.text.includes("ev_missing"), invalid.text.slice(0, 80));
ok("不存在的批次 → 404", (await api("GET", "/api/eval/batch/batch_nope")).status === 404);

/* -------------------------------- Provider -------------------------------- */
console.log("\n=== Provider 缺配置 ===");
const original = (await api("GET", "/api/llm-config")).json.data.status.provider;
await api("POST", "/api/llm-config/switch", { provider: "openai-compatible" });
try {
  const missing = await api("POST", "/api/agent/run", { question: "办公室零食推荐", source: "api" });
  ok("缺配置时返回 503", missing.status === 503, missing.status);
  ok("错误结构化（code + hint）", missing.json?.code === "LLM_NOT_CONFIGURED" || Boolean(missing.json?.hint), JSON.stringify(missing.json).slice(0, 90));
  ok("没有静默降级成 fixture", !missing.text.includes("课堂演示模式"));
  const test = await api("POST", "/api/llm-config/test");
  ok("连接测试返回结构化错误", test.json?.data?.ok === false && Boolean(test.json?.data?.error?.code), test.json?.data?.error?.code);
} finally {
  await api("POST", "/api/llm-config/switch", { provider: original ?? "classroom-fixture" });
}
ok("切回原 Provider", (await api("GET", "/api/llm-config")).json.data.status.provider === (original ?? "classroom-fixture"));

/* ------------------------------ Skill 版本快照 ------------------------------ */
console.log("\n=== Skill 版本快照 ===");
const skill = (await api("GET", "/api/skills/risk-check")).json.data.skill;
const saved = await api("PUT", "/api/skills/risk-check/content", { content: `${skill.systemPrompt}\n## 验证标记\n`, changeNote: "验证：快照" });
ok("保存 200", saved.status === 200, saved.status);
ok("版本递增", saved.json.data.skill.version !== skill.version, `${skill.version} → ${saved.json.data.skill.version}`);
const versions = (await api("GET", "/api/skills/risk-check/versions?withContent=1")).json.data.versions;
ok("旧正文已快照", versions.some((item) => item.version === skill.version && item.content === skill.systemPrompt));
const rollback = await api("POST", "/api/skills/risk-check/rollback", { version: skill.version });
ok("回滚 200", rollback.status === 200, rollback.status);
ok("正文已还原", (await api("GET", "/api/skills/risk-check")).json.data.skill.systemPrompt === skill.systemPrompt);

/* ---------------------------- 评测存储唯一化 ---------------------------- */
console.log("\n=== 评测存储唯一化 ===");
const legacyCases = path.join(ROOT, "data", "eval_cases.json");
const legacyBatches = path.join(ROOT, "data", "eval_batches.json");
ok("旧存储 eval_cases.json 已移除", !fs.existsSync(legacyCases));
ok("旧存储 eval_batches.json 已移除", !fs.existsSync(legacyBatches));
const alias = await api("GET", "/api/eval-batches");
const diskBatches = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "eval-batch.json"), "utf8"));
ok(
  "GET /api/eval-batches 与 eval-batch.json 同源",
  Array.isArray(alias.json?.data) && alias.json.data.length === diskBatches.length,
  `${alias.json?.data?.length} vs ${diskBatches.length}`,
);
const gone = await api("POST", "/api/eval-batches", { skillKey: "any", caseLimit: 3 });
ok("模拟批次的 POST 已下线 → 410", gone.status === 410, gone.status);
ok("410 指明替代接口", gone.text.includes("/api/eval/batch/run"));
// 注意：Next 16 对流式页里的 notFound() 仍先给 200，所以断言看「是否渲染出该集合的文件名」，
// 并用新集合页做对照——有效集合页会显示 `eval-cases.json`。
const legacyPage = await (await fetch(`${BASE}/data/eval_cases`)).text();
const validPage = await (await fetch(`${BASE}/data/eval-cases`)).text();
ok(
  "旧集合地址不再渲染数据（对照：新地址正常渲染）",
  validPage.includes("eval-cases.json") && !legacyPage.includes("eval_cases.json"),
  `valid=${validPage.includes("eval-cases.json")} legacy=${legacyPage.includes("eval_cases.json")}`,
);

// 标注沉淀必须落进同一个评测存储（这一条是双存储时代真正的 bug：写进去在 /eval 看不到）
const sampleRunId = (finished?.caseResults ?? []).map((item) => item.runId).find(Boolean);
if (sampleRunId) {
  const createdAnn = await api("POST", "/api/annotations", {
    targetType: "agent_run",
    targetId: sampleRunId,
    tag: "坏案例",
    note: "验证：标注沉淀到唯一的评测存储",
  });
  const annId = createdAnn.json?.data?.id;
  ok("新建标注 201", createdAnn.status === 201, createdAnn.status);
  const converted = await api("PATCH", `/api/annotations/${annId}`, { action: "to_eval_case" });
  const newCase = converted.json?.data?.evalCase;
  ok("标注 → 用例 200", converted.status === 200, converted.status);
  ok("沉淀用例是 V2 契约且默认停用", Boolean(newCase?.id?.startsWith("ev_")) && newCase?.enabled === false, newCase?.id);
  const evalCasesNow = (await api("GET", "/api/eval")).json?.data?.cases ?? [];
  ok("沉淀用例在 /api/eval 立即可见", evalCasesNow.some((item) => item.id === newCase?.id));
  ok("用例带真实来源 runId", newCase?.sourceRunId === sampleRunId, newCase?.sourceRunId);
} else {
  ok("批次产生了可追溯的 runId", false, "没有拿到任何 caseResult.runId");
}

/* ------------------------------ 密钥不泄露 ------------------------------ */
console.log("\n=== 密钥不泄露 ===");
const modelsHtml = await (await fetch(BASE + "/models")).text();
ok("/models 不含 sk- 明文", !/sk-[A-Za-z0-9_-]{12,}/.test(modelsHtml));
ok("页面显示已隐藏", modelsHtml.includes("已配置（已隐藏）") || modelsHtml.includes("未配置"));
const staticDir = path.join(ROOT, ".next", "static");
let leaked = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.js$/.test(entry.name) && fs.readFileSync(full, "utf8").includes("OPENAI_API_KEY=")) leaked += 1;
  }
};
if (fs.existsSync(staticDir)) walk(staticDir);
ok("客户端 bundle 无密钥赋值", leaked === 0);

/* ---------------------------- classroom reset ---------------------------- */
console.log("\n=== classroom reset 幂等 ===");
const snapshot = () => {
  const files = fs.readdirSync(path.join(ROOT, "data")).filter((name) => name.endsWith(".json")).sort();
  return Object.fromEntries(
    files.map((name) => [name, fs.readFileSync(path.join(ROOT, "data", name), "utf8").length + ":" + fs.readFileSync(path.join(ROOT, "data", name), "utf8").slice(0, 64)]),
  );
};

execFileSync(process.execPath, [path.join(ROOT, "scripts", "classroom-reset.mjs")], { stdio: "pipe" });
const first = snapshot();
execFileSync(process.execPath, [path.join(ROOT, "scripts", "classroom-reset.mjs")], { stdio: "pipe" });
const second = snapshot();
ok("两次重置结果一致", JSON.stringify(first) === JSON.stringify(second));
const products = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));
const orders = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "orders.json"), "utf8"));
ok("商品数据保留", products.length >= 12, `${products.length} 条商品`);
ok("订单数据保留", orders.length >= 10, `${orders.length} 条订单`);
ok("评测集恢复为 fixture 条数", JSON.parse(fs.readFileSync(path.join(ROOT, "data", "eval-cases.json"), "utf8")).length === JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "fixtures", "classroom", "eval-cases.json"), "utf8")).length);

console.log(fail === 0 ? `\nRESULT: PASS（${pass} 项）` : `\nRESULT: FAIL（${fail} 项失败 / ${pass} 项通过）`);
process.exit(fail === 0 ? 0 : 1);
