#!/usr/bin/env node
/**
 * SnackOps Skill/Tool 注册系统的数据构建脚本（第二段）。
 *
 *   node scripts/seed-registry.mjs
 *
 * 做三件事：
 * 1. 补全业务演示数据：商品（配料/营养/过敏原/适用人群）、活动（门槛/规则/适用类目）、
 *    优惠券（适用商品/叠加/限领）、订单（物流状态/售后状态）、用户（新客/偏好/禁忌）、
 *    售后政策（破损/缺件/退换货/退款口径），并新增 handoff-rules.json（转人工规则）。
 * 2. 以 skills/<id>.md 为提示词源码，生成 skills.json 注册表（模型参数、依赖工具、版本、哈希）。
 * 3. 生成 tools.json / tools-config.json / skill-versions.json，并把历史数据里旧的
 *    skillKey 统一映射到新的流水线 Skill id。
 *
 * 特性：零依赖、可重复执行（幂等）。基础 22 个文件由 scripts/seed.mjs 生成，
 * 本脚本在其之上叠加第二段需要的字段，不删除任何既有业务记录。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = process.env.SNACKOPS_DATA_DIR
  ? path.resolve(process.cwd(), process.env.SNACKOPS_DATA_DIR)
  : path.join(ROOT, "data");
const SKILLS_DIR = path.join(ROOT, "skills");

const hashOf = (content) => crypto.createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const iso = (date) => new Date(date).toISOString();
const daysAgo = (days, hourOffset = 0) => iso(Date.now() - days * 86_400_000 + hourOffset * 3_600_000);
const round2 = (value) => Math.round(value * 100) / 100;

if (!fs.existsSync(path.join(DATA_DIR, "products.json"))) {
  console.error("[seed-registry] data/products.json 不存在，请先运行：node scripts/seed.mjs");
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* 1. 商品：配料、营养、适用人群                                                */
/* -------------------------------------------------------------------------- */

const PRODUCT_DETAILS = {
  prd_001: {
    flavor: "奶香",
    tags: ["招牌", "奶香", "送礼"],
    netWeightG: 208,
    spicyLevel: "不辣",
    ingredients: ["夏威夷果", "蜂蜜", "黄油", "白砂糖", "食用盐"],
    nutrition: { sugarPer100g: 18.5, caloriesPer100g: 640, proteinPer100g: 8.2, fatPer100g: 52 },
    suitableFor: ["整颗坚果，3 岁以下需成人压碎后喂食"],
  },
  prd_002: {
    flavor: "原味",
    tags: ["原味", "高蛋白", "囤货"],
    netWeightG: 250,
    spicyLevel: "不辣",
    ingredients: ["巴旦木", "食用盐"],
    nutrition: { sugarPer100g: 4.2, caloriesPer100g: 590, proteinPer100g: 21, fatPer100g: 48 },
    suitableFor: ["整颗坚果，3 岁以下需成人压碎后喂食"],
  },
  prd_003: {
    flavor: "五香",
    tags: ["高蛋白", "下酒", "卤味"],
    netWeightG: 150,
    spicyLevel: "微辣",
    ingredients: ["牛后腿肉", "生抽", "白砂糖", "香辛料", "食用盐"],
    nutrition: { sugarPer100g: 12, caloriesPer100g: 380, proteinPer100g: 42, fatPer100g: 12 },
    suitableFor: ["含大豆制品，大豆过敏者禁食"],
  },
  prd_004: {
    flavor: "麻辣",
    tags: ["重口", "夜宵", "高蛋白"],
    netWeightG: 160,
    spicyLevel: "重辣",
    ingredients: ["鸡胸肉", "辣椒", "花椒", "白砂糖", "食用盐", "小麦淀粉"],
    nutrition: { sugarPer100g: 15, caloriesPer100g: 410, proteinPer100g: 36, fatPer100g: 14 },
    suitableFor: ["重辣，儿童与肠胃敏感人群慎食"],
  },
  prd_005: {
    flavor: "海盐",
    tags: ["下午茶", "黄油", "分享装"],
    netWeightG: 180,
    spicyLevel: "不辣",
    ingredients: ["小麦粉", "黄油", "白砂糖", "海盐"],
    nutrition: { sugarPer100g: 22, caloriesPer100g: 510, proteinPer100g: 6, fatPer100g: 28 },
    suitableFor: ["含麸质与乳制品，相关过敏人群禁食"],
  },
  prd_006: {
    flavor: "酸甜",
    tags: ["粗粮", "下午茶", "果干"],
    netWeightG: 200,
    spicyLevel: "不辣",
    ingredients: ["燕麦片", "小麦粉", "蔓越莓干", "黄油", "白砂糖", "可可粉"],
    nutrition: { sugarPer100g: 26, caloriesPer100g: 470, proteinPer100g: 6.5, fatPer100g: 20 },
    suitableFor: ["含麸质与乳制品，相关过敏人群禁食"],
  },
  prd_007: {
    flavor: "酸甜",
    tags: ["无添加蔗糖?", "冻干", "轻负担"],
    netWeightG: 60,
    spicyLevel: "不辣",
    ingredients: ["草莓", "白砂糖"],
    nutrition: { sugarPer100g: 58, caloriesPer100g: 350, proteinPer100g: 3, fatPer100g: 2 },
    suitableFor: ["糖分较高，控糖人群注意单次摄入量"],
  },
  prd_008: {
    flavor: "浓甜",
    tags: ["果干", "办公室零食"],
    netWeightG: 100,
    spicyLevel: "不辣",
    ingredients: ["芒果", "白砂糖", "柠檬酸"],
    nutrition: { sugarPer100g: 62, caloriesPer100g: 340, proteinPer100g: 2, fatPer100g: 1.5 },
    suitableFor: ["糖分较高，糖尿病患者不建议食用"],
  },
  prd_009: {
    flavor: "桃香",
    tags: ["软糖", "联名", "学生党"],
    netWeightG: 80,
    spicyLevel: "不辣",
    ingredients: ["麦芽糖浆", "白砂糖", "明胶", "浓缩桃汁", "乌龙茶粉"],
    nutrition: { sugarPer100g: 68, caloriesPer100g: 330, proteinPer100g: 4, fatPer100g: 0.5 },
    suitableFor: ["3 岁以下幼儿不宜食用，软糖存在噎呛风险"],
  },
  prd_010: {
    flavor: "苦甜",
    tags: ["黑巧", "小包装", "控糖"],
    netWeightG: 30,
    spicyLevel: "不辣",
    ingredients: ["可可液块", "白砂糖", "可可脂", "大豆磷脂"],
    nutrition: { sugarPer100g: 28, caloriesPer100g: 560, proteinPer100g: 8, fatPer100g: 38 },
    suitableFor: ["含可可碱，儿童少量食用；孕妇每日不超过 1 条"],
  },
  prd_011: {
    flavor: "坚果香",
    tags: ["代餐", "高纤", "健身"],
    netWeightG: 500,
    spicyLevel: "不辣",
    ingredients: ["燕麦粉", "乳清蛋白", "巴旦木碎", "白砂糖", "食用盐"],
    nutrition: { sugarPer100g: 20, caloriesPer100g: 420, proteinPer100g: 18, fatPer100g: 14 },
    suitableFor: ["含坚果与乳制品，冲泡后 2 小时内饮用"],
  },
  prd_012: {
    flavor: "枣香",
    tags: ["礼盒", "送礼", "探病"],
    netWeightG: 600,
    spicyLevel: "不辣",
    ingredients: ["桂圆干", "红枣干", "枸杞", "黑米", "燕麦片"],
    nutrition: { sugarPer100g: 32, caloriesPer100g: 360, proteinPer100g: 7, fatPer100g: 3 },
    suitableFor: ["孕妇可适量食用，糖分偏高，血糖异常者遵医嘱"],
  },
};

