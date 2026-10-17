/**
 * 只读聚合查询：总览指标、趋势、Skill 健康度、风险清单、数据资源盘点。
 * 纯函数 + 一次并行读数，方便后续替换成真实数仓而不动页面。
 */
import { collectionNames, collectionRegistry, loadCollectionSafe, type CollectionName } from "./collections";
import {
  getEvalBatches,
  getImprovements,
  getLogistics,
  getOrders,
  getRatings,
  getRuns,
  getSkillVersions,
  getSkills,
  getTickets,
  getUsers,
} from "./data";
import { dayKey, lastDayKeys, shortDayLabel } from "./format";
import { countBy, groupBy, median, ratio, sum } from "./utils";
import type { AgentRun, EvalBatchV2, Improvement, LogisticsRecord, Skill, SkillVersion, Ticket } from "./types";

const DAY_MS = 86_400_000;

function withinDays(value: string, days: number, now = Date.now()): boolean {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && ts >= now - days * DAY_MS && ts <= now + 60_000;
}

export interface RunTrendPoint {
  date: string;
  label: string;
  total: number;
  success: number;
  takesOver: number;
  failed: number;
  successRate: number;
}

export function buildRunTrend(runs: AgentRun[], days = 14, now = new Date()): RunTrendPoint[] {
  const keys = lastDayKeys(days, now);
  const byDay = groupBy(runs, (run) => dayKey(run.startedAt));
  return keys.map((key) => {
    const dayRuns = byDay[key] ?? [];
    const success = dayRuns.filter((run) => run.status === "成功").length;
    const takesOver = dayRuns.filter((run) => run.status === "已接管").length;
    const failed = dayRuns.filter((run) => run.status === "失败" || run.status === "超时").length;
    return {
      date: key,
      label: shortDayLabel(key),
      total: dayRuns.length,
      success,
      takesOver,
      failed,
      successRate: ratio(success, dayRuns.length),
    };
  });
}

export interface SkillHealthRow {
  id: string;
  name: string;
  stage: Skill["stage"];
  enabled: boolean;
  version: string;
  runs7d: number;
  successRate: number;
  evalScore: number | null;
  hasRegression: boolean;
  p95LatencyMs: number;
}

export function buildSkillHealth(skills: Skill[], versions: SkillVersion[], runs: AgentRun[], now = Date.now()): SkillHealthRow[] {
  // 每个 Skill 取最近一次保存的快照，用于展示评测分与回归标记
  const latestVersion = new Map<string, SkillVersion>();
  for (const version of versions) {
    const current = latestVersion.get(version.skillId);
    if (!current || new Date(version.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      latestVersion.set(version.skillId, version);
    }
  }

  return skills
    .map((skill) => {
      const recent = runs.filter((run) => run.skillKey === skill.id && withinDays(run.startedAt, 7, now));
      const success = recent.filter((run) => run.status === "成功").length;
      const snapshot = latestVersion.get(skill.id);
      const latencies = recent.map((run) => run.latencyMs).sort((a, b) => a - b);
      const p95 = latencies.length > 0 ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]! : 0;
      return {
        id: skill.id,
        name: skill.name,
        stage: skill.stage,
        enabled: skill.enabled,
        version: skill.version,
        runs7d: recent.length,
        successRate: ratio(success, recent.length),
        evalScore: snapshot?.evalScore ?? null,
        hasRegression: snapshot?.regression ?? false,
        p95LatencyMs: p95,
      } satisfies SkillHealthRow;
    })
    .sort((a, b) => b.runs7d - a.runs7d);
}

export type RiskKind = "物流异常" | "退款积压" | "高风险用户" | "SLA 超时";

export interface RiskItem {
  id: string;
  kind: RiskKind;
  title: string;
  detail: string;
  href: string;
  severity: "高" | "中" | "低";
}

