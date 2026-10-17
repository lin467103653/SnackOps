"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, Home, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SnackOps] 页面渲染失败", error);
  }, [error]);

  const isStoreError = /json|数据文件|data\//i.test(error.message);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
      <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full" aria-hidden>
        <AlertOctagon className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">页面加载失败</h2>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          {isStoreError
            ? "读取服务端 JSON 数据时出错。可以检查 data/ 目录下对应文件是否存在、是否为合法 JSON，然后重试。"
            : "渲染过程中出现异常。可以先重试，若持续失败请查看服务端日志。"}
        </p>
      </div>

      <pre className="bg-muted text-muted-foreground max-w-full overflow-x-auto rounded-md px-3 py-2 text-left font-mono text-[11px] whitespace-pre-wrap">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>

      <div className="flex items-center gap-2">
        <Button onClick={reset} size="sm">
          <RotateCcw aria-hidden />
          重试
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <Home aria-hidden />
            返回总览
          </Link>
        </Button>
      </div>
    </div>
  );
}