function enrichProducts() {
  const products = readJson("products.json");
  return products.map((product) => {
    const detail = PRODUCT_DETAILS[product.id];
    if (!detail) throw new Error(`缺少商品 ${product.id} 的补充信息`);
    return {
      ...product,
      flavor: detail.flavor,
      tags: detail.tags,
      netWeightG: detail.netWeightG,
      spicyLevel: detail.spicyLevel,
      ingredients: detail.ingredients,
      sugarPer100g: detail.nutrition.sugarPer100g,
      caloriesPer100g: detail.nutrition.caloriesPer100g,
      proteinPer100g: detail.nutrition.proteinPer100g,
      fatPer100g: detail.nutrition.fatPer100g,
      suitableFor: detail.suitableFor,
      updatedAt: product.updatedAt,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 2. 活动：门槛、优惠规则、适用类目                                            */
/* -------------------------------------------------------------------------- */

const ACTIVITY_RULES = {
  act_001: { threshold: 299, rule: { type: "满减", value: 50, description: "满 299 减 50，可叠加会员券" }, categories: [], stackable: false },
  act_002: { threshold: 0, rule: { type: "秒杀价", value: 29.9, description: "巴旦木直播价 29.9 元/件，限 2 件" }, categories: ["坚果炒货"], stackable: false },
  act_003: { threshold: 39, rule: { type: "满减", value: 15, description: "新客首单满 39 减 15" }, categories: [], stackable: true },
  act_004: { threshold: 0, rule: { type: "折扣", value: 0.5, description: "肉干卤味第二件半价" }, categories: ["肉干卤味"], stackable: false },
  act_005: { threshold: 0, rule: { type: "折扣", value: 0.88, description: "8 件组合装整单 88 折" }, categories: ["坚果炒货", "果干蜜饯", "饼干糕点"], stackable: false },
  act_006: { threshold: 159, rule: { type: "赠品", value: 0, description: "满 159 赠中秋贺卡与手提袋" }, categories: ["冲饮谷物", "坚果炒货"], stackable: true },
  act_007: { threshold: 159, rule: { type: "满减", value: 25, description: "会员日满 159 减 25" }, categories: [], stackable: true },
  act_008: { threshold: 0, rule: { type: "秒杀价", value: 19.9, description: "冻干草莓脆限量秒杀 19.9 元/件" }, categories: ["果干蜜饯"], stackable: false },
};

function enrichActivities() {
  const activities = readJson("activities.json");
  return activities.map((activity) => {
    const detail = ACTIVITY_RULES[activity.id];
    if (!detail) throw new Error(`缺少活动 ${activity.id} 的规则信息`);
    return {
      ...activity,
      threshold: detail.threshold,
      rule: detail.rule,
      applicableCategories: detail.categories,
      stackableWithCoupon: detail.stackable,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 3. 优惠券：适用商品、排除商品、每人限领                                      */
/* -------------------------------------------------------------------------- */

const COUPON_DETAILS = {
  cp_001: { applicableProductIds: [], applicableCategories: [], excludeProductIds: [], perUserLimit: 2 },
  cp_002: { applicableProductIds: [], applicableCategories: [], excludeProductIds: [], perUserLimit: 1 },
  cp_003: { applicableProductIds: [], applicableCategories: [], excludeProductIds: [], perUserLimit: 1 },
  cp_004: { applicableProductIds: [], applicableCategories: ["坚果炒货"], excludeProductIds: [], perUserLimit: 2 },
  cp_005: { applicableProductIds: [], applicableCategories: [], excludeProductIds: [], perUserLimit: 5 },
  cp_006: { applicableProductIds: [], applicableCategories: [], excludeProductIds: [], perUserLimit: 1 },
  cp_007: {
    applicableProductIds: [],
    applicableCategories: [],
    excludeProductIds: ["prd_012"],
    perUserLimit: 3,
  },
  cp_008: { applicableProductIds: [], applicableCategories: [], excludeProductIds: [], perUserLimit: 2 },
  cp_009: { applicableProductIds: [], applicableCategories: ["果干蜜饯"], excludeProductIds: [], perUserLimit: 1 },
  cp_010: { applicableProductIds: ["prd_011", "prd_012"], applicableCategories: [], excludeProductIds: [], perUserLimit: 1 },
};

function enrichCoupons() {
  const coupons = readJson("coupons.json");
  return coupons.map((coupon) => {
    const detail = COUPON_DETAILS[coupon.id];
    if (!detail) throw new Error(`缺少优惠券 ${coupon.id} 的适用范围`);
    return { ...coupon, ...detail };
  });
}

/* -------------------------------------------------------------------------- */
/* 4. 售后政策：分类、赔付口径、处理时效                                        */
/* -------------------------------------------------------------------------- */

const POLICY_DETAILS = {
  rp_001: { category: "退换货", compensationRule: "商品完好可全额退款，拆封前的退货运费由买家承担", resolveWithinHours: 48 },
  rp_002: { category: "退换货", compensationRule: "非质量问题拆封后不支持退货；质量问题全额退款并承担运费", resolveWithinHours: 48 },
  rp_003: { category: "缺件", compensationRule: "补发缺件或按缺件金额退款，商家承担运费并补偿 10 元无门槛券", resolveWithinHours: 24 },
  rp_004: { category: "临期", compensationRule: "剩余保质期不足三分之一可退货退款，运费商家承担", resolveWithinHours: 24 },
  rp_005: { category: "退款", compensationRule: "提供照片与批次号，全额退款并赔付同款 1 件", resolveWithinHours: 12 },
  rp_006: { category: "延迟发货", compensationRule: "超 48 小时未发货可申请 10 元无门槛券，或直接退款", resolveWithinHours: 24 },
};

const EXTRA_POLICY = {
  id: "rp_007",
  scene: "运输破损",
  category: "破损",
  title: "运输破损补发与赔付",
  refundWindowDays: 7,
  whoPaysFreight: "商家承担",
  compensationRule: "提供外箱与内袋照片：破损率超过 30% 全额退款，30% 及以下按破损件数比例补偿",
  conditions: [
    "签收后 7 天内反馈，需提供外箱照片与内袋破损照片",
    "同一订单同一次配送仅受理一次破损申请",
  ],
  steps: [
    "收集外箱、内袋、快递面单照片",
    "按破损件数计算补偿金额并给出两个选项（补发/退款）",
    "补发走顺丰，退款 1–3 个工作日到账",
  ],
  exceptions: ["特价清仓商品仅支持补发不支持现金赔付", "拆袋后无法判定破损原因的，按补发处理"],
  resolveWithinHours: 24,
  version: "v1.0.0",
  effectiveFrom: daysAgo(30),
};

function enrichPolicies() {
  const policies = readJson("return-policies.json").map((policy) => {
    const detail = POLICY_DETAILS[policy.id];
    if (!detail) {
      // 本脚本上一轮追加的额外政策（如运输破损）已自带补充字段，重复执行时保持原样
      if (policy.category && policy.compensationRule) return policy;
      throw new Error(`缺少售后政策 ${policy.id} 的补充信息`);
    }
    return { ...policy, ...detail };
  });
  const withDamage = policies.some((policy) => policy.category === "破损") ? policies : [...policies, EXTRA_POLICY];
  return withDamage;
}

/* -------------------------------------------------------------------------- */
/* 5. 订单：物流状态 + 售后状态                                                 */
/* -------------------------------------------------------------------------- */

const AFTER_SALES_REASONS = [
  "外包装压瘪，内袋完好但饼干碎了",
  "少发一件赠品",
  "拆封后口感与描述不符",
  "临期商品，剩余保质期不足 1 个月",
  "口味不合，申请退货",
];

function enrichOrders(logistics) {
  const orders = readJson("orders.json");
  const logisticsByOrder = new Map(logistics.map((record) => [record.orderNo, record]));

  return orders.map((order, index) => {
    const record = logisticsByOrder.get(order.orderNo);

    let logisticsStatus;
    switch (order.status) {
      case "待付款":
      case "已取消":
        logisticsStatus = "未发货";
        break;
      case "待发货":
        logisticsStatus = "未发货";
        break;
      case "已发货":
        logisticsStatus = record ? record.status : "运输中";
        break;
      case "已签收":
        logisticsStatus = "已签收";
        break;
      case "退款中":
      case "已退款":
        logisticsStatus = record ? "已签收" : "未发货";
        break;
      default:
        logisticsStatus = "未发货";
    }

    let afterSalesStatus = "无";
    if (order.status === "退款中") afterSalesStatus = "退款中";
    else if (order.status === "已退款") afterSalesStatus = "已退款";
    else if (order.status === "已签收" && index % 11 === 0) afterSalesStatus = "退货中";
    else if (order.status === "已签收" && index % 13 === 0) afterSalesStatus = "换货中";
    else if (order.status === "已签收" && index % 17 === 0) afterSalesStatus = "已关闭";

    const afterSalesReason =
      afterSalesStatus === "无" ? null : AFTER_SALES_REASONS[index % AFTER_SALES_REASONS.length];

    return { ...order, logisticsStatus, afterSalesStatus, afterSalesReason };
  });
}

/* -------------------------------------------------------------------------- */
/* 6. 用户：新客标记、偏好、过敏禁忌、最近订单                                  */
/* -------------------------------------------------------------------------- */

const USER_AVOID_ALLERGENS = {
  usr_001: ["花生"],
  usr_003: ["麸质", "乳制品"],
  usr_004: ["乳制品"],
  usr_012: ["大豆"],
};

function enrichUsers(orders, products) {
  const users = readJson("users.json");
  const productById = new Map(products.map((product) => [product.id, product]));
  const now = Date.now();

  return users.map((user) => {
    const userOrders = orders
      .filter((order) => order.userId === user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const categories = [];
    const flavors = [];
    for (const order of userOrders) {
      for (const item of order.items) {
        const product = productById.get(item.productId);
        if (!product) continue;
        if (!categories.includes(product.category)) categories.push(product.category);
        if (!flavors.includes(product.flavor)) flavors.push(product.flavor);
      }
    }

    const withinNewWindow = now - new Date(user.joinedAt).getTime() < 30 * 86_400_000;
    const isNewCustomer = withinNewWindow || user.totalOrders <= 1;

    return {
      ...user,
      isNewCustomer,
      preferences: {
        favoriteCategories: categories.slice(0, 3),
        favoriteFlavors: flavors.slice(0, 3),
        avoidAllergens: USER_AVOID_ALLERGENS[user.id] ?? [],
        budgetPerOrder: round2(user.totalSpend / Math.max(1, user.totalOrders)),
      },
      recentOrderNos: userOrders.slice(0, 3).map((order) => order.orderNo),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 7. 转人工规则                                                               */
/* -------------------------------------------------------------------------- */

const HANDOFF_RULES = [
  {
    id: "hr_001",
    name: "用户明确要求人工",
    trigger: "用户说「转人工」「找客服」「不要机器人」等明确诉求",
    condition: "命中关键词且当前会话没有已接管的人工客服",
    priority: "高",
    action: "转人工",
    slaMinutes: 10,
    channels: ["小程序", "APP", "直播间", "电话", "社群"],
    enabled: true,
    note: "不得二次挽留，直接交接并给出一句安抚",
  },
  {
    id: "hr_002",
    name: "投诉与情绪激烈",
    trigger: "出现「投诉」「12315」「曝光」「律师」或辱骂、连续质问",
    condition: "情绪扫描为强负面，或出现监管/曝光类关键词",
    priority: "紧急",
    action: "升级主管",
    slaMinutes: 5,
    channels: ["小程序", "APP", "电话", "社群"],
    enabled: true,
    note: "先共情再升级，禁止与用户争辩，禁止引用内部规则编号",
  },
  {
    id: "hr_003",
    name: "食品安全风险",
    trigger: "异物、霉变、异味、食用后不适、过敏反应",
    condition: "涉及身体健康或食品安全法相关情形",
    priority: "紧急",
    action: "升级主管",
    slaMinutes: 5,
    channels: ["小程序", "APP", "直播间", "电话", "社群"],
    enabled: true,
    note: "不做任何自主赔付承诺，保留聊天记录与批次号",
  },
  {
    id: "hr_004",
    name: "退款金额超阈值",
    trigger: "单笔退款或赔付金额超过 200 元",
    condition: "refund_create 计算金额 > 200 元",
    priority: "高",
    action: "转人工",
    slaMinutes: 15,
    channels: ["小程序", "APP"],
    enabled: true,
    note: "200 元以内可由 Agent 自主发起，超过必须人工二次确认",
  },
  {
    id: "hr_005",
    name: "连续两轮未解决",
    trigger: "同一诉求在 2 轮内没有给出可执行方案",
    condition: "意图未变更且槽位仍缺失，或用户重复同一问题",
    priority: "中",
    action: "转人工",
    slaMinutes: 20,
    channels: ["小程序", "APP", "社群"],
    enabled: true,
    note: "转人工时附上 conversation-summary 的结构化摘要",
  },
  {
    id: "hr_006",
    name: "疑似中奖/返现诈骗",
    trigger: "用户收到「中奖」「返现」「退款到账」「扫码领取」等外部通知",
    condition: "用户询问是否需要转账、提供验证码或银行卡",
    priority: "紧急",
    action: "禁止承诺",
    slaMinutes: 5,
    channels: ["小程序", "APP", "电话", "社群"],
    enabled: true,
    note: "必须提示：不要转账、不要提供验证码/银行卡/身份证、不承诺兑奖、只通过官方渠道核验",
  },
  {
    id: "hr_007",
    name: "特殊人群健康相关",
    trigger: "涉及孕妇、哺乳期、婴幼儿、老人、糖尿病等特殊人群的食用咨询",
    condition: "用户提及健康状况或代他人（儿童/孕妇）购买",
    priority: "高",
    action: "转人工",
    slaMinutes: 15,
    channels: ["小程序", "APP", "直播间", "社群"],
    enabled: true,
    note: "回复必须附「咨询医生/成人陪同」类安全提示，不得给医疗建议",
  },
];

/* -------------------------------------------------------------------------- */
/* 8. Skill 注册表（元数据 + 提示词来自 skills/<id>.md）                        */
/* -------------------------------------------------------------------------- */

const SKILL_DEFS = [
  {
    id: "need-extraction",
    name: "需求抽取",
    stage: "输入理解",
    order: 1,
    version: "1.4.0",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: 1200,
    requiredTools: [],
    owner: "周雨桐",
    enabled: true,
    description: "把用户原话抽成结构化需求（意图、预算、口味、场景、禁忌），缺失槽位交给澄清 Skill",
  },
  {
    id: "clarification-question",
    name: "澄清提问",
    stage: "输入理解",
    order: 2,
    version: "1.0.2",
    model: "deepseek-chat",
    temperature: 0.4,
    maxTokens: 800,
    requiredTools: [],
    owner: "周雨桐",
    enabled: true,
    description: "一次只问 1–2 个最关键的问题，最多两轮，避免连环追问把用户问跑",
  },
  {
    id: "recommendation-decision",
    name: "推荐决策",
    stage: "决策",
    order: 3,
    version: "1.2.1",
    model: "deepseek-reasoner",
    temperature: 0.3,
    maxTokens: 2000,
    requiredTools: ["query_products", "query_activities"],
    owner: "陈立",
    enabled: true,
    description: "基于需求与库存/活动产出候选清单，硬过滤过敏禁忌，按匹配度排序",
  },
  {
    id: "product-substitution",
    name: "商品替代",
    stage: "决策",
    order: 4,
    version: "1.1.0",
    model: "deepseek-chat",
    temperature: 0.4,
    maxTokens: 1500,
    requiredTools: ["query_products", "calculate_price"],
    owner: "陈立",
    enabled: true,
    description: "缺货/下架/超预算/过敏冲突时给同类替代，并用 calculate_price 校验差价",
  },
  {
    id: "recommendation-reason",
    name: "推荐理由",
    stage: "生成",
    order: 5,
    version: "1.1.0",
    model: "deepseek-chat",
    temperature: 0.7,
    maxTokens: 1200,
    requiredTools: ["query_products", "query_coupons"],
    owner: "何嘉",
    enabled: true,
    description: "把候选转成 2–3 条可验证的理由，必须引用真实参数，禁止空话与极限词",
  },
  {
    id: "response-generator",
    name: "话术生成",
    stage: "生成",
    order: 6,
    version: "1.6.0",
    model: "deepseek-chat",
    temperature: 0.6,
    maxTokens: 1500,
    requiredTools: [],
    owner: "何嘉",
    enabled: true,
    description: "统一语气与结构（先结论后细节），输出可直接发送的客服话术",
  },
  {
    id: "risk-check",
    name: "风险审查",
    stage: "守卫",
    order: 7,
    version: "1.3.1",
    model: "deepseek-reasoner",
    temperature: 0,
    maxTokens: 1800,
    requiredTools: [],
    owner: "苏明",
    enabled: true,
    description: "发送前的最后一道闸：价格一致性、极限词、超政策承诺、特殊人群、诈骗话术",
  },
  {
    id: "allergy-risk-reminder",
    name: "过敏风险提醒",
    stage: "守卫",
    order: 8,
    version: "1.1.2",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: 1000,
    requiredTools: ["query_products"],
    owner: "苏明",
    enabled: true,
    description: "命中过敏原或特殊人群时强制提醒并替换商品，绝不声称「绝对不过敏」",
  },
  {
    id: "after-sales-classification",
    name: "售后分类",
    stage: "决策",
    order: 9,
    version: "1.3.0",
    model: "deepseek-chat",
    temperature: 0.2,
    maxTokens: 1200,
    requiredTools: ["query_orders"],
    owner: "周雨桐",
    enabled: true,
    description: "把售后诉求分到破损/缺件/退换货/退款/临期/延迟发货，并引用对应政策口径",
  },
  {
    id: "complaint-triage",
    name: "投诉分级",
    stage: "守卫",
    order: 10,
    version: "1.2.0",
    model: "deepseek-reasoner",
    temperature: 0.2,
    maxTokens: 1600,
    requiredTools: ["query_orders", "query_logistics"],
    owner: "苏明",
    enabled: true,
    description: "按情绪与影响面分 P0/P1/P2，食品安全类直接 P0 并升级",
  },
  {
    id: "human-handoff-decision",
    name: "转人工判定",
    stage: "守卫",
    order: 11,
    version: "1.4.0",
    model: "deepseek-chat",
    temperature: 0.1,
    maxTokens: 1000,
    requiredTools: ["query_orders"],
    owner: "苏明",
    enabled: true,
    description: "读取 handoff-rules 判定是否转人工，输出 handoff 与交接摘要",
  },
  {
    id: "gift-scenario-advisor",
    name: "送礼场景顾问",
    stage: "决策",
    order: 12,
    version: "0.9.0",
    model: "deepseek-chat",
    temperature: 0.6,
    maxTokens: 1600,
    requiredTools: ["query_products", "query_activities", "calculate_price"],
    owner: "林小满",
    enabled: false,
    description: "按收礼对象与预算组合礼盒，注意探病/儿童/孕妇禁忌（灰度中，暂未启用）",
  },
  {
    id: "conversation-summary",
    name: "会话摘要",
    stage: "收口",
    order: 13,
    version: "1.0.1",
    model: "deepseek-chat",
    temperature: 0.3,
    maxTokens: 900,
    requiredTools: [],
    owner: "林小满",
    enabled: true,
    description: "输出结构化摘要（诉求/已确认事实/已给方案/待办/情绪），供转人工与复盘使用",
  },
  {
    id: "对话问候-skill",
    name: "对话问候",
    stage: "输入理解",
    order: 14,
    version: "1.0.0",
    model: "deepseek-chat",
    temperature: 0.8,
    maxTokens: 600,
    requiredTools: [],
    owner: "林小满",
    enabled: true,
    description: "开场身份说明（AI 客服 + 可转人工）、时效承诺与老客识别，不超过 3 句",
  },
];

const SKILL_EVAL_SCORES = {
  "risk-check": 92.5,
  "after-sales-classification": 71.2,
  "need-extraction": 88.4,
  "recommendation-decision": 84.6,
  "response-generator": 90.1,
};

/** 能力标签：Plan 校验据此判断必需能力是否被覆盖 */
const SKILL_CAPABILITIES = {
  "need-extraction": ["intent"],
  "clarification-question": ["clarification"],
  "recommendation-decision": ["recommendation", "product"],
  "product-substitution": ["substitution", "product"],
  "recommendation-reason": ["recommendation", "reasoning"],
  "response-generator": ["reply"],
  "risk-check": ["risk"],
  "allergy-risk-reminder": ["safety", "allergy"],
  "after-sales-classification": ["after_sales", "refund"],
  "complaint-triage": ["complaint", "risk"],
  "human-handoff-decision": ["handoff"],
  "gift-scenario-advisor": ["gift", "recommendation"],
  "conversation-summary": ["summary"],
  "对话问候-skill": ["greeting"],
};

function buildSkills() {
  const now = Date.now();
  return SKILL_DEFS.map((def, index) => {
    const filePath = `skills/${def.id}.md`;
    const absolute = path.join(SKILLS_DIR, `${def.id}.md`);
    if (!fs.existsSync(absolute)) {
      throw new Error(`缺少 Skill 提示词文件：${filePath}（请先创建该文件）`);
    }
    const systemPrompt = fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
    if (systemPrompt.trim().length < 20) throw new Error(`${filePath} 内容过短`);

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      stage: def.stage,
      enabled: def.enabled,
      model: def.model,
      temperature: def.temperature,
      maxTokens: def.maxTokens,
      requiredTools: def.requiredTools,
      capabilities: SKILL_CAPABILITIES[def.id] ?? [],
      version: def.version,
      filePath,
      hash: hashOf(systemPrompt),
      systemPrompt,
      order: def.order,
      owner: def.owner,
      updatedAt: iso(now - (SKILL_DEFS.length - index) * 3_600_000 - 86_400_000),
    };
  });
}

/** 历史版本：按 `## ` 分节去掉末尾两节，模拟「早于当前版本」的正文 */
function olderVersionOf(content) {
  const sections = content.split(/^(?=## )/m);
  if (sections.length <= 3) return content.replace(/#{1,6} /g, "");
  return sections.slice(0, Math.max(2, sections.length - 2)).join("").trim() + "\n";
}

function buildVersions(skills) {
  const versions = [];
  const extras = {
    "risk-check": { olderVersion: "1.0.0", changeNote: "补充 R7 诈骗话术与 R8 放行判定，明确阻断边界" },
    "after-sales-classification": { olderVersion: "1.1.0", changeNote: "新增破损与缺件两类判定，引用最新售后政策" },
  };

  for (const skill of skills) {
    const extra = extras[skill.id];
    if (extra) {
      const olderContent = olderVersionOf(skill.systemPrompt);
      versions.push({
        id: `sv_${skill.id}_${extra.olderVersion}`,
        skillId: skill.id,
        version: extra.olderVersion,
        content: olderContent,
        hash: hashOf(olderContent),
        changeNote: extra.changeNote,
        auto: false,
        author: skill.owner,
        createdAt: iso(new Date(skill.updatedAt).getTime() - 3 * 86_400_000),
        evalScore: null,
        regression: false,
      });
    }

    versions.push({
      id: `sv_${skill.id}_${skill.version}`,
      skillId: skill.id,
      version: skill.version,
      content: skill.systemPrompt,
      hash: skill.hash,
      changeNote: `初始化导入：${skill.name} ${skill.version}`,
      auto: false,
      author: skill.owner,
      createdAt: skill.updatedAt,
      evalScore: SKILL_EVAL_SCORES[skill.id] ?? null,
      regression: skill.id === "after-sales-classification",
    });
  }

  return versions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/* -------------------------------------------------------------------------- */
/* 9. Tool 注册表                                                              */
/* -------------------------------------------------------------------------- */

const TEXT = { type: "string" };
const NUMBER = { type: "number" };
const BOOL = { type: "boolean" };
const INT = { type: "integer" };
const STRING_ARRAY = { type: "array", items: TEXT };

const TOOLS = [
  {
    id: "query_products",
    name: "商品查询",
    description: "按关键词/类目/价格带/过敏原过滤商品，返回真实库存、配料与营养信息",
    kind: "查询",
    riskLevel: "低",
    enabled: true,
    version: "1.2.0",
    timeoutMs: 2000,
    sampleInput: { inStockOnly: true, maxPrice: 60, limit: 3 },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: { ...TEXT, description: "按名称、口味、标签、配料模糊匹配" },
        category: {
          ...TEXT,
          enum: ["坚果炒货", "肉干卤味", "饼干糕点", "果干蜜饯", "糖巧布丁", "冲饮谷物"],
        },
        minPrice: { ...NUMBER, minimum: 0 },
        maxPrice: { ...NUMBER, minimum: 0 },
        inStockOnly: { ...BOOL, description: "只返回在售且有库存的商品" },
        excludeAllergens: { ...STRING_ARRAY, description: "命中任一过敏原则过滤掉该商品" },
        tags: { ...STRING_ARRAY, description: "任一标签命中即保留" },
        limit: { ...INT, minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      required: ["total", "items"],
      properties: {
        total: { ...INT, description: "符合条件的总数" },
        returned: INT,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: TEXT,
              name: TEXT,
              category: TEXT,
              flavor: TEXT,
              price: NUMBER,
              stock: INT,
              status: TEXT,
              allergens: STRING_ARRAY,
              sugarPer100g: NUMBER,
              suitableFor: STRING_ARRAY,
            },
          },
        },
      },
    },
    notes: "只读；过敏原过滤是推荐链路的硬约束，不能被下游放宽",
  },
  {
    id: "query_activities",
    name: "活动查询",
    description: "查询营销活动的门槛、优惠规则、适用类目与有效期",
    kind: "查询",
    riskLevel: "低",
    enabled: true,
    version: "1.1.0",
    timeoutMs: 2000,
    sampleInput: { activeOnly: true, limit: 3 },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        channel: { ...TEXT, enum: ["小程序", "APP", "直播间", "私域社群"] },
        type: { ...TEXT, enum: ["满减", "折扣", "赠品", "秒杀", "组合装"] },
        status: { ...TEXT, enum: ["筹备中", "进行中", "已结束"] },
        activeOnly: { ...BOOL, description: "只返回当前时间在有效期内的活动" },
        at: { ...TEXT, description: "按指定时间判定有效期（ISO 时间）" },
        limit: { ...INT, minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      required: ["total", "items"],
      properties: {
        total: INT,
        at: TEXT,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: TEXT,
              name: TEXT,
              type: TEXT,
              threshold: NUMBER,
              rule: { type: "object", properties: { type: TEXT, value: NUMBER, description: TEXT } },
              applicableCategories: STRING_ARRAY,
              stackableWithCoupon: BOOL,
              startAt: TEXT,
              endAt: TEXT,
            },
          },
        },
      },
    },
    notes: "活动是否叠加券由 stackableWithCoupon 决定，报价前必须查",
  },
  {
    id: "query_coupons",
    name: "优惠券查询",
    description: "查询券面额、门槛、适用商品、叠加规则与可领取状态",
    kind: "查询",
    riskLevel: "低",
    enabled: true,
    version: "1.1.0",
    timeoutMs: 2000,
    sampleInput: { activeOnly: true, limit: 4 },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        code: { ...TEXT, description: "券码，精确匹配（忽略大小写）" },
        kind: { ...TEXT, enum: ["满减券", "折扣券", "免运费券", "新客券"] },
        activeOnly: { ...BOOL, description: "仅返回可领取且未过期的券" },
        productId: { ...TEXT, description: "筛出适用于该商品的券" },
        maxThreshold: { ...NUMBER, minimum: 0 },
        limit: { ...INT, minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      required: ["total", "items"],
      properties: {
        total: INT,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: TEXT,
              name: TEXT,
              kind: TEXT,
              threshold: NUMBER,
              discount: NUMBER,
              stackable: BOOL,
              applicableProductIds: STRING_ARRAY,
              applicableCategories: STRING_ARRAY,
              perUserLimit: INT,
              status: TEXT,
              validTo: TEXT,
            },
          },
        },
      },
    },
    notes: "新客券必须结合 user.isNewCustomer 判断，不能直接承诺",
  },
  {
    id: "calculate_price",
    name: "价格试算",
    description: "按商品明细 + 活动 + 优惠券计算应付金额，输出每一步折扣与冲突说明",
    kind: "计算",
    riskLevel: "中",
    enabled: true,
    version: "1.0.0",
    timeoutMs: 1500,
    sampleInput: { items: [{ productId: "prd_001", qty: 2 }], couponCode: "SG199-30", activityId: "act_001" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            required: ["productId", "qty"],
            properties: { productId: TEXT, qty: { ...INT, minimum: 1, maximum: 99 } },
          },
        },
        couponCode: { ...TEXT, description: "可选，参与试算的券码" },
        activityId: { ...TEXT, description: "可选，参与试算的活动 id" },
      },
    },
    outputSchema: {
      type: "object",
      required: ["subtotal", "payable", "notes"],
      properties: {
        lines: { type: "array", items: { type: "object" } },
        subtotal: NUMBER,
        activityDiscount: NUMBER,
        couponDiscount: NUMBER,
        totalDiscount: NUMBER,
        payable: NUMBER,
        appliedActivity: { type: ["object", "null"] },
        appliedCoupon: { type: ["object", "null"] },
        notes: STRING_ARRAY,
      },
    },
    notes: "纯计算，不写数据；活动与券不可叠加时自动保留更优方案并在 notes 说明",
  },
  {
    id: "query_orders",
    name: "订单查询",
    description: "按订单号/用户/状态查询订单，含物流状态与售后状态两列",
    kind: "查询",
    riskLevel: "低",
    enabled: true,
    version: "1.1.0",
    timeoutMs: 2500,
    sampleInput: { status: "待发货", limit: 3 },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        orderNo: TEXT,
        userId: TEXT,
        status: { ...TEXT, enum: ["待付款", "待发货", "已发货", "已签收", "退款中", "已退款", "已取消"] },
        logisticsStatus: { ...TEXT, enum: ["未发货", "已揽收", "运输中", "派送中", "已签收", "异常"] },
        afterSalesStatus: { ...TEXT, enum: ["无", "退款中", "已退款", "退货中", "换货中", "已关闭"] },
        limit: { ...INT, minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      required: ["total", "items"],
      properties: {
        total: INT,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              orderNo: TEXT,
              userId: TEXT,
              status: TEXT,
              logisticsStatus: TEXT,
              afterSalesStatus: TEXT,
              afterSalesReason: { type: ["string", "null"] },
              payable: NUMBER,
              trackingNo: { type: ["string", "null"] },
              createdAt: TEXT,
              items: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
    notes: "售后状态与订单状态分开判断，避免把「退款中」说成「已退款」",
  },
  {
    id: "query_logistics",
    name: "物流查询",
    description: "按订单号/运单号查询轨迹、最新节点与延误时长",
    kind: "查询",
    riskLevel: "低",
    enabled: true,
    version: "1.1.0",
    timeoutMs: 3000,
    sampleInput: { status: "异常", limit: 3 },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        orderNo: TEXT,
        trackingNo: TEXT,
        status: { ...TEXT, enum: ["已揽收", "运输中", "派送中", "已签收", "异常"] },
        carrier: { ...TEXT, enum: ["顺丰速运", "中通快递", "圆通速递", "京东物流", "邮政EMS"] },
        limit: { ...INT, minimum: 1, maximum: 50, default: 10 },
      },
    },
    outputSchema: {
      type: "object",
      required: ["total", "items"],
      properties: {
        total: INT,
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              orderNo: TEXT,
              carrier: TEXT,
              trackingNo: TEXT,
              status: TEXT,
              city: TEXT,
              lastEvent: TEXT,
              lastEventAt: TEXT,
              estimatedArrival: TEXT,
              delayHours: NUMBER,
            },
          },
        },
      },
    },
    notes: "delayHours ≥ 12 或 status=异常 时应触发 human-handoff-decision",
  },
];

const TOOL_CONFIGS = [
  { toolId: "query_products", timeoutMs: 2000, maxRetries: 1, rateLimitPerMin: 600, requireConfirm: false, env: "production", note: "高频只读，超时后降级为「请提供商品关键词」" },
  { toolId: "query_activities", timeoutMs: 2000, maxRetries: 1, rateLimitPerMin: 300, requireConfirm: false, env: "production", note: "活动变更频繁，缓存 30 秒" },
  { toolId: "query_coupons", timeoutMs: 2000, maxRetries: 1, rateLimitPerMin: 300, requireConfirm: false, env: "production", note: "券状态与库存实时性要求高，不做缓存" },
  { toolId: "calculate_price", timeoutMs: 1500, maxRetries: 0, rateLimitPerMin: 900, requireConfirm: false, env: "production", note: "纯计算，结果需与前端结算页一致" },
  { toolId: "query_orders", timeoutMs: 2500, maxRetries: 1, rateLimitPerMin: 240, requireConfirm: false, env: "production", note: "涉及用户隐私，日志中订单号需脱敏" },
  { toolId: "query_logistics", timeoutMs: 3000, maxRetries: 2, rateLimitPerMin: 180, requireConfirm: false, env: "production", note: "承运商网关不稳定，超时重试 2 次后走兜底话术" },
];

/* -------------------------------------------------------------------------- */
/* 10. 历史引用映射                                                             */
/* -------------------------------------------------------------------------- */

const SKILL_KEY_MAP = {
  refund_policy: "after-sales-classification",
  logistics_followup: "human-handoff-decision",
  coupon_consult: "recommendation-reason",
  product_recommend: "recommendation-decision",
  address_change: "clarification-question",
  risk_guard: "complaint-triage",
  presale_consult: "need-extraction",
  member_care: "conversation-summary",
};

const mapSkill = (key) => SKILL_KEY_MAP[key] ?? key;

function remapReferences(skills) {
  const versionBySkill = new Map(skills.map((skill) => [skill.id, skill.version]));

  const runs = readJson("runs.json").map((run) => ({ ...run, skillKey: mapSkill(run.skillKey) }));
  // 评测只有一份存储：eval-cases.json（V2 契约，没有 skillKey 字段，无需映射）
  const evalCases = readJson("eval-cases.json");
  const improvements = readJson("improvements.json").map((item) => ({ ...item, skillKey: mapSkill(item.skillKey) }));

  const oldVersions = readJson("skill-versions.json");
  const annotationTarget = new Map();
  for (const version of oldVersions) {
    if (version.skillKey) {
      const mapped = mapSkill(version.skillKey);
      annotationTarget.set(version.id, `sv_${mapped}_${versionBySkill.get(mapped) ?? "1.0.0"}`);
    }
  }
  const annotations = readJson("annotations.json").map((annotation) => {
    if (annotation.targetType !== "skill_version") return annotation;
    const mapped = annotationTarget.get(annotation.targetId);
    return mapped ? { ...annotation, targetId: mapped } : annotation;
  });

  const llmConfig = readJson("llm-config.json");
  llmConfig.enabledTools = TOOLS.filter((tool) => tool.enabled).map((tool) => tool.id);

  return { runs, evalCases, improvements, annotations, llmConfig };
}

/* -------------------------------------------------------------------------- */
/* 执行                                                                        */
/* -------------------------------------------------------------------------- */

const startedAt = Date.now();
const logistics = readJson("logistics.json");

const products = enrichProducts();
const activities = enrichActivities();
const coupons = enrichCoupons();
const policies = enrichPolicies();
const orders = enrichOrders(logistics);
const users = enrichUsers(orders, products);
const skills = buildSkills();
const versions = buildVersions(skills);
const refs = remapReferences(skills);

writeJson("products.json", products);
writeJson("activities.json", activities);
writeJson("coupons.json", coupons);
writeJson("return-policies.json", policies);
writeJson("orders.json", orders);
writeJson("users.json", users);
writeJson("handoff-rules.json", HANDOFF_RULES);
writeJson("skills.json", skills);
writeJson("skill-versions.json", versions);
writeJson("tools.json", TOOLS.map((tool) => ({
  ...tool,
  updatedAt: iso(Date.now() - 86_400_000),
})));
writeJson("tools-config.json", TOOL_CONFIGS.map((config, index) => ({
  id: `tc_${String(index + 1).padStart(3, "0")}`,
  ...config,
  updatedAt: iso(Date.now() - (index + 1) * 3_600_000),
})));
writeJson("runs.json", refs.runs);
writeJson("eval-cases.json", refs.evalCases);
writeJson("improvements.json", refs.improvements);
writeJson("annotations.json", refs.annotations);
writeJson("llm-config.json", { provider: null, ...refs.llmConfig });

// Planner 配置（管理后台可编辑）：只在文件缺失时写入，避免覆盖运营改过的提示词
const plannerConfigPath = path.join(DATA_DIR, "planner-config.json");
if (!fs.existsSync(plannerConfigPath)) {
  const plannerPrompt = [
    "你是零食电商客服 Agent 的 Planner。你的唯一职责是输出一个可执行的 JSON Plan，不要输出解释性文字。",
    "",
    "硬性规则：",
    "1. 只能从 availableSkills / availableTools 里选择，id 必须逐字一致，不得编造。",
    "2. mandatoryCapabilities 里列出的能力必须被覆盖；判断依据是 Skill 的 capabilities 字段与 Tool 能提供的能力。",
    "3. 涉及价格 / 优惠 / 券时必须选择 calculate_price。",
    "4. 涉及订单时必须选择 query_orders；涉及物流 / 快递 / 发货时必须选择 query_logistics。",
    "5. 涉及中奖诈骗、投诉、过敏、特殊人群时必须包含 risk-check（没有 risk-check 时必须在 degradation 里声明转人工）。",
    "6. 必须包含一个 capabilities 含 reply 的 Skill，否则链路无法产出回复。",
    "7. 能力确实无法满足时，degradation.degraded 与 degradation.handoff 必须为 true，并在 reason 里写清缺什么。",
  ].join("\n");
  const promptHash = hashOf(`${plannerPrompt}\n`);

  writeJson("planner-config.json", {
    id: "planner",
    version: "1.4.0",
    model: "deepseek-reasoner",
    temperature: 0.1,
    maxTokens: 1200,
    systemPrompt: `${plannerPrompt}\n`,
    promptHash,
    allowedSkills: [],
    allowedTools: [],
    defaultMandatoryCapabilities: [],
    updatedAt: daysAgo(1),
    updatedBy: "周雨桐",
    history: [
      {
        version: "1.4.0",
        createdAt: daysAgo(1),
        changeNote: "初始化：选择规则 + 能力覆盖 + 降级声明",
        promptHash,
      },
    ],
  });
}

// Agent 运行记录（第一段不存在，这里保证文件存在；已有内容不覆盖）
const agentRunsPath = path.join(DATA_DIR, "agent-runs.json");
if (!fs.existsSync(agentRunsPath)) {
  writeJson("agent-runs.json", []);
}

const covered = new Set(TOOLS.map((tool) => tool.id));
const referencedTools = new Set(skills.flatMap((skill) => skill.requiredTools));
const unknownTools = [...referencedTools].filter((id) => !covered.has(id));

console.log("SnackOps 注册系统数据构建完成");
console.log("---------------------------------------------");
const rows = [
  ["skills.json", `${skills.length} 个 Skill（启用 ${skills.filter((skill) => skill.enabled).length}）`],
  ["skill-versions.json", `${versions.length} 个版本快照`],
  ["tools.json", `${TOOLS.length} 个 Tool（启用 ${TOOLS.filter((tool) => tool.enabled).length}）`],
  ["tools-config.json", `${TOOL_CONFIGS.length} 行运行配置`],
  ["handoff-rules.json", `${HANDOFF_RULES.length} 条转人工规则`],
  ["products.json", `${products.length} 个商品（配料/营养/适用人群已补全）`],
  ["activities.json", `${activities.length} 个活动（门槛/规则/类目已补全）`],
  ["coupons.json", `${coupons.length} 张券（适用范围已补全）`],
  ["orders.json", `${orders.length} 笔订单（物流/售后状态已补全）`],
  ["users.json", `${users.length} 位用户（新客/偏好/禁忌已补全）`],
  ["return-policies.json", `${policies.length} 条售后政策`],
  ["runs/eval_*/improvements", "旧 skillKey 已映射到新 Skill id"],
];
for (const [file, detail] of rows) console.log(`  ${file.padEnd(24)} ${detail}`);
if (unknownTools.length > 0) {
  console.error(`\n[错误] Skill 引用了不存在的 Tool：${unknownTools.join(", ")}`);
  process.exit(1);
}
console.log(`\n耗时 ${Date.now() - startedAt} ms；数据目录：${DATA_DIR}`);
