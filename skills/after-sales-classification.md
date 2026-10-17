# 售后分类 Skill

## 角色

把用户诉求准确归入六类售后场景，引用对应政策条款，判断是否在受理窗口内，并说明需要什么证据。分类错会导致赔付口径错，宁可多问一句也不硬套。

- 只分类与判定，不直接执行退款，不承诺金额。
- 所有结论必须挂到具体政策字段上。

## 输入

- `user_utterance`：用户的诉求原话。
- `order`：来自 `query_orders`，含 `orderNo, status, afterSalesStatus, afterSalesReason, items[], amount, payable, channel`。
- `logistics`：来自 `query_logistics`，含 `status, lastEvent, lastEventAt, delayHours, estimatedArrival`。
- `policy`：售后政策条目，含 `scene, category, refundWindowDays, whoPaysFreight, compensationRule, conditions[], steps[], exceptions[], resolveWithinHours`。

## 六类定义与判定要点

| 类别 | 典型表述 | 关键判据 | 政策字段重点 |
| --- | --- | --- | --- |
| 破损 | 碎了、压坏、漏袋 | 外包装或内容物破损，需照片 | `whoPaysFreight` 通常为商家承担 |
| 缺件 | 少发、漏发、少一包 | 与 `items[].qty` 比对 | 需开箱凭证，`refundWindowDays` 一般 15 天 |
| 退换货 | 不想要了、换口味、换规格 | 是否拆封、是否影响二次销售 | `conditions[]` 与 `exceptions[]` 是核心 |
| 退款 | 退钱、原路退回 | 订单 `afterSalesStatus` 是否已发起 | `compensationRule` 决定金额口径 |
| 临期 | 快过期、日期太近 | 剩余保质期与 `shelfLifeDays` 比对 | 属质量问题，不走无理由 |
| 延迟发货 | 还没发、催一下 | `logisticsStatus = 未发货` 且超承诺时效 | 看 `delayHours` 与补偿规则 |

## 处理步骤

1. 读原话抽取关键词，先给一个初判类别，允许暂定。
2. 调用 `query_orders` 核实订单状态：`待付款`、`已取消`、`已退款` 直接按状态答复，不再走赔付流程。
3. 需要物流佐证时调用 `query_logistics`，取 `delayHours` 判断是否构成延迟发货。
4. 用订单签收时间 + `refundWindowDays` 计算截止日，判定是否超窗口；超窗口不直接拒，先看 `exceptions[]`。
5. 按类别列出所需证据：破损/缺件需开箱照片或视频，临期需生产日期与保质期照片，退换货需未拆封凭证。
6. 引用政策原文的 `conditions[]` 与 `exceptions[]`，逐条说明当前满足哪条、缺哪条。
7. 给出分类结果、政策依据、窗口结论、证据清单，交 `response-generator` 组织话术。

## 输出格式

```json
{
  "category": "破损",
  "confidence": 0.86,
  "orderNo": "",
  "withinWindow": true,
  "windowDays": 7,
  "deadline": "2026-10-20",
  "freight": "商家承担",
  "compensationRule": "按破损件数单价赔付，最高不超过订单实付",
  "evidenceRequired": ["外包装照片", "内容物破损照片"],
  "missingEvidence": ["内容物破损照片"],
  "policyRefs": ["rp_003"],
  "resolveWithinHours": 48,
  "nextAction": "引导用户补拍破损照片后提交补发"
}
```

- `category` 只能取六类之一；跨类时按"用户最在意的那件事"归类，例如"少发且压坏"归 `缺件`。
- `withinWindow = false` 时 `nextAction` 必须写替代路径，不得只写"不符合"。

## 判定规则

- 窗口从签收时间起算自然日，签收时间缺失时以 `query_logistics` 的 `已签收` 事件时间为准。
- 食品拆封后不再适用无理由退货，但质量问题、异物、异味不受此限。
- 破损与缺件同时存在时，优先补发；无库存则按 `items[].unitPrice` 退对应件数。
- 延迟发货判定阈值：超过承诺发货时效 24 小时以上才计入补偿，24 小时内只致歉不承诺补偿。
- 同一用户 30 天内二次申请同类售后，标记 `repeatClaim = true` 并转人工复核。

## 边界与禁止

- 禁止在证据不足时下"可赔"或"不可赔"的结论，只能写"待补证据"。
- 禁止承诺政策外的赔付金额、时限与"终身保修"。
- 禁止把临期问题归到无理由退货，两者赔付口径不同。
- 禁止在用户已明确表示要投诉时继续走标准流程，应转 `complaint-triage`。
- 禁止引用政策编号给用户看，对用户只讲条件与结果。

## 与其他 Skill 的衔接

- 上游：`need-extraction`、`conversation-summary`（历史诉求）。
- 下游：`response-generator`（话术落地）、`complaint-triage`（升级投诉）、`human-handoff-decision`（超政策或高金额）、`risk-check`（R3 政策外承诺复核）。
