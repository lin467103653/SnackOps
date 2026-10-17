/**
 * 临时校验：23 个集合的 zod 契约 + 注册表交叉引用。
 * 运行：node --experimental-strip-types scripts/__check.ts
 *
 * 注意：Node 的类型剥离要求显式 .ts 后缀，所以这里直接 import schemas.ts，
 * 文件→schema 的对应关系在下面显式列出（与 src/lib/collections.ts 保持一致）。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import * as s from "../src/lib/schemas.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const SKILLS_DIR = path.join(ROOT, "skills");

const FILES: Array<[string, { safeParse: (value: unknown) => { success: boolean; error?: { issues: { path: (string | number | symbol)[]; message: string }[] } } }]> = [
  ["products.json", s.productSchema.array()],
  ["activities.json", s.activitySchema.array()],
  ["coupons.json", s.couponSchema.array()],
  ["orders.json", s.orderSchema.array()],
  ["users.json", s.userSchema.array()],
  ["return-policies.json", s.returnPolicySchema.array()],
  ["logistics.json", s.logisticsSchema.array()],
  ["faq.json", s.faqSchema.array()],
  ["handoff-rules.json", s.handoffRuleSchema.array()],
  ["tickets.json", s.ticketSchema.array()],
  ["runs.json", s.runSchema.array()],
  ["ratings.json", s.ratingSchema.array()],
  ["annotations.json", s.annotationSchema.array()],
  ["skills.json", s.skillSchema.array()],
  ["skill-versions.json", s.skillVersionSchema.array()],
  ["tools.json", s.toolSchema.array()],
  ["tools-config.json", s.toolConfigSchema.array()],
  ["improvements.json", s.improvementSchema.array()],
  ["eval-cases.json", s.evalCaseSchemaV2.array()],
  ["eval-batch.json", s.evalBatchSchemaV2.array()],
  ["ab-tests.json", s.abTestSchema.array()],
  ["llm-config.json", s.llmConfigSchema],
  ["runtime-fallback.json", s.runtimeFallbackSchema],
];

let failures = 0;
type AnyRecord = Record<string, unknown>;

for (const [file, schema] of FILES) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    console.log(`MISS ${file}`);
    failures += 1;
    continue;
  }
  const raw: unknown = JSON.parse(fs.readFileSync(full, "utf8"));
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    console.log(`PASS ${file}`);
  } else {
    failures += 1;
    console.log(`FAIL ${file}`);
    for (const issue of parsed.error?.issues.slice(0, 4) ?? []) {
      console.log(`     ${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`);
    }
  }
}

const read = (file: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as AnyRecord[];
const skills = read("skills.json");
const skillIds = new Set(skills.map((skill) => String(skill.id)));
const tools = read("tools.json");
const toolIds = new Set(tools.map((tool) => String(tool.id)));
const products = read("products.json");
const productIds = new Set(products.map((product) => String(product.id)));
const orders = read("orders.json");
const orderNos = new Set(orders.map((order) => String(order.orderNo)));
const versions = read("skill-versions.json");
const runs = read("runs.json");
const evalCases = read("eval-cases.json");
const evalBatches = read("eval-batch.json");
const improvements = read("improvements.json");
const users = read("users.json");
const annotations = read("annotations.json");

const problems: string[] = [];
const check = (label: string, values: string[], allowed: Set<string>) => {
  const dangling = [...new Set(values.filter((value) => !allowed.has(value)))];
  if (dangling.length > 0) problems.push(`${label} 悬空引用：${dangling.join(", ")}`);
};

check("skills.requiredTools", skills.flatMap((skill) => (skill.requiredTools as string[]) ?? []), toolIds);
check("skill-versions.skillId", versions.map((version) => String(version.skillId)), skillIds);
check("runs.skillKey", runs.map((run) => String(run.skillKey)), skillIds);
const evalCaseIds = new Set(evalCases.map((item) => String(item.id)));
check(
  "eval-batch.caseIds",
  evalBatches.flatMap((batch) => ((batch.caseIds as string[]) ?? []).map(String)),
  evalCaseIds,
);
check("improvements.skillKey", improvements.map((item) => String(item.skillKey)), skillIds);
check(
  "orders.productIds",
  orders.flatMap((order) => ((order.items as AnyRecord[]) ?? []).map((item) => String(item.productId))),
  productIds,
);
check("users.recentOrderNos", users.flatMap((user) => (user.recentOrderNos as string[]) ?? []), orderNos);
check(
  "annotations.targetId(skill_version)",
  annotations.filter((item) => item.targetType === "skill_version").map((item) => String(item.targetId)),
  new Set(versions.map((version) => String(version.id))),
);
check(
  "annotations.targetId(eval_case)",
  annotations.filter((item) => item.targetType === "eval_case").map((item) => String(item.targetId)),
  evalCaseIds,
);

const hashOf = (content: string) => crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
for (const skill of skills) {
  const filePath = String(skill.filePath);
  const absolute = path.resolve(ROOT, filePath);
  if (!absolute.startsWith(SKILLS_DIR)) {
    problems.push(`skills.filePath 越界：${filePath}`);
    continue;
  }
  if (!fs.existsSync(absolute)) {
    problems.push(`skills.filePath 文件不存在：${filePath}`);
    continue;
  }
  const hash = hashOf(fs.readFileSync(absolute, "utf8"));
  if (hash !== skill.hash) problems.push(`哈希不一致：${String(skill.id)}（json ${String(skill.hash)} / file ${hash}）`);
}

const enabledSkills = skills.filter((skill) => skill.enabled).length;
console.log(`\nskills=${skills.length}（启用 ${enabledSkills}） tools=${tools.length} versions=${versions.length}`);
if (problems.length > 0) {
  console.log("\n交叉引用问题：");
  for (const problem of problems) console.log(`  - ${problem}`);
  failures += problems.length;
}
console.log(failures === 0 ? "\nRESULT: PASS" : `\nRESULT: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
