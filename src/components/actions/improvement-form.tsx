"use client";

import * as React from "react";
import { ClipboardPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiAction } from "@/hooks/use-api-action";
import { PRIORITIES } from "@/lib/constants";

const SOURCES = [
  { value: "badcase", label: "badcase 回流" },
  { value: "rating", label: "人工评分" },
  { value: "annotation", label: "标注" },
  { value: "eval", label: "评测失败" },
];

export function ImprovementForm({ skills }: { skills: { id: string; name: string }[] }) {
  const { run, pending } = useApiAction();
  const [title, setTitle] = React.useState("");
  const [skillKey, setSkillKey] = React.useState(skills[0]?.id ?? "");
  const [priority, setPriority] = React.useState<string>("P1");
  const [source, setSource] = React.useState<string>("badcase");
  const [owner, setOwner] = React.useState("林小满");
  const [expectedGain, setExpectedGain] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 4) {
      setError("标题至少 4 个字，写清要解决的问题");
      toast.error("标题太短");
      return;
    }
    if (expectedGain.trim().length < 2) {
      setError("请写一句预期收益，例如「预计减少 18% 重复追问」");
      toast.error("缺少预期收益");
      return;
    }

    setError(null);
    const payload = await run("/api/improvements", {
      body: {
        title: trimmedTitle,
        skillKey,
        priority,
        source,
        owner: owner.trim() || "未分配",
        expectedGain: expectedGain.trim(),
      },
      successMessage: "改进项已创建，状态为「待评估」",
    });

    if (payload) {
      setTitle("");
      setExpectedGain("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 px-4 py-3">
      <div className="space-y-1">
        <Label htmlFor="imp-title">改进标题</Label>
        <Input
          id="imp-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="例如：退款场景补充「食品拆封不退」例外条款"
          className="h-8 text-[12.5px]"
          maxLength={80}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="imp-skill">关联 Skill</Label>
          <Select value={skillKey} onValueChange={setSkillKey}>
            <SelectTrigger id="imp-skill" size="sm" className="w-full">
              <SelectValue placeholder="选择 Skill" />
            </SelectTrigger>
            <SelectContent>
              {skills.map((skill) => (
                <SelectItem key={skill.id} value={skill.id}>
                  {skill.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-source">来源</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="imp-source" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="imp-priority">优先级</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="imp-priority" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-owner">负责人</Label>
          <Input
            id="imp-owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="h-8 text-[12.5px]"
            maxLength={24}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="imp-gain">预期收益</Label>
          <Input
            id="imp-gain"
            value={expectedGain}
            onChange={(event) => setExpectedGain(event.target.value)}
            placeholder="预计减少 18% 重复追问"
            className="h-8 text-[12.5px]"
            maxLength={80}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p className="text-destructive text-[11px]">{error}</p>
        ) : (
          <p className="text-muted-foreground text-[11px]">创建后默认进入「待评估」，排期需要再确认。</p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          <ClipboardPlus aria-hidden />
          {pending ? "创建中…" : "创建改进项"}
        </Button>
      </div>
    </form>
  );
}
