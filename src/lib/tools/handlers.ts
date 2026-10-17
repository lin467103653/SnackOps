/**
 * Tool 的运行时实现：全部直接读 data/*.json（走 zod 校验），没有外部依赖。
 *
 * 每个 handler 自带入参校验与错误分类：
 * - INVALID_INPUT：参数不合法（400/422）
 * - NOT_FOUND：引用的商品/订单/活动不存在（404）
 * - UPSTREAM：读取数据失败等（500）
 */
import { z } from "zod";

import { getActivities, getCoupons, getLogistics, getOrders, getProducts } from "../data";
import type { Activity, Coupon, Order, Product } from "../types";
import {
  calculatePriceInputSchema,
  queryActivitiesInputSchema,
  queryCouponsInputSchema,
  queryLogisticsInputSchema,
  queryOrdersInputSchema,
  queryProductsInputSchema,
} from "./schemas";

export type ToolErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "UPSTREAM";

export class ToolError extends Error {
  readonly code: ToolErrorCode;

  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export type ToolHandler = (input: unknown) => Promise<Record<string, unknown>>;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ToolError(
      "INVALID_INPUT",
      `入参校验失败：${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".") || "入参"} ${issue.message}`)
        .join("；")}`,
    );
  }
  return parsed.data;
}

function toPositiveLimit(value: number | undefined, fallback: number): number {
  return value ?? fallback;
}

/* ------------------------------- query_products ------------------------------ */

const productView = (product: Product) => ({
  id: product.id,
  name: product.name,
  category: product.category,
  flavor: product.flavor,
  price: product.price,
  stock: product.stock,
  status: product.status,
  netWeightG: product.netWeightG,
  allergens: product.allergens,
  tags: product.tags,
  sugarPer100g: product.sugarPer100g,
  caloriesPer100g: product.caloriesPer100g,
  spicyLevel: product.spicyLevel,
  suitableFor: product.suitableFor,
});

async function queryProducts(raw: unknown): Promise<Record<string, unknown>> {
  const input = parse(queryProductsInputSchema, raw);
  const products = await getProducts();
  const limit = toPositiveLimit(input.limit, 10);

  const matched = products.filter((product) => {
    if (input.category && product.category !== input.category) return false;
    if (input.minPrice !== undefined && product.price < input.minPrice) return false;
    if (input.maxPrice !== undefined && product.price > input.maxPrice) return false;
    if (input.inStockOnly && (product.stock <= 0 || product.status !== "在售")) return false;
    if (input.excludeAllergens?.length && product.allergens.some((item) => input.excludeAllergens!.includes(item))) {
      return false;
    }
    if (input.tags?.length && !input.tags.some((tag) => product.tags.includes(tag))) return false;
    if (input.keyword) {
      const keyword = input.keyword.toLowerCase();
      const haystack = [product.name, product.flavor, ...product.flavorTags, ...product.tags, ...product.ingredients]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });

  return {
    total: matched.length,
    returned: Math.min(limit, matched.length),
    filters: input,
    items: matched.slice(0, limit).map(productView),
  };
}

/* ------------------------------ query_activities ----------------------------- */

const activityView = (activity: Activity) => ({
  id: activity.id,
  name: activity.name,
  type: activity.type,
  channel: activity.channel,
  status: activity.status,
  threshold: activity.threshold,
  rule: activity.rule,
  applicableCategories: activity.applicableCategories,
  stackableWithCoupon: activity.stackableWithCoupon,
  startAt: activity.startAt,
  endAt: activity.endAt,
});

async function queryActivities(raw: unknown): Promise<Record<string, unknown>> {
  const input = parse(queryActivitiesInputSchema, raw);
  const activities = await getActivities();
  const at = input.at ? new Date(input.at) : new Date();
  if (Number.isNaN(at.getTime())) throw new ToolError("INVALID_INPUT", "at 不是合法时间");
  const limit = toPositiveLimit(input.limit, 10);

  const matched = activities.filter((activity) => {
    if (input.channel && activity.channel !== input.channel) return false;
    if (input.type && activity.type !== input.type) return false;
    if (input.status && activity.status !== input.status) return false;
    if (input.activeOnly) {
      const started = new Date(activity.startAt).getTime() <= at.getTime();
      const notEnded = new Date(activity.endAt).getTime() >= at.getTime();
      if (!started || !notEnded) return false;
    }
    return true;
  });

  return {
    total: matched.length,
    returned: Math.min(limit, matched.length),
    at: at.toISOString(),
    items: matched.slice(0, limit).map(activityView),
  };
}

/* ------------------------------- query_coupons ------------------------------- */

const couponView = (coupon: Coupon) => ({
  code: coupon.code,
  name: coupon.name,
  kind: coupon.kind,
  threshold: coupon.threshold,
  discount: coupon.discount,
  stackable: coupon.stackable,
  applicableProductIds: coupon.applicableProductIds,
  applicableCategories: coupon.applicableCategories,
  perUserLimit: coupon.perUserLimit,
  claimed: coupon.claimed,
  total: coupon.total,
  validFrom: coupon.validFrom,
  validTo: coupon.validTo,
  status: coupon.status,
});

async function queryCoupons(raw: unknown): Promise<Record<string, unknown>> {
  const input = parse(queryCouponsInputSchema, raw);
  const coupons = await getCoupons();
  const products = await getProducts();
  const now = Date.now();
  const limit = toPositiveLimit(input.limit, 10);

  const matched = coupons.filter((coupon) => {
    if (input.code && coupon.code.toLowerCase() !== input.code.toLowerCase()) return false;
    if (input.kind && coupon.kind !== input.kind) return false;
    if (input.maxThreshold !== undefined && coupon.threshold > input.maxThreshold) return false;
    if (input.activeOnly) {
      const usable = coupon.status === "可领取" && new Date(coupon.validTo).getTime() >= now;
      if (!usable) return false;
    }
    if (input.productId) {
      const product = products.find((item) => item.id === input.productId);
      if (!product) throw new ToolError("NOT_FOUND", `商品不存在：${input.productId}`);
      if (coupon.excludeProductIds.includes(product.id)) return false;
      const byProduct = coupon.applicableProductIds.length === 0 || coupon.applicableProductIds.includes(product.id);
      const byCategory =
        coupon.applicableCategories.length === 0 || coupon.applicableCategories.includes(product.category);
      if (!byProduct || !byCategory) return false;
    }
    return true;
  });

  return {
    total: matched.length,
    returned: Math.min(limit, matched.length),
    items: matched.slice(0, limit).map(couponView),
  };
}

/* ------------------------------ calculate_price ------------------------------ */

export interface PriceLine {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

function activityDiscount(activity: Activity, subtotal: number, totalQty: number): number {
  switch (activity.rule.type) {
    case "满减":
      return round2(Math.min(activity.rule.value, subtotal));
    case "折扣": {
      const rate = activity.rule.value > 1 ? activity.rule.value / 100 : activity.rule.value;
      return round2(subtotal * (1 - Math.min(Math.max(rate, 0), 1)));
    }
    case "秒杀价":
      return round2(Math.max(0, subtotal - activity.rule.value * totalQty));
    case "赠品":
    default:
      return 0;
  }
}

function couponRate(coupon: Coupon): number {
  return coupon.discount > 1 ? coupon.discount / 100 : coupon.discount;
}

function couponApplicable(coupon: Coupon, lines: PriceLine[], products: Product[]): boolean {
  const ids = lines.map((line) => line.productId);
  if (coupon.excludeProductIds.some((id) => ids.includes(id))) return false;
  const byProduct = coupon.applicableProductIds.length === 0 || coupon.applicableProductIds.some((id) => ids.includes(id));
  const categories: string[] = lines.flatMap((line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    return product ? [product.category as string] : [];
  });
  const byCategory =
    coupon.applicableCategories.length === 0 || coupon.applicableCategories.some((category) => categories.includes(category));
  return byProduct && byCategory;
}

async function calculatePrice(raw: unknown): Promise<Record<string, unknown>> {
  const input = parse(calculatePriceInputSchema, raw);
  const [products, activities, coupons] = await Promise.all([getProducts(), getActivities(), getCoupons()]);
  const notes: string[] = [];
  const lines: PriceLine[] = [];
  let subtotal = 0;
  let totalQty = 0;

  for (const item of input.items) {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new ToolError("NOT_FOUND", `商品不存在：${item.productId}`);
    if (product.status === "已下架") notes.push(`${product.name} 已下架，无法下单`);
    if (product.status === "缺货" || product.stock < item.qty) {
      notes.push(`${product.name} 库存仅 ${product.stock} 件，本次需要 ${item.qty} 件`);
    }
    const lineTotal = round2(product.price * item.qty);
    subtotal = round2(subtotal + lineTotal);
    totalQty += item.qty;
    lines.push({ productId: product.id, name: product.name, qty: item.qty, unitPrice: product.price, lineTotal });
  }

  let activityDiscountValue = 0;
  let appliedActivity: { id: string; name: string; rule: string } | null = null;

  if (input.activityId) {
    const activity = activities.find((candidate) => candidate.id === input.activityId);
    if (!activity) throw new ToolError("NOT_FOUND", `活动不存在：${input.activityId}`);
    const categoryMatch =
      activity.applicableCategories.length === 0 ||
      lines.some((line) => {
        const product = products.find((candidate) => candidate.id === line.productId);
        return product ? activity.applicableCategories.includes(product.category) : false;
      });

    if (subtotal < activity.threshold) {
      notes.push(`未达到活动门槛 ${activity.threshold} 元，还差 ${round2(activity.threshold - subtotal)} 元`);
    } else if (!categoryMatch) {
      notes.push(`活动仅适用于 ${activity.applicableCategories.join("、")}，当前商品不参与`);
    } else {
      activityDiscountValue = activityDiscount(activity, subtotal, totalQty);
      appliedActivity = { id: activity.id, name: activity.name, rule: activity.rule.description };
      if (activity.rule.type === "赠品") notes.push(`活动为赠品：${activity.rule.description}`);
    }
  }

  let couponDiscountValue = 0;
  let appliedCoupon: { code: string; name: string; kind: string } | null = null;

  if (input.couponCode) {
    const coupon = coupons.find((candidate) => candidate.code.toLowerCase() === input.couponCode!.toLowerCase());
    if (!coupon) throw new ToolError("NOT_FOUND", `优惠券不存在：${input.couponCode}`);

    const now = Date.now();
    if (coupon.status === "已过期" || new Date(coupon.validTo).getTime() < now) {
      notes.push(`优惠券 ${coupon.code} 已过期，不可使用`);
    } else if (coupon.status === "已领完") {
      notes.push(`优惠券 ${coupon.code} 已领完，不可使用`);
    } else if (subtotal < coupon.threshold) {
      notes.push(`未达到券门槛 ${coupon.threshold} 元，还差 ${round2(coupon.threshold - subtotal)} 元`);
    } else if (!couponApplicable(coupon, lines, products)) {
      notes.push(`优惠券 ${coupon.code} 不适用于当前商品`);
    } else {
      couponDiscountValue =
        coupon.kind === "免运费券"
          ? 0
          : coupon.kind === "折扣券"
            ? round2(subtotal * (1 - Math.min(Math.max(couponRate(coupon), 0), 1)))
            : round2(Math.min(coupon.discount, subtotal));
      appliedCoupon = { code: coupon.code, name: coupon.name, kind: coupon.kind };
      if (coupon.kind === "免运费券") notes.push("免运费券只抵扣运费，本单运费按 0 元计");
    }
  }

  const activityMeta = appliedActivity ? activities.find((item) => item.id === appliedActivity!.id) : undefined;
  const couponMeta = appliedCoupon ? coupons.find((item) => item.code === appliedCoupon!.code) : undefined;

  if (activityDiscountValue > 0 && couponDiscountValue > 0) {
    const activityStackable = activityMeta?.stackableWithCoupon ?? false;
    const couponStackable = couponMeta?.stackable ?? false;
    if (!activityStackable || !couponStackable) {
      const keepCoupon = couponDiscountValue >= activityDiscountValue;
      if (keepCoupon) {
        notes.push(`活动与券不可叠加，已保留优惠券 ${appliedCoupon?.code}`);
        activityDiscountValue = 0;
        appliedActivity = null;
      } else {
        notes.push("活动与券不可叠加，已保留活动优惠");
        couponDiscountValue = 0;
        appliedCoupon = null;
      }
    }
  }

  const totalDiscount = round2(Math.min(activityDiscountValue + couponDiscountValue, subtotal));
  const payable = round2(Math.max(0, subtotal - totalDiscount));

  return {
    lines,
    subtotal,
    activityDiscount: activityDiscountValue,
    couponDiscount: couponDiscountValue,
    totalDiscount,
    payable,
    totalQty,
    appliedActivity,
    appliedCoupon,
    notes,
  };
}

/* -------------------------------- query_orders ------------------------------- */

const orderView = (order: Order) => ({
  orderNo: order.orderNo,
  userId: order.userId,
  status: order.status,
  logisticsStatus: order.logisticsStatus,
  afterSalesStatus: order.afterSalesStatus,
  afterSalesReason: order.afterSalesReason,
  payable: order.payable,
  discount: order.discount,
  trackingNo: order.trackingNo,
  channel: order.channel,
  createdAt: order.createdAt,
  items: order.items,
});

async function queryOrders(raw: unknown): Promise<Record<string, unknown>> {
  const input = parse(queryOrdersInputSchema, raw);
  const orders = await getOrders();
  const limit = toPositiveLimit(input.limit, 10);

  const matched = orders
    .filter((order) => {
      if (input.orderNo && order.orderNo !== input.orderNo) return false;
      if (input.userId && order.userId !== input.userId) return false;
      if (input.status && order.status !== input.status) return false;
      if (input.logisticsStatus && order.logisticsStatus !== input.logisticsStatus) return false;
      if (input.afterSalesStatus && order.afterSalesStatus !== input.afterSalesStatus) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    total: matched.length,
    returned: Math.min(limit, matched.length),
    filters: input,
    items: matched.slice(0, limit).map(orderView),
  };
}

/* ------------------------------- query_logistics ----------------------------- */

async function queryLogistics(raw: unknown): Promise<Record<string, unknown>> {
  const input = parse(queryLogisticsInputSchema, raw);
  const records = await getLogistics();
  const limit = toPositiveLimit(input.limit, 10);

  const matched = records.filter((record) => {
    if (input.orderNo && record.orderNo !== input.orderNo) return false;
    if (input.trackingNo && record.trackingNo !== input.trackingNo) return false;
    if (input.status && record.status !== input.status) return false;
    if (input.carrier && record.carrier !== input.carrier) return false;
    return true;
  });

  return {
    total: matched.length,
    returned: Math.min(limit, matched.length),
    items: matched.slice(0, limit).map((record) => ({
      orderNo: record.orderNo,
      carrier: record.carrier,
      trackingNo: record.trackingNo,
      status: record.status,
      city: record.city,
      lastEvent: record.lastEvent,
      lastEventAt: record.lastEventAt,
      estimatedArrival: record.estimatedArrival,
      delayHours: record.delayHours,
    })),
  };
}

export const toolHandlers = {
  query_products: queryProducts,
  query_activities: queryActivities,
  query_coupons: queryCoupons,
  calculate_price: calculatePrice,
  query_orders: queryOrders,
  query_logistics: queryLogistics,
} satisfies Record<string, ToolHandler>;

export type ToolHandlerId = keyof typeof toolHandlers;
