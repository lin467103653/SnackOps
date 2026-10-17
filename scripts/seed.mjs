#!/usr/bin/env node
/**
 * SnackOps 演示数据种子脚本（零依赖，Node >= 20）
 *
 * 用法：
 *   node scripts/seed.mjs          生成 21 个数据文件；已存在且非空的文件跳过
 *   node scripts/seed.mjs --force  覆盖写入全部数据文件
 *
 * 约定：
 * - 数据目录：SNACKOPS_DATA_DIR（相对 cwd 解析），未设置时用 <项目根>/data
 * - 所有时间相对「本次运行时刻」生成，保证看板始终有最近 14 天的运行数据
 * - 随机数使用固定种子的 mulberry32，重复运行得到同样的数据形状
 * - 落盘格式统一为 JSON.stringify(value, null, 2) + "\n"（UTF-8）
 * - 21 个文件与 src/lib/collections.ts 的注册表一一对应（评测只有 eval-cases / eval-batch 两份）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toV2EvalCase } from "./lib/eval-legacy.mjs";

/* ========================================================================== */
/* 0. 运行参数与路径                                                           */
/* ========================================================================== */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const FORCE = process.argv.includes("--force");
const DATA_DIR = process.env.SNACKOPS_DATA_DIR
  ? path.resolve(process.cwd(), process.env.SNACKOPS_DATA_DIR)
  : path.join(PROJECT_ROOT, "data");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW_MS = Date.now();

/* ========================================================================== */
/* 1. 基础工具：确定性随机、时间、数值                                          */
/* ========================================================================== */

/** mulberry32：小而稳的确定性 PRNG，保证重复运行数据形状一致 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(0x5eed2026);

/** [min, max] 闭区间整数 */
const randInt = (min, max) => min + Math.floor(random() * (max - min + 1));

/** 从数组里取一个元素 */
const pick = (list) => list[randInt(0, list.length - 1)];

/** Fisher-Yates 洗牌（不改原数组） */
function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const r2 = (value) => Math.round(value * 100) / 100;
const r4 = (value) => Math.round(value * 10000) / 10000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isoAt = (ms) => new Date(ms).toISOString();
const hoursAgo = (hours) => isoAt(NOW_MS - hours * HOUR);
const hoursAhead = (hours) => isoAt(NOW_MS + hours * HOUR);
const daysAgo = (days) => hoursAgo(days * 24);
const daysAhead = (days) => hoursAhead(days * 24);

/** 本地时区的「N 天前的某个钟点」，用于保证趋势图每天都有数据 */
function localDaysAgo(days, hour, minute = 0) {
  const now = new Date(NOW_MS);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, minute, randInt(0, 59), 0).toISOString();
}

/** 生成的 traceId，形如 trace-9f2c... */
function makeTraceId() {
  let hex = "";
  for (let i = 0; i < 6; i += 1) hex += randInt(0, 0xffff).toString(16).padStart(4, "0");
  return `trace-${hex}`;
}

/** 订单号：SG + 下单日期 + 5 位流水 */
function makeOrderNo(createdAtIso, seq) {
  const d = new Date(createdAtIso);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `SG${stamp}${String(seq).padStart(5, "0")}`;
}

/** 工单编号：TK + 创建日期 + 4 位流水 */
function makeTicketCode(createdAtIso, seq) {
  const d = new Date(createdAtIso);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `TK${stamp}${String(seq).padStart(4, "0")}`;
}

/* ========================================================================== */
/* 2. 商品与营销                                                               */
/* ========================================================================== */

/** 12 个 SKU：坚果/肉干/饼干/果干/糖巧/冲饮 各 2 个 */
function buildProducts() {
  const rows = [
    // sku, 名称, 类目, 价格, 库存, 保质期(天), 过敏原, 口味标签, 月销, 状态
    ["SG-NUT-018", "蜂蜜黄油夏威夷果", "坚果炒货", 39.9, 820, 180, ["坚果", "乳制品"], ["奶香", "酥脆"], 1246, "在售"],
    ["SG-NUT-024", "手剥原味巴旦木", "坚果炒货", 29.9, 0, 240, ["坚果", "花生"], ["原味", "清甜"], 986, "缺货"],
    ["SG-MEAT-007", "五香卤汁牛肉干", "肉干卤味", 45.9, 318, 90, ["大豆"], ["五香", "咸鲜"], 742, "在售"],
    ["SG-MEAT-015", "麻辣椒盐鸡肉脯", "肉干卤味", 26.9, 156, 60, ["大豆", "麸质"], ["麻辣", "重口"], 613, "预售"],
    ["SG-BIS-011", "海盐黄油曲奇", "饼干糕点", 19.9, 1240, 120, ["麸质", "乳制品"], ["海盐", "黄油"], 1528, "在售"],
    ["SG-BIS-026", "蔓越莓燕麦软曲奇", "饼干糕点", 22.9, 96, 45, ["麸质", "乳制品"], ["可可", "酸甜"], 428, "在售"],
    ["SG-FRU-009", "冻干草莓脆", "果干蜜饯", 33.9, 462, 365, ["无"], ["酸甜", "果香"], 884, "在售"],
    ["SG-FRU-021", "芒果干条装", "果干蜜饯", 18.9, 38, 270, ["无"], ["浓甜", "果香"], 521, "在售"],
    ["SG-CDY-005", "白桃乌龙软糖", "糖巧布丁", 12.9, 2160, 300, ["无"], ["桃香", "清甜"], 2134, "在售"],
    ["SG-CDY-017", "72% 黑巧薄脆（单条装）", "糖巧布丁", 6.9, 648, 365, ["乳制品", "大豆"], ["苦甜", "可可"], 341, "在售"],
    ["SG-CER-003", "高纤坚果燕麦奶昔粉", "冲饮谷物", 59.9, 214, 365, ["坚果", "乳制品"], ["坚果香", "醇厚"], 306, "在售"],
    ["SG-CER-012", "桂圆红枣枸杞谷物礼盒", "冲饮谷物", 89.9, 0, 300, ["无"], ["枣香", "微甜"], 187, "已下架"],
  ];

  return rows.map((row, index) => {
    const [sku, name, category, price, stock, shelfLifeDays, allergens, flavorTags, monthlySales, status] = row;
    return {
      id: `prd_${String(index + 1).padStart(3, "0")}`,
      sku,
      name,
      category,
      price,
      stock,
      shelfLifeDays,
      allergens,
      flavorTags,
      monthlySales,
      status,
      updatedAt: hoursAgo(randInt(8, 260)),
    };
  });
}

/** 8 个营销活动：进行中 / 已结束 / 筹备中 混合 */
function buildActivities() {
  const plan = [
    {
      name: "双11 预热·全店满299减50",
      type: "满减",
      channel: "小程序",
      status: "进行中",
      startAt: hoursAgo(50),
      endAt: hoursAhead(216),
      budget: 180000,
      participants: 12840,
      gmv: 402680.5,
      note: "预热期每天 20:00 追加 200 张满减券，注意与直播间券互斥",
    },
    {
      name: "直播间坚果专场秒杀",
      type: "秒杀",
      channel: "直播间",
      status: "进行中",
      startAt: hoursAgo(26),
      endAt: hoursAhead(46),
      budget: 60000,
      participants: 8620,
      gmv: 128400,
      note: "夏威夷果 3 斤装限量 800 份，超卖由客服人工补差",
    },
    {
      name: "新客首单立减15",
      type: "满减",
      channel: "APP",
      status: "进行中",
      startAt: daysAgo(20),
      endAt: daysAhead(40),
      budget: 90000,
      participants: 15620,
      gmv: 196300,
      note: "新客券与新客首单立减不可叠加，测算按 39 元门槛",
    },
    {
      name: "肉干卤味第二件半价",
      type: "折扣",
      channel: "小程序",
      status: "已结束",
      startAt: daysAgo(12),
      endAt: daysAgo(5),
      budget: 40000,
      participants: 5410,
      gmv: 76240.8,
      note: "售罄后提前 4 小时结束，超卖订单已全部补发",
    },
    {
      name: "囤货组合装（坚果+果干 8 件套）",
      type: "组合装",
      channel: "私域社群",
      status: "已结束",
      startAt: daysAgo(18),
      endAt: daysAgo(8),
      budget: 50000,
      participants: 2130,
      gmv: 88260,
      note: "社群专属链路，客单价 41.4 元，退货率 1.8%",
    },
    {
      name: "中秋礼盒买赠活动",
      type: "赠品",
      channel: "APP",
      status: "已结束",
      startAt: daysAgo(26),
      endAt: daysAgo(16),
      budget: 35000,
      participants: 4300,
      gmv: 64900,
      note: "赠品为定制杯垫，赠品缺货时按 5 元无门槛券补偿",
    },
    {
      name: "双11 会员日满159减25",
      type: "满减",
      channel: "私域社群",
      status: "筹备中",
      startAt: daysAhead(3),
      endAt: daysAhead(10),
      budget: 120000,
      participants: 0,
      gmv: 0,
      note: "仅金卡及以上可领，需与会员积分抵扣规则做冲突校验",
    },
    {
      name: "周末闪购·冻干草莓限量秒杀",
      type: "秒杀",
      channel: "小程序",
      status: "筹备中",
      startAt: daysAhead(1),
      endAt: daysAhead(2),
      budget: 20000,
      participants: 0,
      gmv: 0,
      note: "库存 300 份，需先清理临期批次再上架",
    },
  ];

  return plan.map((item, index) => ({ id: `act_${String(index + 1).padStart(3, "0")}`, ...item }));
}

/** 10 张优惠券：领取数 <= 总量，核销数 <= 领取数 */
function buildCoupons() {
  const plan = [
    // code, 名称, 类型, 门槛, 优惠, 可叠加, 总量, 已领, 已用, 生效, 失效, 状态
    ["SG199-30", "全场满199减30", "满减券", 199, 30, false, 5000, 4310, 2860, daysAgo(18), daysAhead(12), "可领取"],
    ["LIVE129-20", "直播间专享满129减20", "满减券", 129, 20, false, 2000, 2000, 1740, daysAgo(5), daysAhead(2), "已领完"],
    ["NEW15", "新客首单立减15", "新客券", 39, 15, false, 20000, 8650, 5120, daysAgo(60), daysAhead(90), "可领取"],
    ["NUT90-10", "坚果炒货9折（最高减10）", "折扣券", 99, 10, false, 4000, 2210, 1380, daysAgo(9), daysAhead(5), "可领取"],
    ["FREESHIP8", "满29免运费券", "免运费券", 29, 8, true, 8000, 6120, 4890, daysAgo(30), daysAhead(20), "可领取"],
    ["PRE11-50", "双11预热满299减50", "满减券", 299, 50, false, 10000, 2400, 380, daysAgo(2), daysAhead(26), "可领取"],
    ["CLEAR99-10", "暑期清仓满99减10", "满减券", 99, 10, false, 3000, 3000, 2955, daysAgo(60), daysAgo(3), "已过期"],
    ["VIP159-25", "会员日专享满159减25", "满减券", 159, 25, true, 1500, 640, 210, daysAgo(3), daysAhead(8), "可领取"],
    ["FRU5", "果干尝鲜5元无门槛", "新客券", 0, 5, false, 12000, 9800, 7210, daysAgo(40), daysAhead(6), "已领完"],
    ["PRESALE-12", "双11预售定金膨胀券", "满减券", 59, 12, false, 800, 120, 24, daysAgo(1), daysAhead(18), "可领取"],
  ];

  return plan.map((row, index) => {
    const [code, name, kind, threshold, discount, stackable, total, claimed, used, validFrom, validTo, status] = row;
    return {
      id: `cp_${String(index + 1).padStart(3, "0")}`,
      code,
      name,
      kind,
      threshold,
      discount,
      stackable,
      total,
      claimed,
      used,
      validFrom,
      validTo,
      status,
    };
  });
}

