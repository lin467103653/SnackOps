/**
 * 课堂重置：把「质量与评测」类数据恢复到已知初始状态。
 *
 * - 只覆盖 scripts/fixtures/classroom/ 下的集合（Skill、版本、评测集、批次、标注、改进、评分、AB、运行记录）；
 * - **不动**商品 / 订单 / 用户 / 活动 / 券 / 政策 / FAQ / 物流 / 工单等业务基础数据；
 * - 每个文件都走「临时文件 → fsync → 原子 rename」，中途失败不会留下半个文件；
 * - 可重复执行：内容来自固定快照，两次结果逐字节一致。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const FIXTURES = path.join(ROOT, "scripts", "fixtures", "classroom");

/** 会被重置的集合（评测只有 eval-cases / eval-batch 两份文件） */
const RESET_FILES = [
  "skills.json",
  "skill-versions.json",
  "eval-cases.json",
  "eval-batch.json",
  "annotations.json",
  "improvements.json",
  "ratings.json",
  "ab-tests.json",
  "agent-runs.json",
];

/** 明确保留的业务数据（仅用于自检输出） */
const PRESERVED = [
  "products.json",
  "activities.json",
  "coupons.json",
  "orders.json",
  "users.json",
  "return-policies.json",
  "logistics.json",
  "faq.json",
  "handoff-rules.json",
  "tickets.json",
  "runs.json",
  "tools.json",
];

function atomicWrite(target, content) {
  const tmp = `${target}.reset-tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
}

function main() {
  if (!fs.existsSync(FIXTURES)) {
    console.error(`缺少课堂快照目录：${FIXTURES}`);
    process.exit(1);
  }

  const before = new Map();
  for (const file of PRESERVED) {
    const target = path.join(DATA_DIR, file);
    if (fs.existsSync(target)) before.set(file, fs.statSync(target).size);
  }

  let restored = 0;
  const missing = [];
  for (const file of RESET_FILES) {
    const source = path.join(FIXTURES, file);
    const target = path.join(DATA_DIR, file);
    if (!fs.existsSync(source)) {
      missing.push(file);
      continue;
    }
    atomicWrite(target, fs.readFileSync(source, "utf8"));
    restored += 1;
  }

  const changed = [];
  for (const [file, size] of before) {
    const target = path.join(DATA_DIR, file);
    if (!fs.existsSync(target) || fs.statSync(target).size !== size) changed.push(file);
  }

  console.log(`已重置 ${restored} 个集合：${RESET_FILES.filter((file) => !missing.includes(file)).join("、")}`);
  if (missing.length > 0) console.log(`跳过（快照缺失）：${missing.join("、")}`);
  console.log(`业务基础数据保留 ${before.size} 个文件${changed.length === 0 ? "，内容未变化" : `，变化：${changed.join("、")}`}`);
  if (changed.length > 0) {
    console.error("警告：业务数据发生了变化，请检查是否误覆盖");
    process.exit(2);
  }
}

main();
