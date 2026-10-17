import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Database, FileJson, Layers, TableProperties } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCatalogSections } from "@/lib/catalog";
import { collectionNames } from "@/lib/collections";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "业务数据目录" };

const TONE_CLASS = {
  default: "text-foreground",
  warning: "text-amber-700",
  danger: "text-rose-700",
} as const;

export default async function CatalogPage() {
  const sections = await getCatalogSections();
  const totalRecords = sections.reduce((total, section) => total + section.count, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="业务数据目录"
        description="按数据类型看摘要：有多少条、关键分布是什么、有哪些需要人盯的点。每一类都能一键跳到原始数据或 API。"
        meta={
          <>
            <Badge variant="outline">{sections.length} 类业务数据</Badge>
            <Badge variant="outline">{collectionNames.length} 个 JSON 集合</Badge>
            <Badge variant="outline">业务记录 {totalRecords}</Badge>
            <TagBadge>生成于 {formatDateTime(new Date())}</TagBadge>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/data">
              <Database aria-hidden />
              全部集合
            </Link>
          </Button>
        }
      />

      <section aria-label="目录指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="数据类型" value={sections.length} unit="类" icon={Layers} hint="商品 → 转人工规则" />
        <StatCard label="业务记录" value={totalRecords} unit="条" icon={TableProperties} hint="10 类业务表合计" />
        <StatCard label="数据集合" value={collectionNames.length} unit="个" icon={FileJson} hint="含注册表与运行时配置" />
        <StatCard
          label="含风险项的数据"
          value={sections.filter((section) => section.stats.some((stat) => stat.tone === "danger")).length}
          unit="类"
          icon={Database}
          tone="warning"
          hint="库存、物流、工单等有异常的数据类型"
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((section) => (
          <SectionCard
            key={section.key}
            title={section.title}
            description={section.description}
            action={
              <Badge variant="outline">
                {section.count} {section.countLabel}
              </Badge>
            }
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10.5px]">/data/{section.collection}</span>
                <div className="flex items-center gap-1">
                  <Button asChild variant="ghost" size="xs">
                    <Link href={`/api/data/${section.collection}`} target="_blank">
                      API
                      <ArrowUpRight aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="xs">
                    <Link href={section.href}>
                      查看数据
                      <ArrowUpRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            }
          >
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0 divide-y xl:grid-cols-4 xl:divide-y-0">
              {section.stats.map((stat) => (
                <div key={stat.label} className="px-4 py-2">
                  <dt className="text-muted-foreground text-[10.5px]">{stat.label}</dt>
                  <dd className={`tabular mt-0.5 text-[13px] font-medium ${TONE_CLASS[stat.tone ?? "default"]}`}>
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="border-t px-4 py-2.5">
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">值得注意</p>
              <ul className="space-y-1 text-[11.5px] leading-relaxed">
                {section.highlights.length === 0 ? (
                  <li className="text-muted-foreground">暂无需要关注的内容</li>
                ) : (
                  section.highlights.map((highlight) => (
                    <li key={highlight} className="truncate" title={highlight}>
                      · {highlight}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="注册表与业务数据的关系" description="Planner 读取注册表决定「怎么做」，Tool 读取业务数据决定「依据什么」">
        <div className="grid gap-3 px-4 py-3 text-[11.5px] leading-relaxed sm:grid-cols-3">
          <div>
            <p className="font-medium">① 注册表（能力）</p>
            <p className="text-muted-foreground mt-0.5">
              data/skills.json 与 data/tools.json 描述有哪些能力、参数是什么、是否启用。
            </p>
            <Button asChild variant="ghost" size="xs" className="mt-1 -ml-2">
              <Link href="/skills">Skill 管理</Link>
            </Button>
          </div>
          <div>
            <p className="font-medium">② 业务数据（依据）</p>
            <p className="text-muted-foreground mt-0.5">
              商品、活动、券、订单、物流、政策、FAQ 与转人工规则，全部由 Tool 读取。
            </p>
            <Button asChild variant="ghost" size="xs" className="mt-1 -ml-2">
              <Link href="/data">数据资源</Link>
            </Button>
          </div>
          <div>
            <p className="font-medium">③ 运行与评测（结果）</p>
            <p className="text-muted-foreground mt-0.5">
              运行记录、评分、标注与评测批次记录「做得怎么样」，反过来驱动改进项。
            </p>
            <Button asChild variant="ghost" size="xs" className="mt-1 -ml-2">
              <Link href="/runs">运行记录</Link>
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
