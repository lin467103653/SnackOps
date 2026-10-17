import {
  Activity,
  Boxes,
  Bot,
  ClipboardCheck,
  Cpu,
  Database,
  FlaskConical,
  LayoutDashboard,
  MessageSquare,
  Route,
  Settings2,
  Sparkles,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: NavGroup;
}

export type NavGroup = "观测" | "Agent 资产" | "质量闭环" | "管理后台" | "系统";

export const navGroups: NavGroup[] = ["观测", "Agent 资产", "质量闭环", "管理后台", "系统"];

export const navItems: NavItem[] = [
  {
    href: "/",
    label: "Agent 工作台",
    description: "输入问题，看 Plan / Trace / 风险审查",
    icon: Bot,
    group: "观测",
  },
  {
    href: "/demo",
    label: "聊天演示",
    description: "简化对话界面，同一条主链路",
    icon: MessageSquare,
    group: "观测",
  },
  {
    href: "/ops",
    label: "运营中心",
    description: "运行监控、评分、标注、规则聚类与改进闭环",
    icon: ClipboardCheck,
    group: "观测",
  },
  {
    href: "/overview",
    label: "运营总览",
    description: "运行、接管、风险与改进的当日快照",
    icon: LayoutDashboard,
    group: "观测",
  },
  {
    href: "/runs",
    label: "运行记录",
    description: "Agent 运行与历史 Trace",
    icon: Activity,
    group: "观测",
  },
  {
    href: "/skills",
    label: "Skill 管理",
    description: "技能定义、版本流水与上线评测",
    icon: Sparkles,
    group: "Agent 资产",
  },
  {
    href: "/tools",
    label: "Tool 管理",
    description: "工具能力、风险等级与运行参数",
    icon: Wrench,
    group: "Agent 资产",
  },
  {
    href: "/eval",
    label: "评测集",
    description: "走 Agent 主链路的用例、单条测试与评分证据",
    icon: FlaskConical,
    group: "质量闭环",
  },
  {
    href: "/evals",
    label: "评测与实验",
    description: "用例、批次与 AB 实验结论",
    icon: FlaskConical,
    group: "质量闭环",
  },
  {
    href: "/improvements",
    label: "改进闭环",
    description: "从 badcase 到上线的排期与验收",
    icon: TrendingUp,
    group: "质量闭环",
  },
  {
    href: "/planner",
    label: "Planner 管理",
    description: "版本、提示词、可选能力与计划预览",
    icon: Route,
    group: "管理后台",
  },
  {
    href: "/models",
    label: "模型管理",
    description: "Provider、模型列表、连接测试与切换",
    icon: Cpu,
    group: "管理后台",
  },
  {
    href: "/catalog",
    label: "业务数据目录",
    description: "商品、活动、券、订单、政策与转人工规则摘要",
    icon: Boxes,
    group: "系统",
  },
  {
    href: "/data",
    label: "数据资源",
    description: "全部 JSON 集合的契约与容量",
    icon: Database,
    group: "系统",
  },
  {
    href: "/settings",
    label: "运行时配置",
    description: "模型、兜底策略与存储信息",
    icon: Settings2,
    group: "系统",
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/") return navItems[0];
  return navItems.find((item) => item.href !== "/" && pathname.startsWith(item.href));
}