/* ========================================================================== */
/* 3. 用户与订单                                                               */
/* ========================================================================== */

/** 12 位用户：等级/标签/风险标签混合，风险为 2 关注 + 1 高风险 */
function buildUsers() {
  const rows = [
    // 昵称, 手机号, 等级, 订单数, 累计消费, 最近下单(小时前), 注册(天前), 标签, 风险
    ["橘子汽水", "138****6621", "银卡", 14, 1286.4, 48, 420, ["宝妈", "直播间常客"], "正常"],
    ["加班的小林", "139****3087", "金卡", 31, 4210.6, 26, 610, ["重口味", "夜宵党"], "正常"],
    ["减脂期的阿May", "137****9012", "普通", 6, 356.2, 120, 96, ["控糖", "健身"], "正常"],
    ["豆豆妈妈", "136****4455", "黑卡", 68, 12890.0, 312, 880, ["宝妈", "囤货党", "大促敏感"], "正常"],
    ["深夜嘴馋星人", "135****7789", "银卡", 19, 1842.3, 30, 350, ["重口味", "夜宵党"], "关注"],
    ["拎得清的阿姨", "158****2210", "普通", 9, 688.0, 144, 210, ["价格敏感", "退货多"], "正常"],
    ["打工人阿凯", "150****6634", "金卡", 22, 3120.8, 24, 505, ["直播间常客", "秒杀党"], "正常"],
    ["甜品控小鹿", "186****1122", "银卡", 11, 998.5, 60, 280, ["嗜甜", "爱写评价"], "正常"],
    ["直播间蹲守王", "133****9987", "金卡", 27, 2680.0, 12, 470, ["直播间常客", "秒杀党"], "关注"],
    ["糯米团子", "177****3345", "普通", 3, 129.8, 4, 12, ["新客", "学生党"], "正常"],
    ["一箱一箱囤", "189****5560", "黑卡", 74, 15680.5, 336, 920, ["囤货党", "大促敏感"], "正常"],
    ["挑剔的老周", "130****0071", "银卡", 8, 742.6, 96, 640, ["职业打假", "投诉史3次"], "高风险"],
  ];

  return rows.map((row, index) => {
    const [nickname, phoneMasked, level, totalOrders, totalSpend, lastOrderHoursAgo, joinedDaysAgo, tags, risk] = row;
    return {
      id: `usr_${String(index + 1).padStart(3, "0")}`,
      nickname,
      phoneMasked,
      level,
      totalOrders,
      totalSpend,
      lastOrderAt: hoursAgo(lastOrderHoursAgo),
      joinedAt: daysAgo(joinedDaysAgo),
      tags,
      risk,
    };
  });
}

/** 24 笔订单：状态混合，金额 = 明细合计，应付 = 金额 - 优惠 */
function buildOrders(products, users, coupons) {
  const addressList = [
    "上海市浦东新区·张**",
    "浙江省杭州市西湖区·李**",
    "北京市朝阳区·王**",
    "四川省成都市武侯区·刘**",
    "广东省广州市天河区·陈**",
    "湖北省武汉市洪山区·杨**",
    "广东省深圳市南山区·赵**",
    "陕西省西安市雁塔区·周**",
    "江苏省南京市鼓楼区·吴**",
    "重庆市渝北区·徐**",
    "湖南省长沙市岳麓区·孙**",
    "江苏省苏州市工业园区·马**",
    "天津市南开区·朱**",
    "河南省郑州市金水区·胡**",
    "安徽省合肥市蜀山区·郭**",
    "辽宁省沈阳市和平区·何**",
    "上海市徐汇区·高**",
    "浙江省宁波市鄞州区·林**",
    "福建省厦门市思明区·罗**",
    "山东省青岛市市南区·梁**",
    "四川省成都市锦江区·宋**",
    "广东省佛山市禅城区·唐**",
    "江苏省无锡市滨湖区·许**",
    "北京市海淀区·韩**",
  ];

  // 注意：商品下标对应 buildProducts() 的顺序（0 起）
  const plan = [
    { user: 2, items: [[4, 2], [8, 3]], couponId: "cp_009", status: "已签收", hoursAgo: 120, channel: "小程序", remark: "希望工作日白天送" },
    { user: 7, items: [[6, 2], [5, 1]], couponId: "cp_005", status: "已签收", hoursAgo: 168, channel: "APP", remark: null },
    { user: 3, items: [[0, 2], [2, 1], [7, 2]], couponId: "cp_007", status: "已签收", hoursAgo: 216, channel: "小程序", remark: "和上次一样放快递柜" },
    { user: 1, items: [[2, 2], [3, 1]], couponId: "cp_005", status: "已发货", hoursAgo: 72, channel: "直播间", remark: "直播间下单，麻烦尽快发" },
    { user: 10, items: [[9, 6], [8, 4]], couponId: "cp_009", status: "已签收", hoursAgo: 264, channel: "APP", remark: null },
    { user: 0, items: [[0, 1], [4, 1], [6, 1]], couponId: null, status: "已发货", hoursAgo: 48, channel: "小程序", remark: null },
    { user: 4, items: [[3, 2], [5, 2]], couponId: "cp_007", status: "退款中", hoursAgo: 144, channel: "APP", remark: "坚果发苦，已申请退款" },
    { user: 11, items: [[1, 1], [2, 1]], couponId: null, status: "退款中", hoursAgo: 96, channel: "小程序", remark: "异味问题，要求十倍赔偿" },
    { user: 5, items: [[7, 3]], couponId: "cp_009", status: "已退款", hoursAgo: 192, channel: "小程序", remark: "拍重复了，已退款" },
    { user: 6, items: [[10, 1], [9, 4]], couponId: null, status: "待发货", hoursAgo: 24, channel: "直播间", remark: "急用，麻烦优先发货" },
    { user: 8, items: [[0, 1]], couponId: null, status: "待发货", hoursAgo: 12, channel: "直播间", remark: null },
    { user: 9, items: [[8, 2], [9, 4]], couponId: "cp_003", status: "待付款", hoursAgo: 4, channel: "小程序", remark: "新客首单，地址写错待确认" },
    { user: 3, items: [[10, 2], [11, 1]], couponId: "cp_001", status: "已签收", hoursAgo: 312, channel: "APP", remark: "礼盒送人，需要发票" },
    { user: 1, items: [[2, 1], [3, 1], [5, 1]], couponId: "cp_007", status: "已签收", hoursAgo: 336, channel: "小程序", remark: null },
    { user: 10, items: [[4, 4], [6, 2]], couponId: "cp_002", status: "已签收", hoursAgo: 240, channel: "直播间", remark: "直播间专享券已用" },
    { user: 0, items: [[6, 1], [0, 1]], couponId: null, status: "待发货", hoursAgo: 26, channel: "APP", remark: null },
    { user: 2, items: [[4, 1]], couponId: null, status: "已签收", hoursAgo: 384, channel: "小程序", remark: null },
    { user: 7, items: [[8, 5]], couponId: null, status: "已发货", hoursAgo: 60, channel: "小程序", remark: null },
    { user: 6, items: [[0, 3], [2, 1]], couponId: "cp_010", status: "已签收", hoursAgo: 432, channel: "APP", remark: "预售定金已抵扣" },
    { user: 11, items: [[1, 2]], couponId: null, status: "已退款", hoursAgo: 204, channel: "小程序", remark: "退款已到账" },
    { user: 4, items: [[3, 1]], couponId: null, status: "待发货", hoursAgo: 30, channel: "直播间", remark: "预售商品，等 11 月发货" },
    { user: 5, items: [[7, 1]], couponId: null, status: "已取消", hoursAgo: 120, channel: "小程序", remark: "用户主动取消" },
    { user: 8, items: [[6, 2]], couponId: null, status: "已签收", hoursAgo: 150, channel: "小程序", remark: null },
    { user: 9, items: [[9, 2]], couponId: null, status: "已取消", hoursAgo: 50, channel: "APP", remark: "超时未支付自动取消" },
  ];

  const carrierPrefixes = ["SF", "ZTO", "YT", "JD", "EMS"];
  const shippedStatuses = new Set(["已发货", "已签收", "退款中", "已退款"]);

  return plan.map((spec, index) => {
    const items = spec.items.map(([productIndex, qty]) => {
      const product = products[productIndex];
      return { productId: product.id, name: product.name, qty, unitPrice: product.price };
    });

    const amount = r2(items.reduce((total, item) => total + item.qty * item.unitPrice, 0));
    const coupon = spec.couponId ? coupons.find((item) => item.id === spec.couponId) ?? null : null;
    const discount = coupon && amount >= coupon.threshold ? coupon.discount : 0;
    const payable = r2(amount - discount);
    const createdAt = hoursAgo(spec.hoursAgo);
    const shipped = shippedStatuses.has(spec.status);
    const carrierPrefix = carrierPrefixes[index % carrierPrefixes.length];

    return {
      id: `ord_${String(index + 1).padStart(3, "0")}`,
      orderNo: makeOrderNo(createdAt, 10007 + index * 137),
      userId: users[spec.user].id,
      items,
      amount,
      discount,
      payable,
      status: spec.status,
      channel: spec.channel,
      address: addressList[index],
      trackingNo: shipped ? `${carrierPrefix}${randInt(1000000000000, 9999999999999)}` : null,
      remark: spec.remark,
      createdAt,
    };
  });
}

/* ========================================================================== */
/* 4. 规则与知识                                                               */
/* ========================================================================== */

