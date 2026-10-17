"use client";

import * as React from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useApiAction } from "@/hooks/use-api-action";

export function ToolToggle({ toolId, enabled }: { toolId: string; enabled: boolean }) {
  const { run, pending } = useApiAction();
  const [checked, setChecked] = React.useState(enabled);
  const [syncedFrom, setSyncedFrom] = React.useState(enabled);

  // 服务端刷新后 props 会变：用「渲染期同步」而不是 effect，避免级联渲染
  if (syncedFrom !== enabled) {
    setSyncedFrom(enabled);
    setChecked(enabled);
  }

  async function handleChange(next: boolean) {
    setChecked(next);
    const payload = await run(`/api/tools/${toolId}`, {
      method: "PATCH",
      body: { enabled: next },
      successMessage: next ? "已启用：Planner 可以调用该工具" : "已停用：Planner 不再拿到该工具",
    });
    if (!payload) {
      setChecked(!next);
      toast.error("切换失败，已恢复原状态");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        onCheckedChange={handleChange}
        disabled={pending}
        aria-label={`${checked ? "停用" : "启用"} Tool ${toolId}`}
      />
      <span className="text-[11.5px] whitespace-nowrap">{checked ? "已启用" : "已停用"}</span>
    </div>
  );
}
