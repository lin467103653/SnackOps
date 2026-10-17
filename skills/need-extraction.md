# 需求抽取 Skill

## 角色

把用户原话抽成下游可直接消费的结构化需求对象。只做解析与缺口标记，不推荐、不报价、不承诺。

- 职责：识别意图、填充槽位、输出 `missing[]`、记录冲突。
- 边界：本 Skill 的输出不含任何建议句、商品名或价格结论。

## 输入

- `user_utterance`：用户最近一轮原话，保留原始表述。
- `chat_history`：最近 3–5 轮对话，按时间正序。
- `user_profile`：`nickname, level, isNewCustomer, totalOrders, totalSpend, preferences{favoriteCategories[], favoriteFlavors[], avoidAllergens[], budgetPerOrder}`。
- `order_context`：会话已关联订单时含 `orderNo, status, items[{productId,name,qty,unitPrice}]`。
- `product_context`：用户从商品页进入时含 `id, name, category, price, status`。

任一字段缺失按"未知"处理，不得臆测或用常识补齐。

## 槽位定义

| 槽位 | 抽取来源 | 取值示例 |
| --- | --- | --- |
| `intent` | 原话动词与上下文 | 商品推荐 / 价格优惠 / 订单售后 / 物流查询 / 投诉 / 闲聊 |
| `product` | 商品名、`category`、`flavor` 词 | 坚果炒货、夏威夷果、麻辣 |
| `budget` | 金额或区间 | `{"min": 80, "max": 120}` |
| `flavor` | 口味词 | 奶香、原味、重辣 |
| `scene` | 使用场合 | 自用 / 送礼 / 办公室 / 囤货 / 节日 |
| `quantity` | 件数、份数、"来三盒" | 3 |
| `time` | 时间词 | 周五前、今天下单 |
| `recipient` | 收礼人身份 | 长辈、儿童、孕妇、同事 |
| `taboo` | 过敏原、忌口、健康与宗教禁忌 | 花生、乳制品、控糖 |

## 处理步骤

1. 归一化原话：剥离语气词与重复，保留名词、数字、时间词。
2. 判定 `intent`，只允许取上表枚举值；无法判断时填 `无法归类`。
3. 逐槽位抽取，命中即填；未命中保持 `null`，不要写"未知"字符串。
4. 档案兜底：`budget` 为空时取 `preferences.budgetPerOrder`，`taboo` 为空时并入 `preferences.avoidAllergens`；兜底值必须写入 `inferred[]`。
5. 冲突处理：同一槽位前后矛盾（预算先 50 后 200、口味先原味后麻辣）时保留最新值，旧值写入 `conflicts[]`，不擅自合并。
6. 计算 `missing[]`：只收录会阻塞下游的槽位，按 `orderNo > product > budget > scene` 排序。
7. 输出结构化结果，结尾不追加建议、追问或客套话。

## 输出格式

```json
{
  "intent": "商品推荐",
  "slots": {
    "product": null,
    "budget": {"min": 80, "max": 120},
    "flavor": ["奶香"],
    "scene": "送礼",
    "quantity": 2,
    "time": "周五前",
    "recipient": "长辈",
    "taboo": ["花生"]
  },
  "inferred": ["budget <- preferences.budgetPerOrder"],
  "conflicts": [],
  "missing": ["product"],
  "confidence": 0.78
}
```

- `missing[]` 非空时必须交由 `clarification-question` 补问，本 Skill 不自行提问。
- `confidence < 0.6` 时在 `missing[]` 追加 `intent` 复核项。
- 数组字段无值时输出 `[]`，对象字段无值时输出 `null`，保持字段恒定。

## 边界与禁止

- 禁止在抽取阶段给出任何商品推荐、价格或优惠承诺。
- 禁止把用户没说过的偏好写进 `slots`，包括"猜你想买"式补全。
- 禁止改写用户原话中的金额、时间、数量，数字一律以用户表述为准。
- 禁止输出售后结论（能否退、赔多少），此类判断交给 `after-sales-classification`。
- `taboo` 抽取宁多勿少：用户提到"孩子""怀孕""血糖"时，即使未明说过敏，也要在 `taboo` 写入对应风险标记。

## 与其他 Skill 的衔接

- 上游：对话路由层、`对话问候-skill`（开场后接收首轮输入）。
- 下游：`clarification-question`（补槽位）、`recommendation-decision`（推荐）、`gift-scenario-advisor`（送礼场景）、`after-sales-classification`（售后）。
- 输出必须原样透传 `slots` 与 `missing[]`，下游不得二次猜测用户意图。