export function buildRiskItems(input: {
  logistics: LogisticsRecord[];
  orders: Awaited<ReturnType<typeof getOrders>>;
  users: Awaited<ReturnType<typeof getUsers>>;
  now?: Date;
}): RiskItem[] {
  const now = input.now ?? new Date();
  const items: RiskItem[] = [];

  for (const record of input.logistics.filter((item) => item.status === "异常")) {
    items.push({
      id: `logistics-${record.id}`,
      kind: "物流异常",
      title: `${record.carrier} ${record.city} 轨迹异常`,
      detail: `${record.orderNo} · ${record.lastEvent} · 已延误 ${record.delayHours} 小时`,
      href: "/data/logistics",
      severity: record.delayHours >= 24 ? "高" : "中",
    });
  }

  const stuckRefunds = input.orders.filter(
    (order) => order.status === "退款中" && now.getTime() - new Date(order.createdAt).getTime() > 2 * DAY_MS,
  );
  if (stuckRefunds.length > 0) {
    items.push({
      id: "refund-backlog",
      kind: "退款积压",
      title: `${stuckRefunds.length} 笔退款超过 48 小时未闭环`,
      detail: stuckRefunds
        .slice(0, 3)
        .map((order) => order.orderNo)
        .join("、"),
      href: "/data/orders",
      severity: stuckRefunds.length >= 3 ? "高" : "中",
    });
  }

  const highRisk = input.users.filter((user) => user.risk === "高风险");
  if (highRisk.length > 0) {
    items.push({
      id: "high-risk-user",
      kind: "高风险用户",
      title: `${highRisk.length} 位高风险用户有待处理诉求`,
      detail: highRisk.map((user) => user.nickname).join("、"),
      href: "/data/users",
      severity: "中",
    });
  }

  return items.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function severityWeight(severity: RiskItem["severity"]): number {
  return severity === "高" ? 3 : severity === "中" ? 2 : 1;
}

export interface OverviewData {
  kpis: {
    runsToday: number;
    runs7d: number;
    autoResolveRate: number;
    medianLatencyMs: number;
    pendingHandoff: number;
    evalPassRate: number;
    cost7d: number;
    openRisks: number;
    ratingAvg: number;
  };
  trend: RunTrendPoint[];
  statusCounts: Record<string, number>;
  skillHealth: SkillHealthRow[];
  queue: Ticket[];
  recentRuns: AgentRun[];
  risks: RiskItem[];
  latestBatches: EvalBatchV2[];
  activeImprovements: Improvement[];
  unreadAnnotations: number;
}

export async function getOverview(now = new Date()): Promise<OverviewData> {
  const [runs, tickets, skills, versions, batches, improvements, logistics, orders, users, ratings] = await Promise.all([
    getRuns(),
    getTickets(),
    getSkills(),
    getSkillVersions(),
    getEvalBatches(),
    getImprovements(),
    getLogistics(),
    getOrders(),
    getUsers(),
    getRatings(),
  ]);

  const runs7d = runs.filter((run) => withinDays(run.startedAt, 7, now.getTime()));
  const runsToday = runs.filter((run) => dayKey(run.startedAt) === dayKey(now));
  const success7d = runs7d.filter((run) => run.status === "成功").length;
  const pendingStatuses: Ticket["status"][] = ["待处理", "已升级", "处理中"];

  const queue = tickets
    .filter((ticket) => pendingStatuses.includes(ticket.status))
    .sort((a, b) => {
      const weight: Record<Ticket["priority"], number> = { 紧急: 4, 高: 3, 中: 2, 低: 1 };
      const diff = weight[b.priority] - weight[a.priority];
      return diff !== 0 ? diff : new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
    });

  const completedBatches = batches
    .filter((batch) => batch.status === "done")
    .sort((a, b) => new Date(b.finishedAt ?? b.createdAt).getTime() - new Date(a.finishedAt ?? a.createdAt).getTime());
  const latest = completedBatches[0];
  // 通过率分母排除 ERROR：与 /eval 的评分口径一致
  const evalPassRate = latest
    ? ratio(latest.passed, latest.passed + latest.failed + latest.review)
    : 0;

  const risks = buildRiskItems({ logistics, orders, users, now });

  return {
    kpis: {
      runsToday: runsToday.length,
      runs7d: runs7d.length,
      autoResolveRate: ratio(success7d, runs7d.length),
      medianLatencyMs: median(runs7d.map((run) => run.latencyMs)),
      pendingHandoff: queue.filter((ticket) => ticket.status !== "处理中").length,
      evalPassRate,
      cost7d: Math.round(sum(runs7d.map((run) => run.costYuan)) * 100) / 100,
      openRisks: risks.length,
      ratingAvg: ratings.length > 0 ? sum(ratings.map((rating) => rating.score)) / ratings.length : 0,
    },
    trend: buildRunTrend(runs, 14, now),
    statusCounts: countBy(runs7d, (run) => run.status),
    skillHealth: buildSkillHealth(skills, versions, runs, now.getTime()),
    queue: queue.slice(0, 6),
    recentRuns: [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 6),
    risks: risks.slice(0, 5),
    latestBatches: completedBatches.slice(0, 3),
    activeImprovements: improvements
      .filter((item) => item.status === "进行中" || item.status === "已排期")
      .sort((a, b) => a.priority.localeCompare(b.priority))
      .slice(0, 4),
    unreadAnnotations: 0,
  };
}

export interface CollectionInventoryItem {
  name: CollectionName;
  file: string;
  label: string;
  group: string;
  summary: string;
  kind: "list" | "config";
  ok: boolean;
  count: number;
  error?: string;
}

/** /data 页面：逐个集合校验并计数，损坏的集合单独标红而不是整页崩溃 */
export async function getDataInventory(): Promise<CollectionInventoryItem[]> {
  const results = await Promise.all(
    collectionNames.map(async (name) => {
      const entry = collectionRegistry[name];
      const outcome = await loadCollectionSafe(name);
      const count = outcome.ok
        ? Array.isArray(outcome.data)
          ? outcome.data.length
          : Object.keys(outcome.data as Record<string, unknown>).length
        : 0;
      return {
        name,
        file: entry.file,
        label: entry.label,
        group: entry.group,
        summary: entry.summary,
        kind: entry.kind,
        ok: outcome.ok,
        count,
        error: outcome.ok ? undefined : outcome.error,
      } satisfies CollectionInventoryItem;
    }),
  );
  return results;
}

export interface TicketWithMeta {
  ticket: Ticket;
  skillName: string | null;
  slaOverdue: boolean;
}

export function enrichTickets(tickets: Ticket[], skills: Skill[], now = new Date()): TicketWithMeta[] {
  const skillNameById = new Map(skills.map((skill) => [skill.id, skill.name]));
  return tickets.map((ticket) => ({
    ticket,
    skillName: skillNameById.get(intentToSkillId(ticket) ?? "") ?? null,
    slaOverdue: new Date(ticket.slaDueAt).getTime() < now.getTime() && ticket.status !== "已解决",
  }));
}

/** 工单意图 → 负责该阶段的 Skill id（供列表展示「谁会处理」） */
function intentToSkillId(ticket: Ticket): string | null {
  switch (ticket.intent) {
    case "催发货":
    case "物流异常":
      return "human-handoff-decision";
    case "退款退货":
      return "after-sales-classification";
    case "优惠咨询":
      return "recommendation-reason";
    case "商品咨询":
      return "recommendation-decision";
    case "改地址":
      return "clarification-question";
    case "投诉":
      return "complaint-triage";
    default:
      return null;
  }
}
