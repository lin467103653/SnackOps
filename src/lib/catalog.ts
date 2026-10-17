/**
 * 业务数据目录（/catalog）的摘要计算。
 *
 * 只读聚合：按数据类型给出「有多少、关键分布、值得注意的点」，
 * 让运营不用点进原始 JSON 也能判断数据是否健康。
 */
import {
  getActivities,
  getCoupons,
  getFaq,
  getHandoffRules,
  getLogistics,
  getOrders,
  getProducts,
  getReturnPolicies,
  getTickets,
  getUsers,
} from "./data";
import { formatMoney, formatPercent } from "./format";
import { unique } from "./utils";
import type { CollectionName } from "./collections";

export interface CatalogStat {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}

export interface CatalogSection {
  key: string;
  title: string;
  description: string;
  collection: CollectionName;
  href: string;
  count: number;
  countLabel: string;
  stats: CatalogStat[];
  highlights: string[];
}

const DAY = 86_400_000;

export async function getCatalogSections(): Promise<CatalogSection[]> {
  const [products, activities, coupons, orders, users, policies, faq, logistics, tickets, handoffRules] = await Promise.all([
    getProducts(),
    getActivities(),
    getCoupons(),
    getOrders(),
    getUsers(),
    getReturnPolicies(),
    getFaq(),
    getLogistics(),
    getTickets(),
    getHandoffRules(),
  ]);

  const now = Date.now();
  const activeActivities = activities.filter(
    (activity) => new Date(activity.startAt).getTime() <= now && new Date(activity.endAt).getTime() >= now,
  );
  const outOfStock = products.filter((product) => product.status === "缺货" || product.stock === 0);
  const prices = products.map((product) => product.price);
  const afterSalesOrders = orders.filter((order) => order.afterSalesStatus !== "无");
  const pendingOrders = orders.filter((order) => order.status === "待发货");
  const newUsers = users.filter((user) => user.isNewCustomer);
  const riskyUsers = users.filter((user) => user.risk !== "正常");
  const abnormalLogistics = logistics.filter((record) => record.status === "异常");
  const overdueTickets = tickets.filter(
    (ticket) => ticket.status !== "已解决" && new Date(ticket.slaDueAt).getTime() < now,
  );
  const urgentTickets = tickets.filter((ticket) => ticket.priority === "紧急" || ticket.priority === "高");
  const enabledRules = handoffRules.filter((rule) => rule.enabled);

  return [
    {
      key: "products",
      title: "商品",
      description: "配料、过敏原、糖分营养、库存与口味标签，是推荐与替代的底座",
      collection: "products",
      href: "/data/products",
      count: products.length,
      countLabel: "个 SKU",
      stats: [
        { label: "类目", value: `${unique(products.map((product) => product.category)).length} 类` },
        { label: "价格区间", value: `${formatMoney(Math.min(...prices))} – ${formatMoney(Math.max(...prices))}` },
        {
          label: "缺货/告急",
          value: `${outOfStock.length} 个`,
          tone: outOfStock.length > 0 ? "warning" : "default",
        },
        {
          label: "平均含糖",
          value: `${(products.reduce((sum, product) => sum + product.sugarPer100g, 0) / products.length).toFixed(1)} g/100g`,
        },
      ],
      highlights: products
        .slice(0, 3)
        .map((product) => `${product.name}（${formatMoney(product.price)} · 库存 ${product.stock}）`),
    },
    {
      key: "activities",
      title: "营销活动",
      description: "门槛、优惠规则与适用范围决定报价能不能兑现",
      collection: "activities",
      href: "/data/activities",
      count: activities.length,
      countLabel: "个活动",
      stats: [
        { label: "进行中", value: `${activeActivities.length} 个` },
        {
          label: "门槛区间",
          value: `${formatMoney(Math.min(...activities.map((activity) => activity.threshold)), { withSymbol: false })} – ${formatMoney(
            Math.max(...activities.map((activity) => activity.threshold)),
          )}`,
        },
        { label: "可与券叠加", value: `${activities.filter((activity) => activity.stackableWithCoupon).length} 个` },
      ],
      highlights: activeActivities.slice(0, 3).map((activity) => `${activity.name} · ${activity.rule.description}`),
    },
    {
      key: "coupons",
      title: "优惠券",
      description: "面额、门槛、适用商品与叠加策略，是最容易说错的一类数据",
      collection: "coupons",
      href: "/data/coupons",
      count: coupons.length,
      countLabel: "种券",
      stats: [
        {
          label: "可领取",
          value: `${coupons.filter((coupon) => coupon.status === "可领取").length} 种`,
        },
        {
          label: "最高面额",
          value: formatMoney(Math.max(...coupons.map((coupon) => coupon.discount))),
        },
        { label: "可叠加", value: `${coupons.filter((coupon) => coupon.stackable).length} 种` },
        {
          label: "核销率",
          value: formatPercent(
            coupons.reduce((sum, coupon) => sum + coupon.used, 0) / Math.max(1, coupons.reduce((sum, coupon) => sum + coupon.claimed, 0)),
          ),
        },
      ],
      highlights: coupons
        .filter((coupon) => coupon.status === "可领取")
        .slice(0, 3)
        .map((coupon) => `${coupon.name} · ${coupon.code}`),
    },
    {
      key: "orders",
      title: "订单",
      description: "订单状态、物流状态、售后状态三列分开，客服话术才不会说错",
      collection: "orders",
      href: "/data/orders",
      count: orders.length,
      countLabel: "笔订单",
      stats: [
        { label: "待发货", value: `${pendingOrders.length} 笔`, tone: pendingOrders.length > 3 ? "warning" : "default" },
        {
          label: "售后中",
          value: `${afterSalesOrders.length} 笔`,
          tone: afterSalesOrders.length > 0 ? "warning" : "default",
        },
        {
          label: "平均实付",
          value: formatMoney(orders.reduce((sum, order) => sum + order.payable, 0) / Math.max(1, orders.length)),
        },
        {
          label: "物流异常",
          value: `${orders.filter((order) => order.logisticsStatus === "异常").length} 笔`,
          tone: "danger",
        },
      ],
      highlights: [...orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3)
        .map((order) => `${order.orderNo} · ${order.status} · ${formatMoney(order.payable)}`),
    },
    {
      key: "users",
      title: "用户",
      description: "新客标记、过敏禁忌与口味偏好，决定「能不能推」和「能不能说」",
      collection: "users",
      href: "/data/users",
      count: users.length,
      countLabel: "位用户",
      stats: [
        { label: "新客", value: `${newUsers.length} 位` },
        {
          label: "有过敏禁忌",
          value: `${users.filter((user) => user.preferences.avoidAllergens.length > 0).length} 位`,
          tone: "warning",
        },
        { label: "风险标记", value: `${riskyUsers.length} 位`, tone: riskyUsers.length > 0 ? "danger" : "default" },
        {
          label: "平均客单预算",
          value: formatMoney(
            users.reduce((sum, user) => sum + user.preferences.budgetPerOrder, 0) / Math.max(1, users.length),
          ),
        },
      ],
      highlights: users
        .slice(0, 3)
        .map((user) => `${user.nickname} · ${user.level} · 禁忌 ${user.preferences.avoidAllergens.join("、") || "无"}`),
    },
    {
      key: "return-policies",
      title: "售后政策",
      description: "破损、缺件、退换货、退款的时效与赔付口径",
      collection: "return-policies",
      href: "/data/return-policies",
      count: policies.length,
      countLabel: "条政策",
      stats: [
        { label: "覆盖场景", value: `${unique(policies.map((policy) => policy.category)).length} 类` },
        {
          label: "平均退货窗口",
          value: `${Math.round(policies.reduce((sum, policy) => sum + policy.refundWindowDays, 0) / policies.length)} 天`,
        },
        {
          label: "平均处理时效",
          value: `${Math.round(policies.reduce((sum, policy) => sum + policy.resolveWithinHours, 0) / policies.length)} 小时`,
        },
        { label: "买家承担运费", value: `${policies.filter((policy) => policy.whoPaysFreight === "买家承担").length} 条` },
      ],
      highlights: policies.slice(0, 3).map((policy) => `${policy.scene} · ${policy.compensationRule}`),
    },
    {
      key: "faq",
      title: "FAQ 知识",
      description: "高频问题的标准答案，被 Skill 引用时可直接兜底",
      collection: "faq",
      href: "/data/faq",
      count: faq.length,
      countLabel: "条问答",
      stats: [
        { label: "启用", value: `${faq.filter((item) => item.status === "启用").length} 条` },
        { label: "分类", value: `${unique(faq.map((item) => item.category)).length} 类` },
        { label: "累计命中", value: faq.reduce((sum, item) => sum + item.hitCount, 0).toLocaleString("zh-CN") },
      ],
      highlights: [...faq]
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 3)
        .map((item) => `${item.question}（命中 ${item.hitCount}）`),
    },
    {
      key: "logistics",
      title: "物流轨迹",
      description: "承运商、最新节点与延误时长，催发货场景的唯一事实来源",
      collection: "logistics",
      href: "/data/logistics",
      count: logistics.length,
      countLabel: "条运单",
      stats: [
        { label: "异常运单", value: `${abnormalLogistics.length} 条`, tone: abnormalLogistics.length > 0 ? "danger" : "default" },
        {
          label: "平均延误",
          value: `${(
            logistics.reduce((sum, record) => sum + record.delayHours, 0) / Math.max(1, logistics.length)
          ).toFixed(1)} 小时`,
        },
        { label: "覆盖城市", value: `${unique(logistics.map((record) => record.city)).length} 个` },
        { label: "承运商", value: `${unique(logistics.map((record) => record.carrier)).length} 家` },
      ],
      highlights: abnormalLogistics.slice(0, 3).map((record) => `${record.orderNo} · ${record.lastEvent}`),
    },
    {
      key: "tickets",
      title: "工单",
      description: "会话意图、优先级与 SLA，决定运营今天先干什么",
      collection: "tickets",
      href: "/data/tickets",
      count: tickets.length,
      countLabel: "条工单",
      stats: [
        { label: "待处理", value: `${tickets.filter((ticket) => ticket.status === "待处理").length} 条` },
        { label: "高优/紧急", value: `${urgentTickets.length} 条`, tone: urgentTickets.length > 0 ? "warning" : "default" },
        { label: "SLA 超时", value: `${overdueTickets.length} 条`, tone: overdueTickets.length > 0 ? "danger" : "default" },
        {
          label: "已接管",
          value: `${tickets.filter((ticket) => ticket.status === "已接管").length} 条`,
        },
      ],
      highlights: urgentTickets.slice(0, 3).map((ticket) => `${ticket.code} · ${ticket.summary}`),
    },
    {
      key: "handoff-rules",
      title: "转人工规则",
      description: "什么情况必须转人工、升级主管或禁止承诺，Planner 直接读取",
      collection: "handoff-rules",
      href: "/data/handoff-rules",
      count: handoffRules.length,
      countLabel: "条规则",
      stats: [
        { label: "启用", value: `${enabledRules.length} 条` },
        {
          label: "紧急规则",
          value: `${handoffRules.filter((rule) => rule.priority === "紧急").length} 条`,
          tone: "danger",
        },
        {
          label: "平均 SLA",
          value: `${Math.round(handoffRules.reduce((sum, rule) => sum + rule.slaMinutes, 0) / handoffRules.length)} 分钟`,
        },
        { label: "覆盖动作", value: `${unique(handoffRules.map((rule) => rule.action)).length} 种` },
      ],
      highlights: handoffRules
        .filter((rule) => rule.priority === "紧急")
        .slice(0, 3)
        .map((rule) => `${rule.name} · ${rule.action}`),
    },
  ];
}

/** 数据新鲜度：最新一条记录距今多久（用于 /catalog 顶部的健康提示） */
export function freshnessHint(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "未来时间";
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "1 小时内";
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前（建议重新 seed）`;
}

export const CATALOG_FRESHNESS_DAYS = Math.floor(DAY / DAY);
