# skills/ · Skill 提示词源文件

## 两种文件，两种用途

| 位置 | 用途 | 是否被运行时读取 |
| --- | --- | --- |
| `skills/<id>.md` | **提示词源码**：纯正文，无 frontmatter，`<id>` 与 `data/skills.json` 的 `id` 一一对应 | 初始化时被 `scripts/seed-registry.mjs` 读取并写入注册表；之后保存正文会同步覆写 |
| `skills/scenarios/`（暂无） | — | — |
| 本目录下的 `refund-policy.md` 等 4 个旧文件 | **v1 骨架期的业务场景说明**，保留了当时的四段式结构（触发场景 / 处理流程 / 话术约束 / 评测要点） | 否。仅作历史参考，与注册表无绑定 |

> 重要：`data/skills.json` 是**主存储**，`skills/<id>.md` 是它的可读镜像。页面上的「保存版本」会先把旧正文自动快照，再写注册表，最后同步镜像文件；如果手工改了 `.md` 而没有走页面，注册表不会自动跟随（页面会显示「文件与注册表不一致」，可一键重新导出覆盖）。

## 注册表里的 14 个 Skill（按流水线顺序）

| id | 名称 | 阶段 | 依赖工具 |
| --- | --- | --- | --- |
| `need-extraction` | 需求抽取 | 输入理解 | — |
| `clarification-question` | 澄清提问 | 输入理解 | — |
| `recommendation-decision` | 推荐决策 | 决策 | query_products, query_activities |
| `product-substitution` | 商品替代 | 决策 | query_products, calculate_price |
| `recommendation-reason` | 推荐理由 | 生成 | query_products, query_coupons |
| `response-generator` | 话术生成 | 生成 | — |
| `risk-check` | 风险审查 | 守卫 | — |
| `allergy-risk-reminder` | 过敏风险提醒 | 守卫 | query_products |
| `after-sales-classification` | 售后分类 | 决策 | query_orders |
| `complaint-triage` | 投诉分级 | 守卫 | query_orders, query_logistics |
| `human-handoff-decision` | 转人工判定 | 守卫 | query_orders |
| `gift-scenario-advisor` | 送礼场景顾问（默认停用） | 决策 | query_products, query_activities, calculate_price |
| `conversation-summary` | 会话摘要 | 收口 | — |
| `对话问候-skill` | 对话问候 | 输入理解 | — |

## 正文约定

- 只写**给模型看的系统提示词**，不要写 YAML frontmatter（元数据在 `data/skills.json`）；
- 固定包含：`## 角色` / `## 输入` / `## 处理步骤` / `## 输出格式` / `## 与其他 Skill 的衔接`，再加 `## 判定规则` 或 `## 边界与禁止`；
- 只允许引用这 6 个工具：`query_products`、`query_activities`、`query_coupons`、`calculate_price`、`query_orders`、`query_logistics`；
- 引用其他 Skill 时使用上表的 `id`（连字符风格），不要用旧的下划线写法；
- 改完正文后，页面会保存版本并记录 `changeNote` 与 `hash`，`/skills/<id>` 可查看 diff。

## risk-check 的可审计规则

`risk-check.md` 里的 `## 可审计规则` 一节固定列 R1–R8，每条都写清「检查什么 / 命中后怎么处理 / 是阻断还是仅提示」：

R1 价格一致性 · R2 禁止极限词与夸大功效 · R3 不做超出售后政策的承诺 · R4 新客优惠判断 ·
R5 特殊人群安全提示 · R6 投诉与售后不能推诿 · R7 疑似中奖或返现诈骗 · R8 放行判定

判定原则写死在正文里：**安全回复可以发送，只有危险回复才阻断。**

## 旧 4 个文件的 key 映射（仅历史参考）

| 旧文件 | 旧 key | 现在由谁负责 |
| --- | --- | --- |
| `refund-policy.md` | `refund_policy` | `after-sales-classification` |
| `logistics-followup.md` | `logistics_followup` | `human-handoff-decision` |
| `coupon-consult.md` | `coupon_consult` | `recommendation-reason` |
| `risk-guard.md` | `risk_guard` | `complaint-triage` |
