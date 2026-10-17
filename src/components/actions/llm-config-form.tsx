"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { formatDateTime } from "@/lib/format";
import type { LlmConfig } from "@/lib/types";

export function LlmConfigForm({ config }: { config: LlmConfig }) {
  const { run, pending } = useApiAction();
  const [defaultModel, setDefaultModel] = React.useState(config.defaultModel);
  const [plannerModel, setPlannerModel] = React.useState(config.plannerModel);
  const [fallbackModel, setFallbackModel] = React.useState(config.fallbackModel);
  const [temperature, setTemperature] = React.useState(String(config.temperature));
  const [maxTokens, setMaxTokens] = React.useState(String(config.maxTokens));
  const [timeoutMs, setTimeoutMs] = React.useState(String(config.timeoutMs));
  const [plannerMaxSteps, setPlannerMaxSteps] = React.useState(String(config.plannerMaxSteps));
  const [enabledTools, setEnabledTools] = React.useState(config.enabledTools.join(", "));
  const [notes, setNotes] = React.useState(config.notes);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run("/api/config", {
      method: "PUT",
      body: {
        key: "llm-config",
        value: {
          defaultModel: defaultModel.trim(),
          plannerModel: plannerModel.trim(),
          fallbackModel: fallbackModel.trim(),
          temperature: Number(temperature),
          maxTokens: Number(maxTokens),
          timeoutMs: Number(timeoutMs),
          plannerMaxSteps: Number(plannerMaxSteps),
          enabledTools: enabledTools
            .split(",")
            .map((tool) => tool.trim())
            .filter(Boolean),
          notes: notes.trim(),
        },
      },
      successMessage: "模型配置已保存（llm-config.json）",
    });
    if (!payload) toast.error("保存失败，请检查字段是否合法");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="llm-default">默认模型</Label>
          <Input
            id="llm-default"
            value={defaultModel}
            onChange={(event) => setDefaultModel(event.target.value)}
            className="h-8 font-mono text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="llm-planner">Planner 模型</Label>
          <Input
            id="llm-planner"
            value={plannerModel}
            onChange={(event) => setPlannerModel(event.target.value)}
            className="h-8 font-mono text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="llm-fallback">兜底模型</Label>
          <Input
            id="llm-fallback"
            value={fallbackModel}
            onChange={(event) => setFallbackModel(event.target.value)}
            className="h-8 font-mono text-[12px]"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="llm-temp">温度</Label>
          <Input
            id="llm-temp"
            type="number"
            step="0.05"
            min={0}
            max={2}
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="llm-tokens">最大 Token</Label>
          <Input
            id="llm-tokens"
            type="number"
            min={256}
            step={128}
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="llm-timeout">超时(ms)</Label>
          <Input
            id="llm-timeout"
            type="number"
            min={1000}
            step={500}
            value={timeoutMs}
            onChange={(event) => setTimeoutMs(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="llm-steps">Planner 步数上限</Label>
          <Input
            id="llm-steps"
            type="number"
            min={1}
            max={12}
            value={plannerMaxSteps}
            onChange={(event) => setPlannerMaxSteps(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="llm-tools">启用工具（英文逗号分隔的工具 key）</Label>
        <Textarea
          id="llm-tools"
          value={enabledTools}
          onChange={(event) => setEnabledTools(event.target.value)}
          className="min-h-[54px] font-mono text-[11.5px]"
          rows={2}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="llm-notes">值班备注</Label>
        <Input
          id="llm-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="h-8 text-[12px]"
          maxLength={120}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">
          最近更新：{formatDateTime(config.updatedAt)} · {config.updatedBy}
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          <Save aria-hidden />
          {pending ? "保存中…" : "保存模型配置"}
        </Button>
      </div>
    </form>
  );
}
