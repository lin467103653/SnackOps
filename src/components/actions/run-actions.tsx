"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bug, HandHelping, Loader2, MessageSquarePlus, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { ANNOTATION_TAGS } from "@/lib/constants";

export function RetryButton({ runId }: { runId: string }) {
  const { run, pending } = useApiAction();
  const router = useRouter();

  async function handleRetry() {
    const payload = await run<{ data: { runId: string; status: string } }>("/api/run/retry", {
      body: { runId },
      successMessage: "已重跑，正在打开新的运行记录",
    });
    if (payload?.data?.runId) router.push(`/runs/${payload.data.runId}`);
  }

  return (
    <Button size="sm" variant="outline" onClick={handleRetry} disabled={pending}>
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
      {pending ? "重跑中…" : "重试一次"}
    </Button>
  );
}

export function HandoffButton({ runId, disabled }: { runId: string; disabled?: boolean }) {
  const { run, pending } = useApiAction();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || disabled}
      onClick={() =>
        run(`/api/runs/${runId}/handoff`, {
          body: { reason: "运营在工作台标记接管" },
          successMessage: "已标记人工接管",
        })
      }
    >
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <HandHelping aria-hidden />}
      {pending ? "标记中…" : "人工接管"}
    </Button>
  );
}

export function RunAnnotateForm({ runId }: { runId: string }) {
  const { run, pending } = useApiAction();
  const [tag, setTag] = React.useState<string>("待优化");
  const [note, setNote] = React.useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (note.trim().length < 4) {
      toast.error("标注至少 4 个字");
      return;
    }
    const payload = await run("/api/runs/" + runId + "/annotate", {
      body: { tag, note: note.trim() },
      successMessage: "标注已保存",
    });
    if (payload) setNote("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="space-y-1">
          <Label htmlFor="run-annotation-tag">标注类型</Label>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger id="run-annotation-tag" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNOTATION_TAGS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="run-annotation-note">标注说明</Label>
          <Textarea
            id="run-annotation-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：价格算对了，但没提到不可叠加，用户容易误以为能一起用"
            className="min-h-[56px] text-[12px]"
            maxLength={280}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">{note.trim().length}/280</p>
        <Button type="submit" size="sm" disabled={pending}>
          <MessageSquarePlus aria-hidden />
          {pending ? "保存中…" : "保存标注"}
        </Button>
      </div>
    </form>
  );
}

export function ExplainPanel({ runId }: { runId: string }) {
  const { run, pending } = useApiAction();
  const [explanation, setExplanation] = React.useState<{ text: string; provider: string; fixture: boolean } | null>(null);

  async function handleExplain() {
    const payload = await run<{ data: { explanation: string; provider: string; fixture: boolean } }>("/api/explain", {
      body: { runId },
    });
    if (payload?.data) {
      setExplanation({ text: payload.data.explanation, provider: payload.data.provider, fixture: payload.data.fixture });
    }
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">让模型解释这次运行为什么得到这个结果（结论基于记录，不编造）</p>
        <Button size="xs" variant="outline" onClick={handleExplain} disabled={pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
          {pending ? "生成中…" : "解释这次运行"}
        </Button>
      </div>
      {explanation ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[10.5px]">
            <Bug aria-hidden className="size-3" />
            来源：{explanation.provider}
            {explanation.fixture ? " · 课堂演示模式" : ""}
          </p>
          <pre className="scroll-area-thin max-h-[320px] overflow-auto text-[11.5px] leading-relaxed whitespace-pre-wrap">
            {explanation.text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