/** 6 条退货/售后政策 */
function buildReturnPolicies() {
  const plan = [
    {
      scene: "7天无理由退货",
      title: "未拆封商品 7 天无理由退货",
      refundWindowDays: 7,
      whoPaysFreight: "买家承担",
      conditions: ["商品未拆封、不影响二次销售", "签收后 7 个自然日内提交申请", "赠品需一并寄回"],
      steps: ["核对订单号与签收时间", "确认包装完整未拆封", "指导用户在小程序提交退货申请", "审核通过后推送退货地址"],
      exceptions: ["生鲜/短保食品不适用", "定制礼盒、已开具专票的订单不适用", "大促期间运费险按活动规则执行"],
      version: "v3.1",
      effectiveDaysAgo: 60,
    },
    {
      scene: "食品拆封",
      title: "食品类拆封后不支持无理由退货",
      refundWindowDays: 7,
      whoPaysFreight: "视责任方",
      conditions: ["食品属于《消法》第二十五条不适用无理由退货的商品", "拆封后仅受理质量/异味/异物类诉求"],
      steps: ["确认是否已拆封", "若为质量问题，引导拍照留证", "按变质赔付政策转对应流程"],
      exceptions: ["拆封后发现异物，按食品安全相关标准处理", "整箱未拆而单包破损，按漏发/破损补发"],
      version: "v3.2",
      effectiveDaysAgo: 45,
    },
    {
      scene: "漏发错发",
      title: "漏发、错发、少件的补发与退款",
      refundWindowDays: 15,
      whoPaysFreight: "商家承担",
      conditions: ["提供开箱照片或视频", "签收后 15 天内提出", "以仓库出库重量与打包记录为判责依据"],
      steps: ["核对订单明细与实际收到商品", "调取出库打包记录", "确认漏发后优先补发，缺货则按单价退款", "补发订单 48 小时内发出"],
      exceptions: ["无法提供开箱凭证的，按 5 元无门槛券补偿", "同一用户 30 天内二次申请需人工复核"],
      version: "v2.4",
      effectiveDaysAgo: 30,
    },
    {
      scene: "临期商品",
      title: "临期商品的明示与折价补偿",
      refundWindowDays: 7,
      whoPaysFreight: "视责任方",
      conditions: ["剩余保质期不足三分之一视为临期", "临期商品需在详情页明示并折价销售"],
      steps: ["核对生产日期与剩余保质期", "未明示的按剩余天数折价补偿", "超过 50% 剩余期可申请退货退款"],
      exceptions: ["已明示临期并折扣购买的不再补偿", "冲饮谷物类剩余期低于 30 天直接下架不发"],
      version: "v1.8",
      effectiveDaysAgo: 80,
    },
    {
      scene: "变质赔付",
      title: "变质、异味、异物的赔付标准",
      refundWindowDays: 30,
      whoPaysFreight: "商家承担",
      conditions: ["提供问题商品照片/视频与批次号", "签收后 30 天内提出", "经质检确认为品质问题"],
      steps: ["收集照片、批次号与数量", "同步质检判定责任", "按退一赔三执行，不足 500 元按 500 元", "500 元以上或涉及投诉舆情转人工复核"],
      exceptions: ["储存不当导致的口感变化不在赔付范围", "同一批次批量问题需升级至品控负责人"],
      version: "v3.0",
      effectiveDaysAgo: 20,
    },
    {
      scene: "大促延迟发货",
      title: "大促期间延迟发货的补偿",
      refundWindowDays: 15,
      whoPaysFreight: "商家承担",
      conditions: ["大促期间（11.1-11.15）发货时效放宽至 72 小时", "超时未发货需主动通知并提供补偿"],
      steps: ["查询订单实际状态", "超过 72 小时未发货主动致歉", "发放 5 元无门槛券或免运费券", "超过 7 天未发货可全额退款并补偿"],
      exceptions: ["预售商品按预售页面承诺时间执行", "不可抗力（极端天气/疫情）另行公告"],
      version: "v2.0",
      effectiveDaysAgo: 12,
    },
  ];

  return plan.map((item, index) => ({
    id: `rp_${String(index + 1).padStart(3, "0")}`,
    scene: item.scene,
    title: item.title,
    refundWindowDays: item.refundWindowDays,
    whoPaysFreight: item.whoPaysFreight,
    conditions: item.conditions,
    steps: item.steps,
    exceptions: item.exceptions,
    version: item.version,
    effectiveFrom: daysAgo(item.effectiveDaysAgo),
  }));
}

/** 14 条 FAQ：命中次数不均，2 条草稿 */
function buildFaq() {
  const rows = [
    // 类目, 问题, 答案, 命中, 状态
    ["发货", "下单后多久发货？", "工作日 48 小时内发出，大促期间顺延至 72 小时；预售商品按详情页承诺时间发出。", 4820, "启用"],
    ["发货", "满多少包邮？", "全店满 99 元包邮，新疆、西藏、内蒙古等偏远地区满 129 元包邮。", 3960, "启用"],
    ["发货", "可以指定快递公司吗？", "默认顺丰/中通随机发货，备注指定需人工确认，偏远地区可能改为邮政EMS。", 1120, "启用"],
    ["售后", "食品拆封后还能退吗？", "食品拆封后不支持 7 天无理由退货；若出现异味、变质、异物，可按变质赔付流程处理。", 2680, "启用"],
    ["售后", "7 天无理由从哪天开始算？", "从快递签收当天 0 点开始计算 7 个自然日，未拆封且不影响二次销售可申请。", 2340, "启用"],
    ["售后", "漏发少发怎么处理？", "提供开箱照片或视频并保留面单，核实后优先补发；缺货则按单价退款，48 小时内发出补件。", 1870, "启用"],
    ["售后", "收到变质商品怎么赔付？", "拍照留证并提供批次号，经质检确认后按退一赔三执行，赔付金额不足 500 元按 500 元计算。", 1430, "启用"],
    ["优惠", "满减和直播间券能叠加吗？", "同类型券不可叠加，跨类型以系统计算的最优组合为准；免运费券可与满减券叠加。", 3120, "启用"],
    ["优惠", "优惠券为什么突然不能用了？", "可能是已过期、已达使用门槛或与当前活动互斥，可在「我的-优惠券」查看失效原因。", 1650, "启用"],
    ["优惠", "双11 预热券什么时候生效？", "预热券 11 月 1 日 0 点生效，可提前领取锁价，过期未使用自动作废。", 980, "草稿"],
    ["商品", "零食保质期多久？", "坚果炒货 180-240 天，肉干卤味 60-90 天，饼干糕点 45-120 天，果干蜜饯 270-365 天，详见包装。", 2140, "启用"],
    ["商品", "商品含有哪些过敏原？", "包装与详情页均标注过敏原，常见为坚果、花生、乳制品、麸质、大豆；坚果车间可能接触花生。", 1760, "启用"],
    ["会员", "会员积分怎么算？", "实付金额 1 元积 1 分，黑卡双倍积分；100 积分抵 1 元，单笔最多抵扣订单金额的 30%。", 1290, "启用"],
    ["会员", "黑卡会员有哪些权益？", "黑卡享 95 折、双倍积分、专属客服与优先发货，每月 1 张满 199 减 30 券。", 760, "草稿"],
  ];

  return rows.map((row, index) => {
    const [category, question, answer, hitCount, status] = row;
    return {
      id: `fq_${String(index + 1).padStart(3, "0")}`,
      category,
      question,
      answer,
      hitCount,
      status,
      updatedAt: hoursAgo(randInt(10, 400)),
    };
  });
}

/** 16 条物流轨迹：3 条异常（延误 18-36 小时） */
function buildLogistics(orders) {
  const statusPlan = [
    { orderId: "ord_001", status: "已签收", delayHours: 0, lastEvent: "快件已由本人签收，签收人：张**", eventHoursAgo: 96 },
    { orderId: "ord_002", status: "已签收", delayHours: 0, lastEvent: "快件已放至菜鸟驿站，取件码 3-2-1088", eventHoursAgo: 140 },
    { orderId: "ord_003", status: "已签收", delayHours: 0, lastEvent: "快件已由物业代收，感谢使用顺丰速运", eventHoursAgo: 190 },
    { orderId: "ord_005", status: "已签收", delayHours: 0, lastEvent: "快件已签收，如有问题请联系 95338", eventHoursAgo: 230 },
    { orderId: "ord_013", status: "已签收", delayHours: 0, lastEvent: "快件已由门卫代收", eventHoursAgo: 288 },
    { orderId: "ord_014", status: "已签收", delayHours: 0, lastEvent: "快件已签收，签收人：本人", eventHoursAgo: 300 },
    { orderId: "ord_015", status: "已签收", delayHours: 0, lastEvent: "快件已放至快递柜，取件码 8871", eventHoursAgo: 210 },
    { orderId: "ord_019", status: "已签收", delayHours: 0, lastEvent: "快件已签收", eventHoursAgo: 400 },
    { orderId: "ord_023", status: "已签收", delayHours: 0, lastEvent: "快件已由本人签收", eventHoursAgo: 120 },
    { orderId: "ord_009", status: "已签收", delayHours: 0, lastEvent: "快件已签收（退款单，包裹已退回）", eventHoursAgo: 168 },
    { orderId: "ord_004", status: "运输中", delayHours: 4, lastEvent: "快件已到达【上海转运中心】，正在分拣", eventHoursAgo: 6 },
    { orderId: "ord_006", status: "运输中", delayHours: 2, lastEvent: "快件已从【苏州分拨中心】发出", eventHoursAgo: 4 },
    { orderId: "ord_018", status: "派送中", delayHours: 0, lastEvent: "快递员正在派送，请保持电话畅通", eventHoursAgo: 2 },
    { orderId: "ord_007", status: "异常", delayHours: 28, lastEvent: "快件在【郑州中转站】滞留，等待重新调度", eventHoursAgo: 26 },
    { orderId: "ord_008", status: "异常", delayHours: 36, lastEvent: "收货地址异常，快件已退回网点待重新派送", eventHoursAgo: 30 },
    { orderId: "ord_020", status: "异常", delayHours: 18, lastEvent: "暴雨天气导致【沈阳】线路延误，预计顺延 1 天", eventHoursAgo: 18 },
  ];

  const carriers = ["顺丰速运", "中通快递", "圆通速递", "京东物流", "邮政EMS"];
  const statusToCarrierOffset = { 已签收: 0, 运输中: 2, 派送中: 3, 异常: 1 };

  return statusPlan.map((item, index) => {
    const order = orders.find((row) => row.id === item.orderId);
    const city = order.address.split("·")[0];
    const carrier = carriers[(index + statusToCarrierOffset[item.status]) % carriers.length];
    const lastEventAt = hoursAgo(item.eventHoursAgo);
    const estimatedArrival =
      item.status === "已签收" ? hoursAgo(item.eventHoursAgo) : hoursAhead(item.status === "异常" ? randInt(14, 48) : randInt(3, 30));

    return {
      id: `lgc_${String(index + 1).padStart(3, "0")}`,
      orderNo: order.orderNo,
      carrier,
      trackingNo: order.trackingNo ?? `${carrier.slice(0, 2)}${randInt(1000000000000, 9999999999999)}`,
      status: item.status,
      city,
      lastEvent: item.lastEvent,
      lastEventAt,
      estimatedArrival,
      delayHours: item.delayHours,
    };
  });
}

/* ========================================================================== */
/* 5. Skill 与 Tool                                                            */
/* ========================================================================== */

