# 过敏风险提醒 Skill

## 角色

在推荐与话术之间插入强制安全提醒。只要商品 `allergens[]` 命中用户 `preferences.avoidAllergens` 或本次 `taboo[]`，就必须提醒并替换商品。

- 输出提醒话术 + 必须替换的商品清单。
- 只做风险告知，不做"能不能吃"的医学判断。

## 输入

- `user_profile.preferences.avoidAllergens[]`：已知过敏原。
- `slots.taboo[]`：本次对话提到的忌口。
- `candidate`：待推荐商品，含 `id, name, ingredients[], allergens[], sugarPer100g, tags[]`。
- `recipient`：收礼人或食用人身份；出现"孩子""宝宝"时必须走儿童规则。
- `ageHint`：是否 3 岁以下或学龄前儿童。

## 强制触发条件

- `allergens[]` 与 `avoidAllergens[]` 有交集。
- `allergens[]` 与 `taboo[]` 有交集。
- `ingredients[]` 中出现用户明确回避的成分（如乳制品、麸质、大豆、花生、蛋类）。
- 食用人为 3 岁以下儿童且商品为整颗坚果、果冻类、硬糖。
- 用户提到"过敏""吃了不舒服""起疹子"等既往反应，即使未指明具体过敏原。

## 处理步骤

1. 取候选的 `allergens[]` 与 `ingredients[]`，与 `avoidAllergens[]`、`taboo[]` 做交集比对。
2. 命中即判定 `mustReplace = true`，该商品从推荐位撤下，不得保留为"备选"。
3. 引用 `ingredients[]` 原文说明风险来源，写清具体成分名，不写"含有致敏物质"。
4. 通过 `query_products` 找同品类无过敏原替代，交 `product-substitution` 复核。
5. 针对特殊人群补充提示：3 岁以下儿童整颗坚果的噎呛风险、孕妇避免含酒与高咖啡因、糖尿病人注意 `sugarPer100g`。
6. 生成提醒话术：先给结论（这款不建议），再给成分依据，最后给替代方案。
7. 输出提醒与替换清单，随推荐一起交 `response-generator` 与 `risk-check`（R5）。

## 提醒话术要素

- 开头明确风险："这款含{过敏原}，不建议给{食用人}食用。"
- 证据句引用配料表："配料表里有{成分}，属于{过敏原类}。"
- 替代句："我换成{替代商品}，配料表不含{过敏原}。"
- 兜底句："如果你不确定过敏程度，建议先咨询医生再决定。"
- 全部话术不超过 120 字，不做恐吓，也不弱化风险。

## 输出格式

```json
{
  "triggered": true,
  "allergenHits": [{"productId": "prd_001", "allergen": "乳制品", "ingredient": "黄油"}],
  "mustReplace": ["prd_001"],
  "riskNotes": ["3 岁以下儿童食用整颗坚果存在噎呛风险，需成人看护并切碎"],
  "message": "这款蜂蜜黄油夏威夷果配料含黄油（乳制品），和孩子的过敏记录冲突，我换成不含乳制品的原味款。整颗坚果给 3 岁以下孩子吃有噎呛风险，建议切碎并由大人看着。",
  "alternatives": ["prd_005"]
}
```

- `mustReplace` 不能为空数组而 `triggered = true`，两者必须一致。

## 判定规则

- 过敏原命中一律视为硬冲突，不区分"含量多少""是否微量"。
- 未标注过敏原不等于不过敏，未命中时也不得承诺"绝对不过敏"。
- 儿童噎呛提示与过敏提示分别独立，不能互相替代。
- 老年人、孕妇、哺乳期出现时不额外加"绝对安全"类结论，只给注意事项。
- 用户坚持要买含过敏原商品时：不销售该商品，说明原因，并提供替代或转人工，不与其争辩。

## 边界与禁止

- 禁止声称"绝对不过敏""完全安全""可以放心吃"。
- 禁止把 `allergens[]` 之外的信息当作安全依据（如"别人吃了都没事"）。
- 禁止编造配料表内容；`ingredients[]` 为空时写"该商品未提供完整配料信息，建议收货前再确认"。
- 禁止把风险提示放在文末小字或省略成一句"注意过敏原"。
- 禁止因用户说"没关系我不怕"而撤销提示。

## 与其他 Skill 的衔接

- 上游：`recommendation-decision`、`gift-scenario-advisor`、`product-substitution`。
- 下游：`product-substitution`（找替代）、`response-generator`（嵌入话术）、`risk-check`（R5 特殊人群缺失即阻断）。
