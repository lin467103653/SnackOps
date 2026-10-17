# 第一段评测存储（已归档）

这里是 SnackOps 第一段（业务骨架）使用的评测数据原件，**不再被运行时读取**，
仅用于审计与回滚。第二段起的评测子系统只有一份存储：

| 用途 | 文件 | 契约 |
| --- | --- | --- |
| 评测用例 | `data/eval-cases.json` | `src/lib/schemas.ts` → `evalCaseSchemaV2` |
| 评测批次 | `data/eval-batch.json` | `src/lib/schemas.ts` → `evalBatchSchemaV2` |

## 为什么合并

合并前存在两套并行的评测存储（`eval_cases.json` / `eval_batches.json` 与
`eval-cases.json` / `eval-batch.json`），导致：

1. 「标注 → 沉淀为评测用例」写进旧库，`/eval` 页面读新库，沉淀结果在评测页面上根本看不到；
2. `/overview` 与 `/evals` 展示的是旧库里的**模拟批次**（按用例 id 稳定散列编出来的通过率），
   它们没有任何真实 Agent 执行记录，等于把编造的数字摆在运营台上；
3. `classroom:reset` 只恢复旧的 `eval_batches.json` 快照，`eval_cases.json` 会随每次操作漂移。

## 迁移规则

- 20 条旧用例（`ec_001`–`ec_020`）用 `scripts/lib/eval-legacy.mjs` 转成 V2 契约后并入 `eval-cases.json`：
  id 原样保留（标注里对用例的引用不断），问题 → `question`，期望输出 + 旧断言全文 → `expectedBehavior`，
  标签追加「旧版断言 / 迁移自 v1」。
- 迁移后一律 `enabled: false`：旧断言是自然语言（「必须引用退货政策 v3.1」），评分器无法机器判定；
  直接启用会让 0 断言的用例被判成 PASS。运营补出关键词/禁词/价格后再启用。
- 8 条旧批次（`eb_001`–`eb_008`）**不迁移**：它们是模拟执行的产物，没有任何 RunRecord 可回查。
  真实批次必须由 `/api/eval/batch/run` 逐条调用 Agent 产生。

## 回滚

```powershell
Copy-Item scripts/archive/legacy-eval-v1/eval_cases.json   data/eval_cases.json
Copy-Item scripts/archive/legacy-eval-v1/eval_batches.json data/eval_batches.json
```

回滚只还原文件；`src/lib/collections.ts` 里已删除对应集合注册，页面不会再读它们。