/** 8 个 Skill：key 必须与 src/lib/queries.ts 中的 intentToSkillKey 对齐 */
function buildSkills() {
  const plan = [
    {
      key: "refund_policy",
      name: "退款退货处理",
      description: "识别退货诉求，核对订单与售后政策，按拆封/变质/超时场景给出退款方案",
      category: "售后服务",
      status: "已上线",
      currentVersion: "v1.4.2",
      owner: "周敏",
      triggerExamples: ["东西不想要了能退吗", "饼干拆封了还能退吗", "收到有异味，要求退款"],
      tools: ["order_lookup", "knowledge_search", "refund_create"],
    },
    {
      key: "logistics_followup",
      name: "催发货与物流跟进",
      description: "查询订单与物流节点，判断延误时长，输出安抚话术并创建跟进任务",
      category: "物流跟进",
      status: "已上线",
      currentVersion: "v2.0.1",
      owner: "李佳",
      triggerExamples: ["下单三天了怎么还没发货", "物流三天没更新了", "显示签收但我没收到"],
      tools: ["order_lookup", "logistics_query", "ticket_handoff"],
    },
    {
      key: "coupon_consult",
      name: "优惠咨询",
      description: "解释券规则、叠加限制与最优下单组合，避免过度承诺",
      category: "营销转化",
      status: "已上线",
      currentVersion: "v1.2.3",
      owner: "王思远",
      triggerExamples: ["满199减30和直播间券能一起用吗", "我的券怎么不能用了", "双11 预热券现在能用吗"],
      tools: ["coupon_query", "knowledge_search"],
    },
    {
      key: "product_recommend",
      name: "商品咨询与推荐",
      description: "按口味、过敏原与预算推荐商品，回答保质期与成分问题",
      category: "售前咨询",
      status: "已上线",
      currentVersion: "v3.1.0",
      owner: "陈嘉禾",
      triggerExamples: ["有没有不甜又耐嚼的零食", "夏威夷果含花生成分吗", "草莓脆保质期多久"],
      tools: ["inventory_check", "knowledge_search", "order_lookup"],
    },
    {
      key: "address_change",
      name: "收货地址修改",
      description: "校验订单是否可改址，未发货直接修改，已发货引导联系承运商改派",
      category: "售后服务",
      status: "灰度中",
      currentVersion: "v1.0.4",
      owner: "王思远",
      triggerExamples: ["地址写错了要改", "能改到公司地址吗", "已经发货了还能改地址吗"],
      tools: ["order_lookup", "address_update"],
    },
    {
      key: "risk_guard",
      name: "投诉与风险合规",
      description: "识别情绪升级与职业打假风险，按合规话术回应并第一时间转人工",
      category: "风险合规",
      status: "已上线",
      currentVersion: "v2.2.0",
      owner: "周敏",
      triggerExamples: ["牛肉干有异味，我要十倍赔偿", "我要投诉到 12315", "你们标签不符合国标"],
      tools: ["sentiment_scan", "knowledge_search", "ticket_handoff"],
    },
    {
      key: "presale_consult",
      name: "售前咨询",
      description: "回答团购、礼盒与预售规则，引导留资与下单",
      category: "售前咨询",
      status: "草稿",
      currentVersion: "v0.3.0",
      owner: "李佳",
      triggerExamples: ["公司团购 50 份有优惠吗", "礼盒能开发票吗", "预售什么时候发货"],
      tools: ["inventory_check", "knowledge_search", "coupon_query"],
    },
    {
      key: "member_care",
      name: "会员权益关怀",
      description: "解答等级、积分与专属权益问题，提升复购与满意度",
      category: "售后服务",
      status: "灰度中",
      currentVersion: "v1.1.0",
      owner: "王思远",
      triggerExamples: ["积分能抵现金吗", "黑卡有哪些权益", "会员日什么时候"],
      tools: ["member_benefit", "knowledge_search", "coupon_query"],
    },
  ];

  return plan.map((item, index) => ({
    id: `skl_${String(index + 1).padStart(3, "0")}`,
    ...item,
    updatedAt: hoursAgo(randInt(6, 200)),
  }));
}

/** 10 个 Tool：写操作 requiresConfirm = true */
function buildTools() {
  const plan = [
    ["order_lookup", "订单查询", "按订单号/手机号查询订单状态与明细", "查询", "低", "可用", 180, 0.997, 4820, false],
    ["logistics_query", "物流轨迹查询", "查询承运商最新节点与预计到达时间", "查询", "低", "可用", 320, 0.982, 3910, false],
    ["refund_create", "创建退款单", "在售后系统创建退款单并回写订单状态", "写操作", "高", "可用", 640, 0.913, 486, true],
    ["coupon_query", "优惠券查询", "查询用户名下可用/失效券及叠加规则", "查询", "低", "可用", 150, 0.994, 2740, false],
    ["inventory_check", "库存校验", "校验 SKU 实时库存与预售可售量", "查询", "中", "可用", 260, 0.968, 2160, false],
    ["address_update", "修改收货地址", "在未发货订单上修改收货地址", "写操作", "中", "可用", 430, 0.902, 318, true],
    ["member_benefit", "会员权益查询", "查询会员等级、积分与可用权益", "查询", "低", "维护中", 780, 0.861, 640, false],
    ["ticket_handoff", "转人工交接", "生成交接单并通知人工坐席", "通知", "中", "可用", 210, 0.999, 1580, false],
    ["sentiment_scan", "情绪识别", "识别用户情绪强度与升级风险", "计算", "低", "可用", 95, 0.986, 5230, false],
    ["knowledge_search", "知识检索", "检索 FAQ、退货政策与商品知识", "查询", "低", "可用", 240, 0.973, 6120, false],
  ];

  return plan.map((row, index) => {
    const [key, name, description, type, riskLevel, status, avgLatencyMs, successRate, calls7d, requiresConfirm] = row;
    return {
      id: `tl_${String(index + 1).padStart(3, "0")}`,
      key,
      name,
      description,
      type,
      riskLevel,
      status,
      avgLatencyMs,
      successRate,
      calls7d,
      requiresConfirm,
    };
  });
}

/** 每个 Tool 一条运行时配置，requireConfirm 与 tools.json 保持一致 */
function buildToolConfigs(tools) {
  const rules = {
    order_lookup: { timeoutMs: 2000, maxRetries: 1, rateLimitPerMin: 600, env: "production", note: "高频只读工具，超时后降级为「请提供订单号」话术" },
    logistics_query: { timeoutMs: 3000, maxRetries: 2, rateLimitPerMin: 300, env: "production", note: "承运商接口偶发超时，允许 2 次重试后转人工" },
    refund_create: { timeoutMs: 8000, maxRetries: 0, rateLimitPerMin: 60, env: "production", note: "写操作必须二次确认，金额超 500 元强制转人工复核" },
    coupon_query: { timeoutMs: 1500, maxRetries: 1, rateLimitPerMin: 600, env: "production", note: "只读且响应快，作为优惠咨询的首选工具" },
    inventory_check: { timeoutMs: 2500, maxRetries: 2, rateLimitPerMin: 300, env: "production", note: "预售商品库存波动大，失败时以商品页展示为准" },
    address_update: { timeoutMs: 5000, maxRetries: 1, rateLimitPerMin: 120, env: "production", note: "仅发货前 30 分钟内自动放行，其余场景走人工改派" },
    member_benefit: { timeoutMs: 4000, maxRetries: 2, rateLimitPerMin: 120, env: "sandbox", note: "会员中心接口升级中，暂时读取沙箱数据，禁止对外承诺积分" },
    ticket_handoff: { timeoutMs: 3000, maxRetries: 2, rateLimitPerMin: 240, env: "production", note: "交接失败会阻塞转人工，必须保证最终成功" },
    sentiment_scan: { timeoutMs: 1500, maxRetries: 0, rateLimitPerMin: 900, env: "production", note: "轻量计算工具，失败即跳过，不影响主链路" },
    knowledge_search: { timeoutMs: 2000, maxRetries: 2, rateLimitPerMin: 900, env: "production", note: "知识库命中率下降会直接拉低解决率，重点关注" },
  };

  return tools.map((tool, index) => {
    const rule = rules[tool.key];
    return {
      id: `tc_${String(index + 1).padStart(3, "0")}`,
      toolKey: tool.key,
      enabled: tool.status !== "已停用",
      timeoutMs: rule.timeoutMs,
      maxRetries: rule.maxRetries,
      rateLimitPerMin: rule.rateLimitPerMin,
      requireConfirm: tool.requiresConfirm,
      env: rule.env,
      updatedAt: hoursAgo(randInt(2, 120)),
      note: rule.note,
    };
  });
}

/** 14 条 Skill 版本流水，覆盖 8 个 Skill */
function buildSkillVersions() {
  const plan = [
    // skillKey, 版本, 状态, 评测分, 发布时间(天前, null=未发布), 作者, changelog, promptTokens, 回归标记
    ["refund_policy", "v1.4.2", "线上", 88.5, 9, "周敏", "补充临期商品退款话术，收紧 500 元以上退款的自动放行阈值", 2860, false],
    ["refund_policy", "v1.5.0-rc1", "候选", 91.2, null, "陈嘉禾", "新增变质赔付分级话术，refund_create 前强制二次确认", 3120, false],
    ["logistics_followup", "v2.0.1", "线上", 86.4, 18, "李佳", "延误 24 小时以上的安抚话术改为三段式，补充补偿券口径", 2140, false],
    ["logistics_followup", "v2.1.0-rc1", "候选", 89.7, null, "李佳", "接入承运商节点映射表，异常件自动生成跟进任务（存在 1 个回归）", 2380, true],
    ["coupon_consult", "v1.2.3", "线上", 82.6, 22, "王思远", "补充直播间券与满减券的互斥规则，避免过度承诺", 1860, false],
    ["coupon_consult", "v1.3.0", "候选", 84.9, null, "王思远", "支持按活动优先级推荐最优券组合", 2050, false],
    ["product_recommend", "v3.0.2", "已回滚", 76.3, 35, "陈嘉禾", "重构口味标签召回逻辑，上线后推荐相关性下降已回滚", 3420, true],
    ["product_recommend", "v3.1.0", "线上", 90.1, 11, "陈嘉禾", "回滚口味标签召回，改为「品类 + 过敏原」双过滤", 3280, false],
    ["address_change", "v1.0.4", "候选", 85.2, null, "王思远", "发货前 30 分钟内地址修改自动放行，灰度 10% 流量", 1460, false],
    ["risk_guard", "v2.2.0", "线上", 92.4, 14, "周敏", "补充职业打假识别规则与合规话术，禁止超权限承诺", 3680, false],
    ["risk_guard", "v2.3.0-rc1", "草稿", 79.8, null, "周敏", "引入情绪升级二级预警，尚未完成评测", 3920, false],
    ["presale_consult", "v0.3.0", "草稿", 62.7, null, "李佳", "首版售前问答草稿，覆盖礼盒与团购场景", 1280, false],
    ["member_care", "v1.1.0", "线上", 87.0, 26, "王思远", "积分抵扣与黑卡专属客服话术", 2240, false],
    ["member_care", "v1.2.0", "候选", 89.3, null, "王思远", "会员日权益自动播报，接入 member_benefit 工具", 2410, false],
  ];

  return plan.map((row, index) => {
    const [skillKey, version, status, evalScore, publishedDaysAgo, author, changelog, promptTokens, regression] = row;
    return {
      id: `sv_${String(index + 1).padStart(3, "0")}`,
      skillKey,
      version,
      status,
      changelog,
      promptTokens,
      publishedAt: publishedDaysAgo === null ? null : daysAgo(publishedDaysAgo),
      author,
      evalScore,
      regression,
    };
  });
}

/* ========================================================================== */
/* 6. 工单                                                                     */
/* ========================================================================== */

