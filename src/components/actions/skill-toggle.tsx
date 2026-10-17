"use client";

import * as React from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { useApiAction } from "@/hooks/use-api-action";

/** 启用 / 停用：状态不只靠颜色表达，右侧固定显示「已启用 / 已停用」 */
export function SkillToggle({ skillId, enabled, compact = false }: { skillId: string; enabled: boolean; compact?: boolean }) {
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
    const payload = await run(`/api/skills/${skillId}`, {
      method: "PATCH",
      body: { enabled: next },
      successMessage: next ? "已启用：Planner / Executor 下次读取会带上它" : "已停用：注册表读取不再返回它",
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
        aria-label={`${checked ? "停用" : "启用"} Skill ${skillId}`}
      />
      <span className={compact ? "text-[11px] whitespace-nowrap" : "text-[12px] whitespace-nowrap"}>
        {checked ? "已启用" : "已停用"}
      </span>
    </div>
  );
}
