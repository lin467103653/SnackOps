"use client";

import * as React from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useApiAction } from "@/hooks/use-api-action";

/** 把注册表里的正文重新导出成 skills/<id>.md */
export function ExportMirrorButton({ skillId, label = "重新导出" }: { skillId: string; label?: string }) {
  const { run, pending } = useApiAction();

  async function handleExport() {
    const payload = await run<{ data: { exported: boolean; filePath: string; bytes: number } }>(`/api/skills/${skillId}`, {
      method: "POST",
      successMessage: "镜像文件已重新导出",
    });
    if (payload?.data) toast.success(`已写入 ${payload.data.filePath}（${payload.data.bytes} 字节）`);
  }

  return (
    <Button size="xs" variant="outline" onClick={handleExport} disabled={pending}>
      <FileDown aria-hidden />
      {pending ? "导出中…" : label}
    </Button>
  );
}
