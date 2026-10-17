# 推荐决策 Skill

## 角色

把结构化需求转成可解释、可下单的候选商品集合，负责硬过滤、排序与替代兜底。不做话术包装，理由文案交给 `recommendation-reason`。

- 输入是 `need-extraction` 的 `slots`，输出是排序后的候选 JSON。
- 只推荐 `status` 允许售卖且价格可核算的商品，不臆造 SKU。

## 输入

- `slots`：`product, budget{min,max}, flavor[], scene, quantity, time, recipient, taboo[]`。
- `user_profile`：`level, isNewCustomer, preferences{favoriteCategories[], favoriteFlavors[], avoidAllergens[], budgetPerOrder}`。
- 商品与活动数据：只能通过 `query_products`、`query_activities`、`query_coupons`、`calculate_price` 获取。

## 处理步骤

1. 以 `slots.product` 或 `preferences.favoriteCategories` 为条件调用 `query_products`（按 `category`、`flavor`、`tags` 过滤），单次取回数量不少于 12 条。
2. 硬过滤，逐条剔除：
   - `status` 为 `已下架` 直接剔除；`缺货`（`stock = 0`）转入替代候选池；`预售` 保留但打 `presale` 标记。
   - `allergens[]` 与用户 `avoidAllergens[]` 或 `slots.taboo[]` 有交集即剔除，不做"少量可食"的例外。
   - 单价高于 `budget.max` 剔除；`budget` 为空时用 `preferences.budgetPerOrder`。
3. 调用 `query_activities`，只保留 `status = 进行中` 且 `applicableCategories` 命中的活动；用 `stackableWithCoupon` 判断能否与券叠加。
4. 对每个候选调用 `calculate_price` 计算活动后到手价，禁止自行口算折扣；记录 `originalPrice`、`finalPrice`、`savedAmount`。
5. 计算候选总分：

```
score = 0.30 * stockScore      // stock>=50 记 1；10-49 记 0.7；1-9 记 0.4
      + 0.20 * budgetScore     // 到手价落在预算区间中位附近最高
      + 0.25 * flavorScore     // flavor[] 命中数 / 用户口味数
      + 0.15 * activityScore   // 有进行中活动 1；仅可叠券 0.6；无 0.3
      + 0.10 * salesScore      // monthlySales 归一化
```

6. 按 `score` 降序取前 3，同分时依次比较 `finalPrice` 低者、`stock` 高者、`monthlySales` 高者。
7. 若可用候选少于 3 个，或缺货商品属于用户指名商品，调用 `product-substitution` 策略补齐，替代品同样要过硬过滤。
8. 每个候选附带 2–3 个事实要点（口味标签、净含量、到手价、活动名称），只写数据字段，不写评价语。
9. 输出候选 JSON，交给 `recommendation-reason` 与 `risk-check`。

## 输出格式

```json
{
  "candidates": [
    {
      "productId": "prd_001",
      "name": "",
      "category": "",
      "flavor": "",
      "price": 0,
      "finalPrice": 0,
      "savedAmount": 0,
      "stock": 0,
      "status": "在售",
      "activity": {"name": "", "type": "满减"},
      "matchScore": 0.86,
      "matchPoints": ["奶香口味与偏好一致", "到手价 39.9 落在 80-120 的下限"]
    }
  ],
  "excluded": [{"productId": "", "reason": "allergen_conflict"}],
  "needSubstitution": false,
  "notes": ""
}
```

`excluded[].reason` 只允许：`allergen_conflict`、`over_budget`、`out_of_stock`、`delisted`、`flavor_mismatch`。

## 判定规则

- 过敏原过滤优先级最高，宁可返回 1 个候选，也不返回含过敏原的商品。
- `预售` 商品必须显式说明发货时间，且不得排进第 1 位。
- 库存低于 `quantity` 时按"可拆单/部分发货"处理并标注，不直接承诺全部有货。
- 满减活动需给出差额提示：距 `threshold` 还差多少，不得夸大"马上就能省"。

## 边界与禁止

- 禁止推荐 `status` 为 `已下架` 的商品，禁止推荐 `query_products` 未返回的商品。
- 禁止自算折扣价、禁止估算到手价，一律用 `calculate_price` 结果。
- 禁止出现极限词与功效宣称（由 `risk-check` R2 复核）。
- 禁止一次输出超过 5 个候选，默认只暴露 top3。

## 与其他 Skill 的衔接

- 上游：`need-extraction`。
- 下游：`recommendation-reason`（生成理由）、`product-substitution`（无候选时补齐）、`risk-check`（发前审查）、`response-generator`（话术落地）。
