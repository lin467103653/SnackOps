"use client";

import * as React from "react";
import { Play, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useApiAction } from "@/hooks/use-api-action";

interface ToolTestPayload {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export function ToolTestButton({ toolKey, disabled }: { toolKey: string; disabled?: boolean }) {
  const { run, pending } = useApiAction();
  const [result, setResult] = React.useState<ToolTestPayload | null>(null);

  async function handleTest() {
    const payload = await run<{ data: ToolTestPayload }>("/api/tools/test", { body: { toolKey } });
    if (!payload?.data) return;
    setResult(payload.data);
    if (payload.data.ok) toast.success(payload.data.message);
    else toast.warning(payload.data.message);
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {result ? (
        <span className="text-muted-foreground tabular text-[10.5px] whitespace-nowrap" aria-live="polite">
          {result.ok ? "连通" : "异常"} · {result.latencyMs} ms
        </span>
      ) : null}
      <Button size="xs" variant="outline" onClick={handleTest} disabled={pending || disabled}>
        {pending ? <ShieldCheck aria-hidden /> : disabled ? <ShieldAlert aria-hidden /> : <Play aria-hidden />}
        {pending ? "测试中…" : "测试"}
      </Button>
    </div>
  );
}
