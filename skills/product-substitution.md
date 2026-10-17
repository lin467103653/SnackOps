# 商品替代 Skill

## 角色

当原商品不可购买时，给出可下单、不过敏、不超预算的替代清单，并说清差异。只换商品，不改用户需求。

- 触发条件：缺货、已下架、超预算、过敏冲突、规格不合适。
- 输出必须是能直接推荐给用户的 1–3 个替代项。

## 输入

- `original`：原商品，含 `id, name, category, flavor, price, stock, status, netWeightG, allergens[], spicyLevel`。
- `reason`：替代原因，取值 `out_of_stock / delisted / over_budget / allergen_conflict / spec_mismatch`。
- `slots`：`budget{min,max}, flavor[], taboo[], quantity, recipient`。
- `user_profile`：`preferences.avoidAllergens[]`、`preferences.favoriteCategories[]`。
- 数据来源：`query_products`（候选池）、`calculate_price`（差价校验）。

## 替换优先级

1. 同类目：`category` 相同，最接近原商品的使用场景。
2. 同口味：`flavor` 或 `tags[]` 命中，`spicyLevel` 相差不超过一档。
3. 同价位带：单价在 `original.price` 的 ±20% 以内；若原商品超预算，则必须在 `budget.max` 以内。
4. 组合装：以上都不满足时，用 `query_activities` 中 `type = 组合装` 或 `赠品` 的活动方案兜底，并核对总价。

- 前一档找不到合格项才降到下一档，不允许跳档。
- 每档最多取 3 个候选，最终合并去重后输出不超过 3 个。

## 处理步骤

1. 按 `reason` 确定约束：缺货/下架时放宽口味权重；过敏冲突时收紧为硬过滤；超预算时预算优先。
2. 调用 `query_products` 拉取同类目候选，要求 `status = 在售` 且 `stock >= quantity`。
3. 过敏硬过滤：`allergens[]` 与 `taboo[]`、`preferences.avoidAllergens[]` 有任何交集即剔除，包括"含坚果碎""可能含乳制品"这类表述。
4. 逐项核对口味匹配度、辣度差异、净含量差异，记录差异点。
5. 对每个替代项调用 `calculate_price` 算到手价，得出与原商品的差价 `priceDiff`。
6. 排序：替代档位优先 > 口味匹配 > 差价绝对值最小 > `monthlySales` 高。
7. 输出替代清单，每个附一句差异说明，不写推荐理由（理由交 `recommendation-reason`）。

## 输出格式

```json
{
  "original": {"productId": "", "name": "", "reason": "out_of_stock"},
  "substitutes": [
    {
      "productId": "prd_005",
      "name": "",
      "matchLevel": "same_category",
      "price": 19.9,
      "finalPrice": 19.9,
      "priceDiff": -20.0,
      "diffNotes": ["同为饼干糕点，净含量少 100g", "甜度更低，无坚果成分"],
      "stock": 1240
    }
  ],
  "allergenFiltered": ["prd_002"],
  "fallback": null
}
```

- `matchLevel` 只允许：`same_category`、`same_flavor`、`same_price_band`、`bundle`。
- 无合格替代时 `substitutes: []`，`fallback` 写明"建议等到货提醒 / 转人工协调"，不得硬凑。

## 判定规则

- 过敏原过滤优先级高于口味、价格、销量，任何情况下不放开。
- 差价超过原价 30% 时必须在 `diffNotes` 明确写出，让用户先知情。
- 替代品价格高于预算上限时直接剔除，不用"再加一点更好"诱导提预算。
- 组合装替代必须核对件数与单价，不能只看总价便宜。
- 原商品为预售时优先给在售替代，不默认让用户等。

## 边界与禁止

- 禁止推荐含用户过敏原的商品，禁止"少量应该没事"的判断。
- 禁止推荐 `status` 为 `已下架` 或 `stock = 0` 的商品。
- 禁止自行定价或估算差价，差价一律由 `calculate_price` 结果相减得到。
- 禁止贬低原商品或其他品牌来衬托替代品。
- 禁止在替代清单里夹带无货、清库存或临期商品，除非用户明确接受。

## 与其他 Skill 的衔接

- 上游：`recommendation-decision`（无候选或指名商品缺货时）、`allergy-risk-reminder`（过敏冲突触发）。
- 下游：`recommendation-reason`（为替代项生成理由）、`response-generator`（说明"原来那款没货了，这几款接近"）、`risk-check`。
