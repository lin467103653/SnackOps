import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleSlash,
  Clock3,
  Loader,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "danger" | "info" | "neutral";

interface StatusVisual {
  variant: BadgeVariant;
  icon: LucideIcon;
}

/**
 * 所有状态都以「图标 + 文字」呈现，颜色只是辅助信息。
 * 这是运营台的可访问性底线：色弱用户也必须能分辨状态。
 */
const STATUS_MAP: Record<string, StatusVisual> = {
  成功: { variant: "success", icon: CircleCheck },
  已完成: { variant: "success", icon: CircleCheck },
  已解决: { variant: "success", icon: CircleCheck },
  已上线: { variant: "success", icon: CircleCheck },
  可用: { variant: "success", icon: CircleCheck },
  已签收: { variant: "success", icon: CircleCheck },
  在售: { variant: "success", icon: CircleCheck },
  可领取: { variant: "success", icon: CircleCheck },
  启用: { variant: "success", icon: CircleCheck },
  正常: { variant: "success", icon: CircleCheck },
  线上: { variant: "success", icon: CircleCheck },
  进行中: { variant: "info", icon: Loader },
  运行中: { variant: "info", icon: Loader },
  处理中: { variant: "info", icon: Loader },
  已接管: { variant: "info", icon: ShieldAlert },
  运输中: { variant: "info", icon: Loader },
  派送中: { variant: "info", icon: Loader },
  灰度中: { variant: "info", icon: CircleDot },
  已发货: { variant: "info", icon: CircleDot },
  待发货: { variant: "warning", icon: Clock3 },
  待处理: { variant: "warning", icon: Clock3 },
  待评估: { variant: "warning", icon: Clock3 },
  待付款: { variant: "warning", icon: Clock3 },
  已排期: { variant: "warning", icon: Clock3 },
  排队中: { variant: "warning", icon: Clock3 },
  筹备中: { variant: "warning", icon: Clock3 },
  草稿: { variant: "neutral", icon: CircleSlash },
  候选: { variant: "warning", icon: CircleDot },
  关注: { variant: "warning", icon: CircleAlert },
  预售: { variant: "info", icon: Clock3 },
  退款中: { variant: "warning", icon: CircleAlert },
  维护中: { variant: "warning", icon: TriangleAlert },
  失败: { variant: "danger", icon: CircleAlert },
  超时: { variant: "danger", icon: Clock3 },
  异常: { variant: "danger", icon: TriangleAlert },
  已升级: { variant: "danger", icon: ShieldAlert },
  已回滚: { variant: "danger", icon: Ban },
  已驳回: { variant: "danger", icon: Ban },
  高风险: { variant: "danger", icon: ShieldAlert },
  合规风险: { variant: "danger", icon: ShieldAlert },
  已过期: { variant: "neutral", icon: CircleSlash },
  已结束: { variant: "neutral", icon: CircleSlash },
  已下线: { variant: "neutral", icon: CircleSlash },
  已退款: { variant: "neutral", icon: CircleSlash },
  已取消: { variant: "neutral", icon: CircleSlash },
  已领完: { variant: "neutral", icon: CircleSlash },
  已停用: { variant: "neutral", icon: CircleSlash },
  停用: { variant: "neutral", icon: CircleSlash },
  缺货: { variant: "danger", icon: TriangleAlert },
  已下架: { variant: "neutral", icon: CircleSlash },
  偏低: { variant: "warning", icon: CircleAlert },
  // 批量评测状态（V2 英文枚举 → 中文展示）
  done: { variant: "success", icon: CircleCheck },
  queued: { variant: "warning", icon: Clock3 },
  cancelled: { variant: "neutral", icon: Ban },
  PASS: { variant: "success", icon: CircleCheck },
  FAIL: { variant: "danger", icon: CircleAlert },
  REVIEW: { variant: "warning", icon: CircleDot },
  ERROR: { variant: "danger", icon: TriangleAlert },
  // Agent 主链路状态（英文枚举 → 中文展示）
  success: { variant: "success", icon: CircleCheck },
  error: { variant: "danger", icon: CircleAlert },
  failed: { variant: "danger", icon: TriangleAlert },
  blocked: { variant: "danger", icon: ShieldAlert },
  handoff: { variant: "info", icon: ShieldAlert },
  running: { variant: "info", icon: Loader },
  skipped: { variant: "neutral", icon: CircleSlash },
  allow: { variant: "success", icon: CircleCheck },
  block: { variant: "danger", icon: ShieldAlert },
  warn: { variant: "warning", icon: CircleAlert },
};

/** 英文状态 → 中文文案（画面上一律显示中文，颜色只做辅助） */
const STATUS_TEXT: Record<string, string> = {
  success: "成功",
  error: "失败",
  failed: "失败",
  blocked: "已阻断",
  handoff: "已接管",
  running: "运行中",
  skipped: "已跳过",
  timeout: "超时",
  allow: "允许发送",
  block: "已阻断",
  warn: "提示",
  done: "已完成",
  queued: "排队中",
  cancelled: "已取消",
  PASS: "通过",
  FAIL: "失败",
  REVIEW: "待复核",
  ERROR: "运行错误",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const visual = STATUS_MAP[status] ?? { variant: "neutral" as BadgeVariant, icon: CircleDot };
  const Icon = visual.icon;
  const text = STATUS_TEXT[status] ?? status;
  return (
    <Badge variant={visual.variant} className={cn("gap-1", className)}>
      <Icon aria-hidden className="shrink-0" />
      <span className="sr-only">状态：</span>
      {text}
    </Badge>
  );
}

const PRIORITY_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  P0: { variant: "danger", label: "P0 紧急" },
  P1: { variant: "warning", label: "P1 高" },
  P2: { variant: "neutral", label: "P2 常规" },
  紧急: { variant: "danger", label: "紧急" },
  高: { variant: "warning", label: "高" },
  中: { variant: "info", label: "中" },
  低: { variant: "neutral", label: "低" },
};

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const visual = PRIORITY_MAP[priority] ?? { variant: "neutral" as BadgeVariant, label: priority };
  return (
    <Badge variant={visual.variant} className={cn("gap-1", className)}>
      <span className="sr-only">优先级：</span>
      {visual.label}
    </Badge>
  );
}

export function TagBadge({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground" title={title}>
      {children}
    </Badge>
  );
}