/** 意图 → Skill 的映射，和 src/lib/queries.ts 的 intentToSkillKey 保持一致 */
const INTENT_SKILL = {
  催发货: "logistics_followup",
  物流异常: "logistics_followup",
  退款退货: "refund_policy",
  优惠咨询: "coupon_consult",
  商品咨询: "product_recommend",
  改地址: "address_change",
  投诉: "risk_guard",
};

/** 20 条工单：覆盖 7 种意图、5 种状态，创建时间落在最近 3 天；SLA 按优先级给不同时长 */
function buildTickets(users, orders) {
  const orderOf = (orderId) => (orderId ? orders.find((order) => order.id === orderId) : null);

  const plan = [
    // 用户, 订单, 渠道, 意图, 优先级, 状态, 处理人, 摘要, 创建(小时前), 首次响应(分钟, null=未响应), SLA(小时)
    [1, "ord_004", "小程序", "催发货", "高", "待处理", null, "下单三天了还没发货，麻烦帮忙催一下仓库", 69, 34, 6],
    [2, "ord_001", "小程序", "退款退货", "中", "处理中", "王思远", "曲奇收到时盒子压瘪了，想整单退掉", 66, 12, 72],
    [11, "ord_008", "APP", "投诉", "紧急", "已升级", null, "牛肉干有异味，要求十倍赔偿否则投诉到 12315", 63, 4, 4],
    [0, null, "小程序", "优惠咨询", "低", "已解决", null, "满199减30和直播间券能一起用吗", 60, 8, 72],
    [6, "ord_018", "直播间", "物流异常", "高", "处理中", "李佳", "物流三天没更新了，是不是丢件了", 57, 16, 12],
    [9, "ord_012", "小程序", "改地址", "中", "待处理", null, "刚下单写错地址了，能改到公司吗", 54, null, 72],
    [4, "ord_007", "APP", "退款退货", "中", "已接管", "周敏", "坚果吃着发苦，申请退款", 50, 22, 24],
    [7, null, "社群", "商品咨询", "低", "已解决", null, "夏威夷果是原味还是带壳的？", 46, 6, 72],
    [10, "ord_016", "小程序", "催发货", "中", "待处理", null, "预售的什么时候发？都等一周了", 42, null, 12],
    [8, "ord_023", "电话", "物流异常", "紧急", "已升级", null, "快递显示签收但我没收到，包裹可能丢了", 38, 3, 6],
    [5, "ord_022", "小程序", "退款退货", "中", "处理中", null, "拍重复了想取消，已经取消的订单会退款吗", 34, 18, 48],
    [7, null, "直播间", "商品咨询", "低", "已解决", null, "黑巧是代可可脂吗？", 30, 5, 72],
    [11, "ord_020", "APP", "投诉", "高", "已接管", "陈嘉禾", "上次退款到现在还没到账，要给个说法", 26, 41, 72],
    [1, null, "小程序", "优惠咨询", "低", "待处理", null, "双11 预热券现在能领吗", 22, null, 48],
    [9, "ord_012", "小程序", "催发货", "中", "待处理", null, "新人首单三天没发货，麻烦看下", 18, null, 48],
    [0, "ord_016", "APP", "改地址", "高", "处理中", "王思远", "地址填错小区，麻烦改成隔壁小区", 14, 9, 12],
    [3, "ord_013", "小程序", "退款退货", "低", "已解决", null, "礼盒少了一包奶昔粉，能补发吗", 10, 7, 72],
    [4, "ord_021", "直播间", "催发货", "中", "处理中", null, "下单两天还没发货，急用", 7, 15, 24],
    [7, null, "社群", "商品咨询", "中", "已解决", null, "草莓脆保质期多久，开封后怎么保存", 4, 11, 24],
    [2, null, "小程序", "优惠咨询", "中", "已升级", null, "会员积分能抵现金吗，活动规则在哪看", 2, 26, 24],
  ];

  return plan.map((row, index) => {
    const [userIndex, orderId, channel, intent, priority, status, assignee, summary, createdHoursAgo, firstResponseMinutes, slaHours] = row;
    const order = orderOf(orderId);
    const createdAt = hoursAgo(createdHoursAgo);
    const slaDueAt = isoAt(new Date(createdAt).getTime() + slaHours * HOUR);
    const responseCap = Math.max(1, createdHoursAgo * 60 - 5);

    return {
      id: `tkt_${String(index + 1).padStart(3, "0")}`,
      code: makeTicketCode(createdAt, 1 + index * 3),
      userId: users[userIndex].id,
      orderNo: order ? order.orderNo : null,
      channel,
      intent,
      priority,
      status,
      assignee,
      summary,
      createdAt,
      slaDueAt,
      firstResponseMinutes: firstResponseMinutes === null ? null : Math.min(firstResponseMinutes, responseCap),
    };
  });
}

/* ========================================================================== */
/* 7. 运行记录                                                                 */
/* ========================================================================== */

/** 每个 Skill 的链路步骤模板；步骤会按条数裁剪，最后统一按运行状态改标记 */
const RUN_STEP_TEMPLATES = {
  refund_policy: [
    { name: "解析退货诉求", tool: null },
    { name: "查询订单详情", tool: "order_lookup" },
    { name: "匹配退货政策", tool: "knowledge_search" },
    { name: "创建退款单", tool: "refund_create" },
    { name: "生成回复", tool: null },
  ],
  logistics_followup: [
    { name: "识别催发货意图", tool: null },
    { name: "查询订单物流", tool: "logistics_query" },
    { name: "判断延误时长", tool: "sentiment_scan" },
    { name: "准备交接单", tool: "ticket_handoff" },
    { name: "生成安抚话术", tool: null },
  ],
  coupon_consult: [
    { name: "识别优惠意图", tool: null },
    { name: "查询可用券", tool: "coupon_query" },
    { name: "校验叠加规则", tool: "knowledge_search" },
    { name: "生成回复", tool: null },
  ],
  product_recommend: [
    { name: "识别商品意图", tool: null },
    { name: "检索商品库", tool: "inventory_check" },
    { name: "召回知识条目", tool: "knowledge_search" },
    { name: "生成推荐话术", tool: null },
  ],
  address_change: [
    { name: "校验订单状态", tool: "order_lookup" },
    { name: "修改收货地址", tool: "address_update" },
    { name: "回复确认", tool: null },
  ],
  risk_guard: [
    { name: "情绪识别", tool: "sentiment_scan" },
    { name: "命中风险规则", tool: "knowledge_search" },
    { name: "准备交接工单", tool: "ticket_handoff" },
    { name: "输出合规话术", tool: null },
  ],
  presale_consult: [
    { name: "识别售前意图", tool: null },
    { name: "查询商品库存", tool: "inventory_check" },
    { name: "生成推荐话术", tool: null },
  ],
  member_care: [
    { name: "查询会员等级", tool: "member_benefit" },
    { name: "核对积分规则", tool: "knowledge_search" },
    { name: "生成权益话术", tool: null },
  ],
};

const FAILURE_REASONS = [
  "退款金额超过阈值，已转人工",
  "工具调用连续失败，已发送兜底话术",
  "知识库无命中，澄清轮次超限",
  "用户诉求超出 Skill 边界，无法闭环",
];

const TIMEOUT_REASONS = [
  "物流接口 8s 未返回，请求超时",
  "模型响应超时，已发送兜底话术",
  "链路总耗时超过 15s，转人工处理",
];

const HANDOFF_REASONS = [
  "退款金额超过阈值，已转人工",
  "投诉升级，已交接售后主管",
  "黑卡用户要求人工客服",
  "情绪识别为高度负面，主动接管",
];

const RATED_COMMENTS = {
  成功: {
    准确性: ["政策条款引用准确，金额算得对", "库存与保质期信息核对无误", "券规则解释清楚，没有过度承诺"],
    语气: ["语气自然，像真人客服", "安抚到位，没有模板味", "称呼得体，结尾主动跟进"],
    效率: ["两轮内给到方案，响应很快", "一次命中知识库，链路干净", "耗时低于 3 秒，体验流畅"],
    合规: ["未承诺超权限赔付，符合规范", "退款话术与政策版本一致", "风险提示到位，没有越界承诺"],
  },
  已接管: {
    准确性: ["转人工判断正确，但前置信息收集不足", "金额判断有偏差，靠人工纠正"],
    语气: ["转人工前的安抚偏生硬", "用户情绪未被接住就转人工"],
    效率: ["转人工链路耗时偏长", "多轮澄清后才交接"],
    合规: ["高金额退款转人工，合规处理正确", "投诉场景未做超权限承诺，符合要求"],
  },
  失败: {
    准确性: ["政策版本引用错误，导致方案不可执行", "金额计算错误，超出阈值仍尝试自动退款"],
    语气: ["兜底话术过于机械，用户明显不满", "答非所问，用户重复提问三次"],
    效率: ["链路重试两次后仍失败", "十秒无响应，用户已离开会话"],
    合规: ["险些承诺十倍赔偿，属合规风险", "未识别职业打假风险，需复盘"],
  },
  超时: {
    准确性: ["超时前只拿到部分信息", "未返回任何有效结论"],
    语气: ["超时兜底话术尚可", "超时后无任何提示，体验差"],
    效率: ["工具超时导致链路中断", "模型响应超过 12s"],
    合规: ["超时转人工，处理方式合规"],
  },
};

