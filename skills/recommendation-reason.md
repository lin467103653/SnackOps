# 推荐理由生成 Skill

## 角色

把候选商品转成 2–3 条可验证的理由。每条理由都必须能指回一个真实字段值，读起来像人话，但经得起用户核对。

- 只解释"为什么是它"，不新增商品、不改价格、不做承诺。
- 每条理由 = 参数事实 + 对用户的含义，缺一半就不要写。

## 输入

- `candidate`：来自 `recommendation-decision` 的单个候选，含 `productId, name, flavor, price, finalPrice, stock, activity, matchPoints`。
- `slots`：`budget, flavor[], scene, recipient, taboo[]`。
- `product_detail`：`query_products` 返回的完整字段，含 `netWeightG, shelfLifeDays, sugarPer100g, caloriesPer100g, proteinPer100g, spicyLevel, suitableFor[], ingredients[], allergens[]`。
- `price_breakdown`：`calculate_price` 返回的 `originalPrice, finalPrice, savedAmount, appliedActivities[], couponCode`。

## 处理步骤

1. 取 3 个最具区分度的维度：口味匹配、价格与预算关系、场景/人群适配；不足 3 条时只写 2 条，不凑数。
2. 口味维度：引用 `flavor`、`spicyLevel` 或 `tags[]` 的实际值，与 `slots.flavor` 或 `preferences.favoriteFlavors` 对照。
3. 价格维度：用 `calculate_price` 的 `finalPrice`、`savedAmount`、活动 `threshold`；有满减时写明差额（如"再差 20 元到 199 门槛"）。
4. 场景维度：用 `suitableFor[]`、`netWeightG`、`shelfLifeDays` 支撑，如"500g 独立小包装，适合办公室分食"。
5. 每条理由控制在 30–45 字，句式统一为"事实 + 所以适合你"，避免形容词堆叠。
6. 自检：逐条回查字段——凡是文中出现的数字，必须能在输入里找到同名或同值字段，找不到就删掉该条。
7. 输出理由数组，并标注每条引用的字段名，供审计追溯。

## 输出格式

```json
{
  "productId": "prd_001",
  "reasons": [
    {"text": "奶香口味与你要的偏好一致，酥脆口感不齁甜", "evidence": ["flavor", "tags"]},
    {"text": "到手价 39.9 元，比你 80-120 的预算还留了余量", "evidence": ["finalPrice", "slots.budget"]},
    {"text": "500g 罐装、保质期 180 天，囤着慢慢吃也不怕坏", "evidence": ["netWeightG", "shelfLifeDays"]}
  ],
  "reasonCount": 3
}
```

- `evidence` 必须是真实字段名，最多 3 个，便于抽查。
- 无足够事实支撑时输出 2 条并置 `reasonCount: 2`，不得编造第三条。

## 判定规则

- 每条理由必须含至少 1 个具体参数（价格、克重、保质期、糖分、辣度、活动门槛差额之一）。
- 同一商品的两条理由不得重复同一字段，避免"换个说法说同一件事"。
- 涉及活动的理由必须带条件（"满 199 减 30，当前还差 20 元"），不能只说"有优惠"。
- 糖分、热量只在用户提到控糖、健身、儿童时引用，且必须给 `sugarPer100g` 原始数值，不做"低糖""健康"定性。

## 边界与禁止

- 禁止空话：好吃、超值、爆款、闭眼入、人手一袋、回购率超高。
- 禁止极限词与绝对化表述：最、第一、顶级、100%、零添加、无任何、绝对安全。
- 禁止功效宣称：减肥、降血糖、补充营养、增强免疫、治疗、养生。
- 禁止编造未返回的参数：不得写"含 12 种坚果""进口原料""手工现做"，除非字段里确实有。
- 禁止替用户做决定："你就买这个吧""不用挑了"。
- 禁止承诺库存与到货时间，库存只写当前 `stock` 事实值。

## 与其他 Skill 的衔接

- 上游：`recommendation-decision`。
- 下游：`response-generator`（把理由嵌进话术）、`risk-check`（R2 极限词复核）。
- 若候选含用户过敏原或特殊人群风险，先由 `allergy-risk-reminder` 插入提醒段，再拼理由。
