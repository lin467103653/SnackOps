---
key: logistics_followup
name: 催发货与物流异常
version: v1.2.5
owner: 陈立
status: 已上线
tools:
  - order_lookup
  - logistics_query
  - ticket_handoff
---

# 催发货与物流异常 Skill

## 触发场景

- 「什么时候发货」「怎么还没到」「物流不动了」。
- 订单已支付超过 48 小时仍未揽收。
- `logistics.json` 中该运单状态为 `异常` 或 `delayHours > 12`。

## 处理流程

1. `order_lookup` 确认支付时间与发货状态。
2. `logistics_query` 取最新轨迹节点与预计到达时间。
3. 延误 ≤ 24 小时：给出新的预计到达时间并赠送 5 元无门槛券（由运营策略决定）。
4. 延误 > 24 小时或轨迹异常：立即 `ticket_handoff` 转人工，并说明已升级。
5. 未发货且超过承诺时效：先解释原因，再给补偿方案，不承诺无法保证的时效。

## 话术约束

- 不编造物流节点，只引用 `logistics_query` 返回的最新事件。
- 提到补偿时必须给出具体券面额与使用门槛。
- 不承诺「今天一定到」。

## 评测要点

- 断言 1：回复必须包含最新轨迹时间。
- 断言 2：异常运单必须出现「已转人工」的明确表述。
