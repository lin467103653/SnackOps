import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Database, FileJson, FolderTree, HardDrive } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collectionGroups } from "@/lib/collections";
import { getDataDir, listDataFiles } from "@/lib/store";
import { getDataInventory } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { sum } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "数据资源" };

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default async function DataPage() {
  const [inventory, files] = await Promise.all([getDataInventory(), listDataFiles()]);
  const totalRecords = inventory.reduce((total, item) => total + item.count, 0);
  const totalBytes = sum(files.map((file) => file.bytes));
  const invalid = inventory.filter((item) => !item.ok);
  const latestWrite = files.reduce<string | null>((latest, file) => {
    if (!latest) return file.modifiedAt;
    return new Date(file.modifiedAt).getTime() > new Date(latest).getTime() ? file.modifiedAt : latest;
  }, null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="数据资源"
        description={`${inventory.length} 份 JSON 是这套运营台的全部事实来源。每个集合都有 zod 契约、中文标签和归属分组，客户端只能通过 API 读取。`}
        meta={
          <>
            <Badge variant="outline">集合 {inventory.length}</Badge>
            <Badge variant="outline">记录 {totalRecords}</Badge>
            <Badge variant={invalid.length > 0 ? "danger" : "success"}>
              {invalid.length > 0 ? `${invalid.length} 个集合校验失败` : "全部通过契约校验"}
            </Badge>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">
              <HardDrive aria-hidden />
              存储与诊断
            </Link>
          </Button>
        }
      />

      <section aria-label="数据指标" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard label="集合数量" value={inventory.length} unit="个" icon={FolderTree} hint="与需求清单一一对应" />
        <StatCard label="记录总数" value={totalRecords.toLocaleString("zh-CN")} unit="条" icon={FileJson} hint="清单 / 配置对象合计" />
        <StatCard label="数据体积" value={formatBytes(totalBytes)} icon={Database} hint="JSON 明文大小" />
        <StatCard
          label="最近写入"
          value={latestWrite ? formatDateTime(latestWrite) : "—"}
          icon={HardDrive}
          hint="原子 rename 完成时间"
        />
      </section>

      {invalid.length > 0 ? (
        <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-2.5">
          <p className="text-[12.5px] font-medium text-rose-900">{invalid.length} 个集合未通过 schema 校验</p>
          <ul className="mt-1 space-y-1 text-[11.5px] text-rose-800">
            {invalid.map((item) => (
              <li key={item.name}>
                <span className="font-mono">{item.file}</span>：{item.error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SectionCard
        title="集合清单"
        description={`数据目录：${getDataDir()}`}
        contentClassName="border-t"
      >
        <div className="divide-y">
          {collectionGroups.map((group) => {
            const items = inventory.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="bg-muted/40 flex items-center justify-between px-4 py-1.5">
                  <span className="text-muted-foreground text-[10.5px] font-medium tracking-widest uppercase">{group}</span>
                  <span className="text-muted-foreground tabular text-[10.5px]">{items.length} 个集合</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">集合</TableHead>
                      <TableHead>文件</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead className="text-right">记录数</TableHead>
                      <TableHead>契约</TableHead>
                      <TableHead className="pr-4 text-right">查看</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="pl-4">
                          <div className="flex flex-col">
                            <span className="text-[12.5px] font-medium">{item.label}</span>
                            <span className="text-muted-foreground max-w-[380px] text-[11px] leading-snug">{item.summary}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-[11px]">{item.file}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.kind === "config" ? "配置对象" : "记录列表"}</Badge>
                        </TableCell>
                        <TableCell className="tabular text-right text-[12px]">{item.count}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.ok ? "正常" : "异常"} />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`/data/${item.name}`}>
                              打开
                              <ArrowUpRight aria-hidden />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]">
        <Badge variant="outline" className="font-mono">
          GET /api/data/&lt;collection&gt;
        </Badge>
        <span>只读出口已开放（白名单 22 个集合）；写操作必须走各自的 POST/PATCH/PUT 接口。</span>
      </div>
    </div>
  );
}
