import type { Metadata } from "next";
import Link from "next/link";
import { Database, FileJson, HardDrive, Server, ShieldCheck } from "lucide-react";

import { DiagnosticsRunner } from "@/components/actions/diagnostics-runner";
import { FallbackConfigForm } from "@/components/actions/fallback-config-form";
import { LlmConfigForm } from "@/components/actions/llm-config-form";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLlmConfig, getRuntimeFallback } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getDataDir, getStoreMetrics, listDataFiles } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "运行时配置" };

export default async function SettingsPage() {
  const [llmConfig, fallback, files] = await Promise.all([getLlmConfig(), getRuntimeFallback(), listDataFiles()]);
  const metrics = getStoreMetrics();
  const dataDir = getDataDir();
  const usesEnvDir = Boolean(process.env.SNACKOPS_DATA_DIR?.trim());
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="运行时配置"
        description="模型参数与兜底策略直接决定 Agent 的行为边界。改完会立即写入 JSON，下一次请求生效。"
        meta={
          <>
            <TagBadge>运行时 {process.version}</TagBadge>
            <TagBadge>{process.platform}</TagBadge>
            <Badge variant={usesEnvDir ? "info" : "neutral"}>
              {usesEnvDir ? "数据目录来自 SNACKOPS_DATA_DIR" : "数据目录推导自项目根目录"}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="模型配置" description="llm-config.json · 默认 / 规划 / 兜底模型与采样参数">
            <LlmConfigForm config={llmConfig} />
          </SectionCard>

          <SectionCard title="兜底策略" description="runtime-fallback.json · 重试、转人工与降级开关">
            <FallbackConfigForm config={fallback} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="存储信息"
            description="服务端 JSON 存储的运行时事实"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/data">
                  <FileJson aria-hidden />
                  数据资源
                </Link>
              </Button>
            }
          >
            <dl className="divide-y text-[12px]">
              <div className="flex items-start justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <Database aria-hidden className="size-3.5" />
                  数据目录
                </dt>
                <dd className="max-w-[62%] truncate font-mono text-[11px] text-right" title={dataDir}>
                  {dataDir}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <FileJson aria-hidden className="size-3.5" />
                  JSON 文件
                </dt>
                <dd className="tabular">
                  {files.length} 个 · {(totalBytes / 1024).toFixed(1)} KB
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck aria-hidden className="size-3.5" />
                  写入策略
                </dt>
                <dd>临时文件 + fsync + 原子 rename</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <Server aria-hidden className="size-3.5" />
                  并发控制
                </dt>
                <dd>进程级按文件互斥锁</dd>
              </div>
            </dl>
            <div className="border-t px-4 py-2.5">
              <p className="text-muted-foreground mb-1.5 text-[10.5px] tracking-wide uppercase">本次进程写入统计</p>
              <div className="tabular grid grid-cols-2 gap-y-1 text-[11.5px] sm:grid-cols-4">
                <span className="text-muted-foreground">读 {metrics.reads}</span>
                <span className="text-muted-foreground">写 {metrics.writes}</span>
                <span className="text-muted-foreground">取锁 {metrics.lockAcquisitions}</span>
                <span className="text-muted-foreground">锁竞争 {metrics.lockContentions}</span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="存储自检" description="随时验证原子写与锁是否仍然生效">
            <DiagnosticsRunner />
          </SectionCard>

          <SectionCard title="最近更新的文件" description="按修改时间倒序">
            <ul className="divide-y text-[11.5px]">
              {[...files]
                .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
                .slice(0, 6)
                .map((file) => (
                  <li key={file.file} className="flex items-center justify-between gap-2 px-4 py-1.5">
                    <span className="font-mono text-[11px]">{file.file}</span>
                    <span className="text-muted-foreground tabular shrink-0 text-[10.5px]">
                      {formatDateTime(file.modifiedAt)}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="flex items-center gap-2 border-t px-4 py-2">
              <StatusBadge status="可用" />
              <span className="text-muted-foreground text-[11px]">客户端无法直接读写 data/ 目录</span>
              <HardDrive aria-hidden className="text-muted-foreground/60 ml-auto size-3.5" />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