/** 40 条运行：最近 3 天 20 条（与工单关联），其余 20 条分散在 3-14 天 */
function buildRuns(tickets, skills) {
  const skillKeys = skills.map((skill) => skill.key);
  const channels = ["小程序", "APP", "直播间", "电话", "社群"];
  /* 与工单关联的运行状态：工单已被接管的运行必然也是接管态 */
  const ticketStatusOverride = {
    tkt_003: "失败",
    tkt_007: "已接管",
    tkt_010: "超时",
    tkt_013: "已接管",
  };

  const draft = [];

  // 1) 与工单关联的 20 条运行：时间 = 工单创建后 20-240 分钟
  for (const ticket of tickets) {
    const skillKey = INTENT_SKILL[ticket.intent] ?? pick(skillKeys);
    const startedMs = Math.min(
      new Date(ticket.createdAt).getTime() + randInt(20, 240) * MINUTE,
      NOW_MS - randInt(3, 60) * MINUTE,
    );
    draft.push({
      ticketId: ticket.id,
      channel: ticket.channel,
      skillKey,
      status: ticketStatusOverride[ticket.id] ?? "成功",
      startedAt: isoAt(startedMs),
    });
  }

  // 2) 无工单的 20 条运行：分散在 3-14 天前，状态按固定序列打散
  const unlinkedStatuses = [
    "成功", "成功", "失败", "成功", "超时",
    "成功", "成功", "已接管", "成功", "成功",
    "成功", "失败", "成功", "超时", "成功",
    "成功", "成功", "超时", "已接管", "失败",
  ];
  // 3-14 天前每天至少 1 条，保证 14 天趋势图不断档；剩余 9 条随机补量
  const unlinkedStarts = [];
  for (let day = 13; day >= 3; day -= 1) unlinkedStarts.push(localDaysAgo(day, randInt(9, 21), randInt(0, 59)));
  for (let i = 0; i < 9; i += 1) unlinkedStarts.push(localDaysAgo(randInt(3, 13), randInt(9, 21), randInt(0, 59)));
  unlinkedStarts.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  unlinkedStarts.forEach((startedAt, index) => {
    draft.push({
      ticketId: null,
      channel: pick(channels),
      skillKey: pick(skillKeys),
      status: unlinkedStatuses[index],
      startedAt,
    });
  });

  // 3) 按开始时间升序排列后生成 id，便于看板按时间读
  draft.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  return draft.map((item, index) => {
    const template = RUN_STEP_TEMPLATES[item.skillKey];
    const stepCount = Math.min(template.length, randInt(2, 5));
    const steps = template.slice(0, stepCount).map((step) => ({
      name: step.name,
      tool: step.tool,
      status: "成功",
      ms: randInt(150, 2400),
    }));

    if (item.status === "失败") {
      steps[steps.length - 1].status = "失败";
    } else if (item.status === "超时") {
      steps[steps.length - 1].status = "跳过";
      if (steps.length >= 2) steps[steps.length - 2].status = "失败";
    } else if (item.status === "已接管") {
      steps[steps.length - 1].status = "跳过";
    }

    const stepMs = steps.reduce((total, step) => total + step.ms, 0);
    const latencyMs = item.status === "超时"
      ? clamp(Math.max(stepMs + randInt(200, 800), 12000), 12000, 15000)
      : clamp(stepMs + randInt(180, 900), 900, 15000);

    // 每 7 条运行安排一次长上下文，让成本分布更真实
    const tokensIn = index % 7 === 3 ? randInt(6800, 11800) : randInt(1100, 3600);
    const tokensOut = index % 5 === 0 ? randInt(600, 1400) : randInt(180, 720);
    const costYuan = r4(clamp(tokensIn * 3.5e-6 + tokensOut * 1.8e-5, 0.002, 0.08));

    let fallbackReason = null;
    if (item.status === "失败") fallbackReason = FAILURE_REASONS[index % FAILURE_REASONS.length];
    else if (item.status === "超时") fallbackReason = TIMEOUT_REASONS[index % TIMEOUT_REASONS.length];
    else if (item.status === "已接管") fallbackReason = HANDOFF_REASONS[index % HANDOFF_REASONS.length];

    let satisfaction = null;
    if (item.status === "成功") satisfaction = pick([5, 5, 4, 5, 4, 3]);
    else if (item.status === "已接管") satisfaction = pick([1, 2, null, null, 3]);
    else if (item.status === "超时") satisfaction = pick([1, 2, null, null]);
    else if (item.status === "失败") satisfaction = pick([1, 2, null]);

    return {
      id: `run_${String(index + 1).padStart(3, "0")}`,
      traceId: makeTraceId(),
      ticketId: item.ticketId,
      channel: item.channel,
      skillKey: item.skillKey,
      status: item.status,
      latencyMs,
      tokensIn,
      tokensOut,
      costYuan,
      plannerSteps: Math.min(6, steps.length + randInt(0, 1)),
      retries: pick([0, 0, 0, 1, 1, 2]),
      startedAt: item.startedAt,
      steps,
      fallbackReason,
      satisfaction,
    };
  });
}

/* ========================================================================== */
/* 8. 评分、标注与改进项                                                        */
/* ========================================================================== */

/** 24 条评分：与运行状态呼应，整体偏向正向 */
function buildRatings(runs) {
  const dimensions = ["准确性", "语气", "效率", "合规"];
  const reviewers = ["质检-王思远", "质检-周敏", "组长-李佳", "运营-陈嘉禾", "客服主管-赵宁"];
  const candidates = shuffle(runs.map((_, index) => index)).slice(0, 24).sort((a, b) => a - b);

  return candidates.map((runIndex, index) => {
    const run = runs[runIndex];
    const dimension = dimensions[index % dimensions.length];
    let score;
    if (run.status === "成功") score = pick([5, 5, 5, 4, 4, 3]);
    else if (run.status === "已接管") score = pick([3, 4, 3, 2]);
    else if (run.status === "超时") score = pick([3, 2, 3]);
    else score = pick([1, 1, 2]);

    const commentPool = RATED_COMMENTS[run.status][dimension] ?? ["整体表现正常"];
    const createdAt = isoAt(Math.min(new Date(run.startedAt).getTime() + randInt(30, 700) * MINUTE, NOW_MS - randInt(2, 90) * MINUTE));

    return {
      id: `rat_${String(index + 1).padStart(3, "0")}`,
      runId: run.id,
      score,
      dimension,
      comment: pick(commentPool),
      reviewer: reviewers[index % reviewers.length],
      createdAt,
    };
  });
}

/** 16 条标注：run / skill_version / eval_case / ticket 混合 */
function buildAnnotations(runs, skillVersions, evalCases, tickets) {
  const failed = runs.filter((run) => run.status === "失败");
  const timeout = runs.filter((run) => run.status === "超时");
  const handedOver = runs.filter((run) => run.status === "已接管");
  const good = runs.filter((run) => run.status === "成功" && (run.satisfaction ?? 0) >= 4);

  const versionByKey = (skillKey, version) =>
    skillVersions.find((item) => item.skillKey === skillKey && item.version === version) ?? skillVersions[0];

  const plan = [
    { targetType: "run", targetId: failed[0].id, tag: "坏案例", note: "退款金额 899 元仍直接调用 refund_create，未按 500 元阈值转人工，需在 Skill 侧加硬校验", author: "周敏" },
    { targetType: "run", targetId: good[0].id, tag: "好案例", note: "先核对签收时间再解释 7 天无理由，运费归属说得清楚，可直接作为标准回复样例", author: "李佳" },
    { targetType: "run", targetId: handedOver[0].id, tag: "待优化", note: "转人工前没有收集批次号与照片，人工坐席重复问询，建议前置信息收集", author: "王思远" },
    { targetType: "run", targetId: timeout[0].id, tag: "坏案例", note: "物流接口超时后台没有发出任何兜底提示，用户等待 15 秒后离开会话", author: "陈嘉禾" },
    { targetType: "run", targetId: good[1]?.id ?? good[0].id, tag: "好案例", note: "过敏原回答准确并主动提示生产线可能接触花生，合规表述到位", author: "周敏" },
    { targetType: "run", targetId: handedOver[1]?.id ?? handedOver[0].id, tag: "合规风险", note: "投诉场景中出现了「十倍赔偿」字样，属于超权限承诺，必须整改", author: "周敏" },
    { targetType: "skill_version", targetId: versionByKey("refund_policy", "v1.5.0-rc1").id, tag: "待优化", note: "候选版本把赔付条款写进了系统提示，但未同步退货政策 v3.0 的例外项", author: "王思远" },
    { targetType: "skill_version", targetId: versionByKey("risk_guard", "v2.3.0-rc1").id, tag: "合规风险", note: "二级预警规则尚未经过合规评审，禁止进入灰度", author: "周敏" },
    { targetType: "skill_version", targetId: versionByKey("address_change", "v1.0.4").id, tag: "待优化", note: "改址放行窗口按 30 分钟写死，建议改为读取仓库截单时间", author: "李佳" },
    { targetType: "skill_version", targetId: versionByKey("member_care", "v1.2.0").id, tag: "知识缺口", note: "缺少会员日与积分抵扣冲突时的解释话术，知识库需补条目", author: "陈嘉禾" },
    { targetType: "eval_case", targetId: evalCases[1].id, tag: "知识缺口", note: "「食品拆封不退」的例外场景在知识库只有一句话，建议补充 3 个典型场景", author: "李佳" },
    { targetType: "eval_case", targetId: evalCases[10].id, tag: "待优化", note: "断言只校验了生效时间，未校验「锁价」口径，容易漏判", author: "王思远" },
    { targetType: "eval_case", targetId: evalCases[16].id, tag: "好案例", note: "赔偿标准断言覆盖了金额与权限两条硬约束，建议作为模板复用", author: "周敏" },
    { targetType: "ticket", targetId: tickets[2].id, tag: "合规风险", note: "用户提到 12315，工单已升级但未同步法务，需补齐升级路径", author: "周敏" },
    { targetType: "ticket", targetId: tickets[11].id, tag: "好案例", note: "代可可脂的提问回答得干脆，没有含糊其辞", author: "陈嘉禾" },
    { targetType: "ticket", targetId: tickets[18].id, tag: "知识缺口", note: "开封后保存方式在 FAQ 里没有条目，客服只能凭经验回答", author: "李佳" },
  ];

  // 标注时间必须晚于被标注对象的时间，避免出现「先标注后发生」
  const timeOf = (item) => {
    if (item.targetType === "run") {
      const run = runs.find((row) => row.id === item.targetId);
      return new Date(run.startedAt).getTime() + randInt(20, 500) * MINUTE;
    }
    if (item.targetType === "ticket") {
      const ticket = tickets.find((row) => row.id === item.targetId);
      return new Date(ticket.createdAt).getTime() + randInt(10, 300) * MINUTE;
    }
    if (item.targetType === "skill_version") {
      const version = skillVersions.find((row) => row.id === item.targetId);
      const base = version.publishedAt ? new Date(version.publishedAt).getTime() : NOW_MS - 4 * DAY;
      return base + randInt(60, 2000) * MINUTE;
    }
    const target = evalCases.find((row) => row.id === item.targetId);
    return new Date(target.updatedAt).getTime() + randInt(60, 2000) * MINUTE;
  };

  return plan.map((item, index) => {
    const createdAt = isoAt(Math.min(timeOf(item), NOW_MS - 5 * MINUTE));
    return {
      id: `ann_${String(index + 1).padStart(3, "0")}`,
      targetType: item.targetType,
      targetId: item.targetId,
      tag: item.tag,
      note: item.note,
      author: item.author,
      createdAt,
    };
  });
}

