# tools/ · Tool 契约清单

每个 Tool 一份 JSON 契约，描述输入输出、风险等级与网关参数。
运行时的启用状态、超时、限流在 `data/tools-config.json`；本目录只描述「契约本身」。

约定：

- `key` 必须与 `data/tools.json`、`data/tools-config.json`、`skills/*.md` 中的引用一致；
- `riskLevel` 为 `中`/`高` 的工具，`sideEffect` 必须为 `true`，且运行配置里应开启 `requireConfirm`；
- `input` / `output` 用简化 JSON Schema 描述，方便后续接入真实网关。

| 文件 | key | 类型 | 风险 |
| --- | --- | --- | --- |
| `order-lookup.json` | `order_lookup` | 查询 | 低 |
| `logistics-query.json` | `logistics_query` | 查询 | 低 |
| `refund-create.json` | `refund_create` | 写操作 | 高 |
| `ticket-handoff.json` | `ticket_handoff` | 写操作 | 中 |
