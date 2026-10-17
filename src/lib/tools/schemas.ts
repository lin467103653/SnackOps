/**
 * Tool 入参校验（zod）。
 *
 * data/tools.json 里的 inputSchema 是给 Planner 读的 JSON Schema；
 * 这里的 zod schema 是运行时真正的闸门，两者字段保持一致。
 */
import { z } from "zod";

import { productCategories } from "../schemas";

const limit = z.number().int().min(1).max(50).optional();

export const queryProductsInputSchema = z
  .object({
    keyword: z.string().trim().min(1).max(40).optional(),
    category: z.enum(productCategories).optional(),
    minPrice: z.number().min(0).max(10000).optional(),
    maxPrice: z.number().min(0).max(10000).optional(),
    inStockOnly: z.boolean().optional(),
    excludeAllergens: z.array(z.string().min(1)).max(10).optional(),
    tags: z.array(z.string().min(1)).max(10).optional(),
    limit,
  })
  .refine((value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, {
    message: "minPrice 不能大于 maxPrice",
    path: ["minPrice"],
  });

export const queryActivitiesInputSchema = z.object({
  channel: z.enum(["小程序", "APP", "直播间", "私域社群"]).optional(),
  type: z.enum(["满减", "折扣", "赠品", "秒杀", "组合装"]).optional(),
  status: z.enum(["筹备中", "进行中", "已结束"]).optional(),
  activeOnly: z.boolean().optional(),
  at: z.string().min(4).optional(),
  limit,
});

export const queryCouponsInputSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  kind: z.enum(["满减券", "折扣券", "免运费券", "新客券"]).optional(),
  activeOnly: z.boolean().optional(),
  productId: z.string().trim().min(1).max(32).optional(),
  maxThreshold: z.number().min(0).max(10000).optional(),
  limit,
});

export const calculatePriceInputSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(32),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(20),
  couponCode: z.string().trim().min(1).max(32).optional(),
  activityId: z.string().trim().min(1).max(32).optional(),
});

export const queryOrdersInputSchema = z.object({
  orderNo: z.string().trim().min(1).max(32).optional(),
  userId: z.string().trim().min(1).max(32).optional(),
  status: z.enum(["待付款", "待发货", "已发货", "已签收", "退款中", "已退款", "已取消"]).optional(),
  logisticsStatus: z.enum(["未发货", "已揽收", "运输中", "派送中", "已签收", "异常"]).optional(),
  afterSalesStatus: z.enum(["无", "退款中", "已退款", "退货中", "换货中", "已关闭"]).optional(),
  limit,
});

export const queryLogisticsInputSchema = z.object({
  orderNo: z.string().trim().min(1).max(32).optional(),
  trackingNo: z.string().trim().min(1).max(40).optional(),
  status: z.enum(["已揽收", "运输中", "派送中", "已签收", "异常"]).optional(),
  carrier: z.enum(["顺丰速运", "中通快递", "圆通速递", "京东物流", "邮政EMS"]).optional(),
  limit,
});

export const toolInputSchemas = {
  query_products: queryProductsInputSchema,
  query_activities: queryActivitiesInputSchema,
  query_coupons: queryCouponsInputSchema,
  calculate_price: calculatePriceInputSchema,
  query_orders: queryOrdersInputSchema,
  query_logistics: queryLogisticsInputSchema,
} as const;

export type ToolId = keyof typeof toolInputSchemas;
