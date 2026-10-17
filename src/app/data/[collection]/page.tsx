import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Braces, FileJson, TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collectionRegistry, isCollectionName, loadCollection, type CollectionName } from "@/lib/collections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }): Promise<Metadata> {
  const { collection } = await params;
  if (!isCollectionName(collection)) return { title: "数据集合" };
  return { title: collectionRegistry[collection].label };
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((item) => renderCell(item)).join("、");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

const MAX_COLUMNS = 12;

export default async function CollectionPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!isCollectionName(collection)) notFound();

  const entry = collectionRegistry[collection as CollectionName];

  let data: unknown;
  try {
    data = await loadCollection(collection as CollectionName);
  } catch (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground -ml-1.5">
          <Link href="/data">
            <ArrowLeft aria-hidden />
            返回数据资源
          </Link>
        </Button>
        <PageHeader title={entry.label} description={`${entry.file} · ${entry.summary}`} />
        <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-rose-900">
            <TriangleAlert aria-hidden className="size-4" />
            该集合读取失败
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-rose-800">
            {error instanceof Error ? error.message : "未知错误"}
          </p>
          <p className="mt-1 text-[11.5px] text-rose-700">
            常见原因：文件缺失、JSON 语法错误、字段与 zod 契约不一致。修复 data/{entry.file} 后刷新即可。
          </p>
        </div>
      </div>
    );
  }

  const isList = Array.isArray(data);
  const rows = isList ? (data as Record<string, unknown>[]) : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const visibleColumns = columns.slice(0, MAX_COLUMNS);
  const hiddenCount = columns.length - visibleColumns.length;
  const objectEntries = !isList ? Object.entries(data as Record<string, unknown>) : [];
  const raw = JSON.stringify(data, null, 2);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="xs" className="text-muted-foreground -ml-1.5">
        <Link href="/data">
          <ArrowLeft aria-hidden />
          返回数据资源
        </Link>
      </Button>

      <PageHeader
        title={entry.label}
        description={entry.summary}
        meta={
          <>
            <Badge variant="outline" className="gap-1 font-mono">
              <FileJson aria-hidden className="size-3" />
              {entry.file}
            </Badge>
            <Badge variant="outline">{entry.kind === "config" ? "配置对象" : "记录列表"}</Badge>
            <Badge variant="outline">{isList ? `${rows.length} 条记录` : `${objectEntries.length} 个字段`}</Badge>
            <Badge variant="neutral">{entry.group}</Badge>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/api/data/${collection}`} target="_blank">
              <Braces aria-hidden />
              查看 API 输出
            </Link>
          </Button>
        }
      />

      {isList ? (
        <SectionCard title="记录" description={`展示前 ${MAX_COLUMNS} 个字段，完整内容见下方原始 JSON`} contentClassName="border-t">
          {rows.length === 0 ? (
            <EmptyState title="这个集合还是空的" description="后续版本会支持在这里直接新增记录。" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((column, index) => (
                    <TableHead key={column} className={index === 0 ? "pl-4" : undefined}>
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 24).map((row, rowIndex) => (
                  <TableRow key={String(row.id ?? rowIndex)}>
                    {visibleColumns.map((column, index) => {
                      const text = renderCell(row[column]);
                      return (
                        <TableCell
                          key={column}
                          title={text}
                          className={`max-w-[240px] truncate text-[11.5px] ${index === 0 ? "pl-4 font-mono" : ""}`}
                        >
                          {text.length > 60 ? `${text.slice(0, 58)}…` : text}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 border-t px-4 py-2 text-[10.5px]">
            <span>最多预览前 24 条</span>
            {hiddenCount > 0 ? <span>另有 {hiddenCount} 个字段未展示</span> : null}
            <span>数据由 zod 契约校验后才返回</span>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="配置字段" description="配置类集合是单个 JSON 对象" contentClassName="border-t">
          <dl className="divide-y">
            {objectEntries.map(([key, value]) => (
              <div key={key} className="grid gap-1 px-4 py-2 sm:grid-cols-[200px_minmax(0,1fr)]">
                <dt className="font-mono text-[11.5px]">{key}</dt>
                <dd className="text-[12px] break-words">{renderCell(value)}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}

      <SectionCard title="原始 JSON" description="只读预览，方便排查字段问题">
        <details className="px-4 py-2">
          <summary className="text-muted-foreground cursor-pointer text-[11.5px] select-none">
            展开 {entry.file}（{raw.length.toLocaleString("zh-CN")} 字符）
          </summary>
          <pre className="scroll-area-thin mt-2 max-h-[420px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
            {raw}
          </pre>
        </details>
      </SectionCard>
    </div>
  );
}