/** 12 条改进项：从 badcase/评分/标注/评测流转到上线 */
function buildImprovements(runs, skills) {
  const failed = runs.filter((run) => run.status === "失败");
  const handedOver = runs.filter((run) => run.status === "已接管");
  const timeout = runs.filter((run) => run.status === "超时");
  const linked = (pool, count) => pool.slice(0, count).map((run) => run.id);

  const plan = [
    {
      title: "退款金额超 500 元强制二次确认",
      source: "badcase",
      skillKey: "refund_policy",
      priority: "P0",
      status: "进行中",
      owner: "周敏",
      expectedGain: "预计减少 18% 的重复追问",
      createdDaysAgo: 6,
      dueInDays: 6,
      linkedRuns: linked(failed, 2),
    },
    {
      title: "物流接口超时的兜底话术与自动重试",
      source: "badcase",
      skillKey: "logistics_followup",
      priority: "P0",
      status: "已排期",
      owner: "李佳",
      expectedGain: "预计把超时导致的人工接管率从 12% 降到 5%",
      createdDaysAgo: 8,
      dueInDays: 9,
      linkedRuns: linked(timeout, 2),
    },
    {
      title: "过敏原话术补充「生产线可能接触花生」提示",
      source: "annotation",
      skillKey: "product_recommend",
      priority: "P1",
      status: "已上线",
      owner: "陈嘉禾",
      expectedGain: "预计减少 30% 的过敏原追问",
      createdDaysAgo: 12,
      dueInDays: 3,
      linkedRuns: linked(handedOver, 1),
    },
    {
      title: "投诉场景禁止出现具体赔偿倍数",
      source: "annotation",
      skillKey: "risk_guard",
      priority: "P0",
      status: "进行中",
      owner: "周敏",
      expectedGain: "预计降低 90% 的合规越权风险",
      createdDaysAgo: 4,
      dueInDays: 5,
      linkedRuns: linked(handedOver, 2),
    },
    {
      title: "优惠券叠加规则结构化，减少多轮澄清",
      source: "rating",
      skillKey: "coupon_consult",
      priority: "P1",
      status: "已排期",
      owner: "王思远",
      expectedGain: "预计减少 22% 的重复追问",
      createdDaysAgo: 9,
      dueInDays: 12,
      linkedRuns: [],
    },
    {
      title: "改址放行窗口改为读取仓库截单时间",
      source: "annotation",
      skillKey: "address_change",
      priority: "P1",
      status: "待评估",
      owner: "李佳",
      expectedGain: "预计提升 15% 的改址一次成功率",
      createdDaysAgo: 3,
      dueInDays: 15,
      linkedRuns: [],
    },
    {
      title: "会员积分抵扣话术补齐冲突场景",
      source: "eval",
      skillKey: "member_care",
      priority: "P2",
      status: "待评估",
      owner: "王思远",
      expectedGain: "预计减少 12% 的积分重复咨询",
      createdDaysAgo: 2,
      dueInDays: 18,
      linkedRuns: [],
    },
    {
      title: "售前团购阶梯价知识条目补齐",
      source: "eval",
      skillKey: "presale_consult",
      priority: "P2",
      status: "已驳回",
      owner: "李佳",
      expectedGain: "预计带来 5% 的团购留资提升",
      createdDaysAgo: 11,
      dueInDays: 7,
      linkedRuns: [],
    },
    {
      title: "情绪升级二级预警接入风控看板",
      source: "rating",
      skillKey: "risk_guard",
      priority: "P1",
      status: "进行中",
      owner: "周敏",
      expectedGain: "预计把高风险投诉的响应时间缩短 40%",
      createdDaysAgo: 5,
      dueInDays: 10,
      linkedRuns: linked(handedOver, 1),
    },
    {
      title: "催发货场景前置收集订单号，减少一轮追问",
      source: "badcase",
      skillKey: "logistics_followup",
      priority: "P2",
      status: "已上线",
      owner: "李佳",
      expectedGain: "预计减少 14% 的会话轮次",
      createdDaysAgo: 15,
      dueInDays: 2,
      linkedRuns: linked(failed, 1),
    },
    {
      title: "退货政策 v3.0 例外项同步进 Skill 提示词",
      source: "annotation",
      skillKey: "refund_policy",
      priority: "P1",
      status: "已排期",
      owner: "王思远",
      expectedGain: "预计减少 9% 的政策口径不一致",
      createdDaysAgo: 7,
      dueInDays: 8,
      linkedRuns: [],
    },
    {
      title: "商品推荐增加「不甜/耐嚼」口味标签映射",
      source: "rating",
      skillKey: "product_recommend",
      priority: "P2",
      status: "待评估",
      owner: "陈嘉禾",
      expectedGain: "预计提升 8% 的推荐点击率",
      createdDaysAgo: 1,
      dueInDays: 20,
      linkedRuns: [],
    },
  ];

  const skillKeys = new Set(skills.map((skill) => skill.key));

  return plan.map((item, index) => {
    if (!skillKeys.has(item.skillKey)) throw new Error(`改进项引用了不存在的 Skill：${item.skillKey}`);
    return {
      id: `imp_${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      source: item.source,
      skillKey: item.skillKey,
      priority: item.priority,
      status: item.status,
      owner: item.owner,
      expectedGain: item.expectedGain,
      createdAt: daysAgo(item.createdDaysAgo),
      dueAt: daysAhead(item.dueInDays),
      linkedRuns: item.linkedRuns,
    };
  });
}

/* ========================================================================== */
/* 9. 评测与实验                                                               */
/* ========================================================================== */

/** 20 条评测用例，覆盖全部 8 个 Skill */
function buildEvalCases() {
  const plan = [
    {
      name: "退款-未拆封 7 天无理由",
      skillKey: "refund_policy",
      intent: "退款退货",
      input: "我上周买的坚果还没拆封，能退吗？",
      expected: "确认签收时间在 7 天内且包装未拆封，按 7 天无理由流程处理并说明运费由买家承担",
      assertions: ["必须引用退货政策 v3.1", "必须说明运费由买家承担", "不得承诺 48 小时内到账"],
      difficulty: "易",
      source: "人工编写",
      status: "启用",
      tags: ["退货", "时效"],
    },
    {
      name: "退款-拆封食品",
      skillKey: "refund_policy",
      intent: "退款退货",
      input: "饼干我已经拆开吃了两包，觉得不好吃想退",
      expected: "说明食品拆封后不支持无理由退货，并给出变质/异味等例外场景的处理方式",
      assertions: ["必须复述「食品拆封不退」", "必须给出至少一个例外场景", "语气不得生硬"],
      difficulty: "中",
      source: "线上回流",
      status: "启用",
      tags: ["拆封", "食品"],
    },
    {
      name: "退款-超过 7 天",
      skillKey: "refund_policy",
      intent: "退款退货",
      input: "上个月买的牛肉干还能退吗",
      expected: "告知已超出 7 天无理由时效，若为质量问题可按 30 天变质赔付标准受理",
      assertions: ["必须说明已超过 7 天", "必须提供质量问题的兜底通道"],
      difficulty: "中",
      source: "标注产出",
      status: "启用",
      tags: ["超时", "兜底"],
    },
    {
      name: "退款-金额超阈值",
      skillKey: "refund_policy",
      intent: "退款退货",
      input: "这单 899 元想全退，直接给我退了吧",
      expected: "识别金额超过 500 元阈值，说明需要人工复核后再创建退款单",
      assertions: ["必须识别 500 元阈值", "必须转人工复核", "不得直接调用 refund_create"],
      difficulty: "难",
      source: "线上回流",
      status: "启用",
      tags: ["阈值", "转人工"],
    },
    {
      name: "催发货-大促延迟",
      skillKey: "logistics_followup",
      intent: "催发货",
      input: "双11 买的什么时候发？都三天了",
      expected: "说明大促期间 72 小时内发货，查询订单实际状态并给出最晚发货时间",
      assertions: ["必须引用大促发货时效", "必须查询订单状态"],
      difficulty: "易",
      source: "人工编写",
      status: "启用",
      tags: ["大促", "时效"],
    },
    {
      name: "催发货-预售商品",
      skillKey: "logistics_followup",
      intent: "催发货",
      input: "预售的奶昔粉到底哪天发",
      expected: "按预售页面承诺的发货口径回复，并提供预售单查询路径",
      assertions: ["必须区分预售与现货", "必须给出查询路径"],
      difficulty: "中",
      source: "人工编写",
      status: "启用",
      tags: ["预售"],
    },
    {
      name: "物流异常-超 24 小时未更新",
      skillKey: "logistics_followup",
      intent: "物流异常",
      input: "物流三天没动了，是丢件了吗",
      expected: "查询最新节点，说明延误时长与预计到达时间，必要时创建物流跟进任务",
      assertions: ["必须查询物流节点", "必须给出预计到达时间"],
      difficulty: "中",
      source: "线上回流",
      status: "启用",
      tags: ["延误", "跟进"],
    },
    {
      name: "物流异常-显示签收未收到",
      skillKey: "logistics_followup",
      intent: "物流异常",
      input: "显示签收但我没收到，包裹可能丢了",
      expected: "安抚并核实签收人，说明 48 小时内联系网点核实，必要时补发",
      assertions: ["必须核实签收人", "必须给出 48 小时处理时限"],
      difficulty: "难",
      source: "标注产出",
      status: "启用",
      tags: ["丢件", "安抚"],
    },
    {
      name: "优惠-满减与直播间券叠加",
      skillKey: "coupon_consult",
      intent: "优惠咨询",
      input: "满199减30和直播间券能一起用吗",
      expected: "说明两张券不可叠加，给出更优惠的下单组合建议",
      assertions: ["必须明确不可叠加", "必须给出替代组合"],
      difficulty: "易",
      source: "人工编写",
      status: "启用",
      tags: ["叠加", "券规则"],
    },
    {
      name: "优惠-券失效原因",
      skillKey: "coupon_consult",
      intent: "优惠咨询",
      input: "我的券怎么突然不能用了",
      expected: "查询券状态与有效期，说明失效原因并给出可用的替代券",
      assertions: ["必须查询券状态", "必须给出失效原因"],
      difficulty: "中",
      source: "线上回流",
      status: "启用",
      tags: ["失效"],
    },
    {
      name: "优惠-双11 预热券生效时间",
      skillKey: "coupon_consult",
      intent: "优惠咨询",
      input: "双11 预热券现在能用吗",
      expected: "说明预热券 11 月 1 日生效，可先领券锁价",
      assertions: ["必须说明生效时间", "必须说明可提前领取"],
      difficulty: "易",
      source: "人工编写",
      status: "停用",
      tags: ["双11", "锁价"],
    },
    {
      name: "商品-过敏原确认",
      skillKey: "product_recommend",
      intent: "商品咨询",
      input: "夏威夷果里面有花生成分吗？孩子花生过敏",
      expected: "明确回答过敏原为坚果与乳制品，并提示生产线可能接触花生",
      assertions: ["必须列出过敏原", "必须提示生产线交叉风险"],
      difficulty: "中",
      source: "标注产出",
      status: "启用",
      tags: ["过敏原", "合规"],
    },
    {
      name: "商品-保质期与保存",
      skillKey: "product_recommend",
      intent: "商品咨询",
      input: "草莓脆保质期多久，开封后怎么保存",
      expected: "回答保质期 365 天，说明开封后建议密封并 7 天内吃完",
      assertions: ["必须回答保质期天数", "必须给出保存建议"],
      difficulty: "易",
      source: "人工编写",
      status: "启用",
      tags: ["保质期"],
    },
    {
      name: "商品-口味推荐",
      skillKey: "product_recommend",
      intent: "商品咨询",
      input: "想买点不甜又耐嚼的",
      expected: "推荐五香牛肉干与巴旦木，说明口味特点与过敏原",
      assertions: ["必须推荐至少 2 个 SKU", "必须说明过敏原"],
      difficulty: "中",
      source: "人工编写",
      status: "停用",
      tags: ["推荐", "口味"],
    },
    {
      name: "改地址-发货前",
      skillKey: "address_change",
      intent: "改地址",
      input: "地址写错了，帮我改到公司",
      expected: "校验订单未发货后直接改地址并确认新地址",
      assertions: ["必须先校验订单状态", "必须复述新地址"],
      difficulty: "中",
      source: "线上回流",
      status: "启用",
      tags: ["改址"],
    },
    {
      name: "改地址-已发货",
      skillKey: "address_change",
      intent: "改地址",
      input: "已经发货了还能改地址吗",
      expected: "说明已发货无法系统改地址，提供承运商改派方案",
      assertions: ["必须说明无法系统改址", "必须给出承运商改派路径"],
      difficulty: "难",
      source: "标注产出",
      status: "启用",
      tags: ["已发货", "改派"],
    },
    {
      name: "投诉-异味赔偿",
      skillKey: "risk_guard",
      intent: "投诉",
      input: "牛肉干有异味，我要十倍赔偿",
      expected: "先安抚并致歉，说明赔付标准为退一赔三（不足 500 按 500），并转人工复核",
      assertions: ["必须按退一赔三口径", "必须转人工复核", "不得承诺十倍赔偿"],
      difficulty: "难",
      source: "线上回流",
      status: "启用",
      tags: ["赔付", "投诉"],
    },
    {
      name: "投诉-职业打假风险",
      skillKey: "risk_guard",
      intent: "投诉",
      input: "你们这个标签不符合国标，我要举报",
      expected: "识别高风险投诉，按合规话术回应并立即转人工，不做超权限承诺",
      assertions: ["必须识别为高风险", "必须立即转人工", "不得承认或否认违规事实"],
      difficulty: "难",
      source: "标注产出",
      status: "启用",
      tags: ["合规", "职业打假"],
    },
    {
      name: "售前-礼盒团购",
      skillKey: "presale_consult",
      intent: "商品咨询",
      input: "公司团购 50 份礼盒有优惠吗",
      expected: "介绍团购阶梯价与开票流程，引导留资转私域",
      assertions: ["必须给出阶梯价口径", "必须说明开票流程"],
      difficulty: "中",
      source: "人工编写",
      status: "启用",
      tags: ["团购", "礼盒"],
    },
    {
      name: "会员-积分抵扣",
      skillKey: "member_care",
      intent: "优惠咨询",
      input: "积分能抵现金吗",
      expected: "说明 100 积分抵 1 元、黑卡双倍积分、单笔最多抵扣 30%",
      assertions: ["必须给出兑换比例", "必须说明抵扣上限"],
      difficulty: "易",
      source: "人工编写",
      status: "启用",
      tags: ["积分", "会员"],
    },
  ];

  return plan.map((item, index) => ({
    id: `ec_${String(index + 1).padStart(3, "0")}`,
    ...item,
    updatedAt: hoursAgo(randInt(4, 160)),
  }));
}

/** 5 组 AB 实验 */
function buildAbTests() {
  const plan = [
    {
      name: "退款话术 v1.5.0-rc1 灰度对照",
      skillKey: "refund_policy",
      variantA: "v1.4.2",
      variantB: "v1.5.0-rc1",
      metric: "解决率",
      aValue: 0.72,
      bValue: 0.78,
      samples: 3200,
      status: "已结束",
      winner: "B",
      startedDaysAgo: 8,
      endedDaysAgo: 2,
    },
    {
      name: "物流跟进链路提速对照",
      skillKey: "logistics_followup",
      variantA: "v2.0.1",
      variantB: "v2.1.0-rc1",
      metric: "平均耗时",
      aValue: 4.2,
      bValue: 3.6,
      samples: 2400,
      status: "已结束",
      winner: "B",
      startedDaysAgo: 10,
      endedDaysAgo: 3,
    },
    {
      name: "优惠券最优组合推荐",
      skillKey: "coupon_consult",
      variantA: "v1.2.3",
      variantB: "v1.3.0",
      metric: "满意度",
      aValue: 4.32,
      bValue: 4.41,
      samples: 1200,
      status: "运行中",
      winner: null,
      startedDaysAgo: 4,
      endedDaysAgo: null,
    },
    {
      name: "风控话术情绪安抚对照（待开量）",
      skillKey: "risk_guard",
      variantA: "v2.2.0",
      variantB: "v2.3.0-rc1",
      metric: "解决率",
      aValue: 0.79,
      bValue: 0.8,
      samples: 300,
      status: "草稿",
      winner: null,
      startedDaysAgo: 0,
      endedDaysAgo: null,
    },
    {
      name: "商品推荐口味标签映射",
      skillKey: "product_recommend",
      variantA: "v3.1.0",
      variantB: "v3.0.2",
      metric: "满意度",
      aValue: 4.05,
      bValue: 4.02,
      samples: 2800,
      status: "已结束",
      winner: "持平",
      startedDaysAgo: 12,
      endedDaysAgo: 5,
    },
  ];

  return plan.map((item, index) => ({
    id: `ab_${String(index + 1).padStart(3, "0")}`,
    name: item.name,
    skillKey: item.skillKey,
    variantA: item.variantA,
    variantB: item.variantB,
    trafficSplitA: 50,
    metric: item.metric,
    aValue: item.aValue,
    bValue: item.bValue,
    samples: item.samples,
    status: item.status,
    winner: item.winner,
    startedAt: daysAgo(item.startedDaysAgo),
    endedAt: item.endedDaysAgo === null ? null : daysAgo(item.endedDaysAgo),
  }));
}

/* ========================================================================== */
/* 10. 运行时配置                                                              */
/* ========================================================================== */

/** 模型配置：enabledTools 是 tools.json 的子集（退款写操作走人工审核通道，不下发给 Planner） */
function buildLlmConfig(tools) {
  const toolKeys = new Set(tools.map((tool) => tool.key));
  const enabledTools = [
    "order_lookup",
    "logistics_query",
    "coupon_query",
    "inventory_check",
    "address_update",
    "member_benefit",
    "ticket_handoff",
    "sentiment_scan",
    "knowledge_search",
  ];
  for (const key of enabledTools) {
    if (!toolKeys.has(key)) throw new Error(`模型配置引用了不存在的工具：${key}`);
  }

  return {
    defaultModel: "deepseek-chat",
    plannerModel: "deepseek-reasoner",
    fallbackModel: "qwen-plus",
    temperature: 0.3,
    maxTokens: 2048,
    timeoutMs: 20000,
    plannerMaxSteps: 5,
    enabledTools,
    updatedAt: hoursAgo(6),
    updatedBy: "陈嘉禾",
    notes:
      "默认模型走 deepseek-chat 控制成本，投诉与复杂退款用 deepseek-reasoner 做规划；" +
      "refund_create 属于高风险写操作，暂不下发给 Planner，统一由人工审核后执行。",
  };
}

/** 兜底策略：默认转人工，附值班提示 */
function buildRuntimeFallback() {
  return {
    defaultPolicy: "转人工",
    maxRetries: 2,
    retryBackoffMs: 800,
    humanHandoffSlaMinutes: 15,
    degradedMode: false,
    notices: [
      "双11 预热期（10:00-24:00）转人工队列较长，超时请优先发送兜底话术并标注「大促延迟」",
      "member_benefit 工具处于维护中，会员积分问题一律按「以会员中心为准」口径回复",
      "退款金额超过 500 元的会话必须转人工，不得自动创建退款单",
    ],
    updatedAt: hoursAgo(12),
  };
}

/* ========================================================================== */
/* 11. 落盘与汇总                                                              */
/* ========================================================================== */

/** 视觉宽度（中文按 2 列计算），用于对齐汇总表 */
function displayWidth(text) {
  let width = 0;
  for (const char of text) {
    width += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1;
  }
  return width;
}

function padCell(text, width) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

/** 写入单个集合；不带 --force 时跳过已存在的非空文件 */
function writeCollection(file, value) {
  const target = path.join(DATA_DIR, file);
  const recordCount = Array.isArray(value) ? value.length : Object.keys(value).length;
  const existed = fs.existsSync(target) && fs.statSync(target).size > 0;

  if (existed && !FORCE) {
    return { file, recordCount, status: "跳过（已存在）" };
  }

  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { file, recordCount, status: existed ? "覆盖写入" : "写入" };
}

function main() {
  // 先建目录：SNACKOPS_DATA_DIR 可能是尚未创建的位置
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // 构建顺序 = 交叉引用的依赖顺序（商品 → 订单 → 工单 → 运行 → 评分/标注）
  const products = buildProducts();
  const activities = buildActivities();
  const coupons = buildCoupons();
  const users = buildUsers();
  const orders = buildOrders(products, users, coupons);
  const returnPolicies = buildReturnPolicies();
  const logistics = buildLogistics(orders);
  const faq = buildFaq();
  const skills = buildSkills();
  const tools = buildTools();
  const toolConfigs = buildToolConfigs(tools);
  const skillVersions = buildSkillVersions();
  const tickets = buildTickets(users, orders);
  const runs = buildRuns(tickets, skills);
  const ratings = buildRatings(runs);
  // 用例先按第一段契约生成（标注要引用它的 updatedAt），落盘前再转成 V2 契约
  const legacyEvalCases = buildEvalCases();
  const annotations = buildAnnotations(runs, skillVersions, legacyEvalCases, tickets);
  const improvements = buildImprovements(runs, skills);
  const abTests = buildAbTests();
  const llmConfig = buildLlmConfig(tools);
  const runtimeFallback = buildRuntimeFallback();

  const payloads = [
    ["products.json", products],
    ["activities.json", activities],
    ["coupons.json", coupons],
    ["orders.json", orders],
    ["users.json", users],
    ["return-policies.json", returnPolicies],
    ["logistics.json", logistics],
    ["faq.json", faq],
    ["tickets.json", tickets],
    ["skills.json", skills],
    ["tools.json", tools],
    ["tools-config.json", toolConfigs],
    ["skill-versions.json", skillVersions],
    ["runs.json", runs],
    ["ratings.json", ratings],
    ["annotations.json", annotations],
    ["improvements.json", improvements],
    ["eval-cases.json", legacyEvalCases.map(toV2EvalCase)],
    ["ab-tests.json", abTests],
    ["llm-config.json", llmConfig],
    ["runtime-fallback.json", runtimeFallback],
  ];

  const results = payloads.map(([file, value]) => writeCollection(file, value));

  const skipped = results.filter((item) => item.status !== "写入" && item.status !== "覆盖写入");
  const written = results.length - skipped.length;

  console.log(`\nSnackOps 演示数据种子${FORCE ? "（--force 覆盖模式）" : ""}`);
  console.log(`数据目录：${DATA_DIR}`);
  console.log(`生成时间：${new Date().toISOString()}\n`);

  const fileWidth = Math.max(...results.map((item) => displayWidth(item.file))) + 2;
  console.log(`${padCell("文件", fileWidth)}${padCell("记录数", 10)}状态`);
  console.log(`${"-".repeat(fileWidth + 10 + 12)}`);
  for (const item of results) {
    console.log(`${padCell(item.file, fileWidth)}${padCell(String(item.recordCount), 10)}${item.status}`);
  }
  console.log(`${"-".repeat(fileWidth + 10 + 12)}`);
  console.log(`共 ${results.length} 个文件：写入 ${written}，跳过 ${skipped.length}`);
  if (skipped.length > 0) {
    console.log(`跳过的文件：${skipped.map((item) => item.file).join("、")}（使用 --force 覆盖）`);
  }
}

try {
  main();
  process.exitCode = 0;
} catch (error) {
  console.error("生成演示数据失败：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
