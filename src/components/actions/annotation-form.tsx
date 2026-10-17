"use client";

import * as React from "react";
import { CheckCheck, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";
import { ANNOTATION_TAGS, type AnnotationTagValue } from "@/lib/constants";

export function AnnotationForm({
  targetType,
  targetId,
  title = "标注这条样本",
  description = "标注会进入改进闭环，作为下一轮 Skill 迭代的输入。",
}: {
  targetType: "run" | "skill_version" | "eval_case" | "ticket";
  targetId: string;
  title?: string;
  description?: string;
}) {
  const { run, pending } = useApiAction();
  const [tag, setTag] = React.useState<AnnotationTagValue>("待优化");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = note.trim();
    if (trimmed.length < 4) {
      setError("请至少写 4 个字，说明问题或亮点，否则后续无法复盘");
      toast.error("标注内容太短，至少 4 个字");
      return;
    }

    setError(null);
    const result = await run("/api/annotations", {
      body: { targetType, targetId, tag, note: trimmed },
      successMessage: "标注已保存，已进入改进候选",
    });
    if (result) setNote("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium">{title}</p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">{description}</p>
        </div>
        <MessageSquarePlus aria-hidden className="text-muted-foreground/60 mt-0.5 size-4 shrink-0" />
      </div>

      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="space-y-1">
          <Label htmlFor="annotation-tag">标注类型</Label>
          <Select value={tag} onValueChange={(value) => setTag(value as AnnotationTagValue)}>
            <SelectTrigger id="annotation-tag" size="sm" className="w-full">
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
          <Label htmlFor="annotation-note">标注说明</Label>
          <Textarea
            id="annotation-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：用户问「拆封了还能退吗」，Agent 没有引用食品类目例外条款，答案过于乐观。"
            className="min-h-[62px] text-[12.5px]"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "annotation-error" : undefined}
            maxLength={280}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p id="annotation-error" className="text-destructive text-[11px]">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground text-[11px]">{note.trim().length}/280 字</p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          <CheckCheck aria-hidden />
          {pending ? "保存中…" : "保存标注"}
        </Button>
      </div>
    </form>
  );
}
