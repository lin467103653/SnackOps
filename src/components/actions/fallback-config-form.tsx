"use client";

import * as React from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { FALLBACK_POLICIES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { RuntimeFallback } from "@/lib/types";

export function FallbackConfigForm({ config }: { config: RuntimeFallback }) {
  const { run, pending } = useApiAction();
  const [defaultPolicy, setDefaultPolicy] = React.useState<string>(config.defaultPolicy);
  const [maxRetries, setMaxRetries] = React.useState(String(config.maxRetries));
  const [retryBackoffMs, setRetryBackoffMs] = React.useState(String(config.retryBackoffMs));
  const [humanHandoffSlaMinutes, setHumanHandoffSlaMinutes] = React.useState(String(config.humanHandoffSlaMinutes));
  const [degradedMode, setDegradedMode] = React.useState(config.degradedMode);
  const [notices, setNotices] = React.useState(config.notices.join("\n"));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("/api/config", {
      method: "PUT",
      body: {
        key: "runtime-fallback",
        value: {
          defaultPolicy,
          maxRetries: Number(maxRetries),
          retryBackoffMs: Number(retryBackoffMs),
          humanHandoffSlaMinutes: Number(humanHandoffSlaMinutes),
          degradedMode,
          notices: notices
            .split("\n")
            .map((notice) => notice.trim())
            .filter(Boolean),
        },
      },
      successMessage: "兜底策略已保存（runtime-fallback.json）",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="fb-policy">默认兜底动作</Label>
          <Select value={defaultPolicy} onValueChange={setDefaultPolicy}>
            <SelectTrigger id="fb-policy" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FALLBACK_POLICIES.map((policy) => (
                <SelectItem key={policy} value={policy}>
                  {policy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fb-sla">转人工 SLA（分钟）</Label>
          <Input
            id="fb-sla"
            type="number"
            min={1}
            value={humanHandoffSlaMinutes}
            onChange={(event) => setHumanHandoffSlaMinutes(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="fb-retries">最大重试次数</Label>
          <Input
            id="fb-retries"
            type="number"
            min={0}
            max={5}
            value={maxRetries}
            onChange={(event) => setMaxRetries(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fb-backoff">重试退避（ms）</Label>
          <Input
            id="fb-backoff"
            type="number"
            min={0}
            step={100}
            value={retryBackoffMs}
            onChange={(event) => setRetryBackoffMs(event.target.value)}
            className="h-8 tabular text-[12px]"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div>
          <p className="text-[12.5px] font-medium">降级模式</p>
          <p className="text-muted-foreground text-[11px]">开启后仅回复知识库命中内容，不再调用写操作工具。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] font-medium">{degradedMode ? "已开启" : "已关闭"}</span>
          <Switch checked={degradedMode} onCheckedChange={setDegradedMode} aria-label="切换降级模式" />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="fb-notices">值班提示（每行一条）</Label>
        <Textarea
          id="fb-notices"
          value={notices}
          onChange={(event) => setNotices(event.target.value)}
          className="min-h-[62px] text-[12px]"
          rows={3}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">最近更新：{formatDateTime(config.updatedAt)}</p>
        <Button type="submit" size="sm" disabled={pending}>
          <Save aria-hidden />
          {pending ? "保存中…" : "保存兜底策略"}
        </Button>
      </div>
    </form>
  );
}
