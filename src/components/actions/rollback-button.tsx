"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * 版本回滚按钮：点击后需要二次确认，确认才调 POST /api/skills/[id]/rollback。
 * 回滚会以旧正文生成新版本（不会丢历史）。
 */
export function RollbackButton({
  skillId,
  version,
  size = "xs",
  variant = "ghost",
  label = "回滚",
}: {
  skillId: string;
  version: string;
  size?: "xs" | "sm";
  variant?: "ghost" | "outline" | "default";
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function rollback() {
    setPending(true);
    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(skillId)}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: { newVersion: string; restoredFrom: string } }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !payload || payload.ok === false) {
        toast.error(payload && "error" in payload ? payload.error : `回滚失败（HTTP ${response.status}）`);
        return;
      }

      toast.success(`已回滚到 v${payload.data.restoredFrom}，当前版本 v${payload.data.newVersion}`);
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "网络错误");
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button size={size} variant={variant} onClick={() => setConfirming(true)} disabled={pending}>
        <RotateCcw aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <span className="text-muted-foreground text-[10.5px]">回滚到 v{version}？</span>
      <Button size="xs" variant="default" onClick={rollback} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
        确认
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
        取消
      </Button>
    </span>
  );
}
