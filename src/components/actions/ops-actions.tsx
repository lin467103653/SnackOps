"use client";

import * as React from "react";
import { Check, ClipboardCheck, FilePlus2, FlaskConical, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";

/* ------------------------------- 评分录入 ------------------------------- */

export function RatingForm({ runs }: { runs: { id: string; question: string }[] }) {
  const { run, pending } = useApiAction();
  const [runId, setRunId] = React.useState(runs[0]?.id ?? "");
  const [score, setScore] = React.useState("2");
  const [comment, setComment] = React.useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!runId) {
      toast.error("先选一条运行");
      return;
    }
    const payload = await run<{ data: { rating: { score: number }; routedAnnotation: { id: string } | null } }>("/api/ratings", {
      body: { runId, score: Number(score), comment: comment.trim() || undefined },
      successMessage: "评分已保存",
    });
    if (payload?.data) {
      if (payload.data.routedAnnotation) toast.warning("低分已自动进入坏案例标注池");
      setComment("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
        <div className="space-y-1">
          <Label htmlFor="rating-run">关联运行</Label>
          <Select value={runId} onValueChange={setRunId}>
            <SelectTrigger id="rating-run" size="sm" className="w-full">
              <SelectValue placeholder="选择运行" />
            </SelectTrigger>
            <SelectContent>
              {runs.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.question.slice(0, 28)}（{item.id.slice(-6)}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rating-score">评分</Label>
          <Select value={score} onValueChange={setScore}>
            <SelectTrigger id="rating-score" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} 分{value <= 2 ? "（低分）" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ClipboardCheck aria-hidden />}
            {pending ? "保存中…" : "记录评分"}
          </Button>
        </div>
      </div>
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="评语（可选）：例如「价格没算错，但没说明券不可叠加」"
        className="min-h-[48px] text-[12px]"
        maxLength={280}
      />
    </form>
  );
}

/* ------------------------------- 标注操作 ------------------------------- */

export function AnnotationActions({
  annotationId,
  status,
  converted,
}: {
  annotationId: string;
  status: string;
  converted: boolean;
}) {
  const { run, pending } = useApiAction();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function act(path: string, body: Record<string, unknown>, message: string, key: string) {
    setBusy(key);
    try {
      await run(`/api/annotations/${annotationId}`, { method: "PATCH", body, successMessage: message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button
        size="xs"
        variant="outline"
        disabled={pending || status === "accepted"}
        onClick={() => act(`/api/annotations/${annotationId}`, { status: "accepted" }, "已接受该标注", "accept")}
      >
        {busy === "accept" ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
        接受
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={pending || status === "rejected"}
        onClick={() => act(`/api/annotations/${annotationId}`, { status: "rejected" }, "已驳回该标注", "reject")}
      >
        {busy === "reject" ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
        驳回
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={pending || converted}
        onClick={() => act(`/api/annotations/${annotationId}`, { action: "to_eval_case" }, "已沉淀为评测用例", "eval")}
      >
        {busy === "eval" ? <Loader2 aria-hidden className="animate-spin" /> : <FilePlus2 aria-hidden />}
        沉淀用例
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={pending || converted}
        onClick={() => act(`/api/annotations/${annotationId}`, { action: "to_improvement" }, "已转为改进项", "imp")}
      >
        {busy === "imp" ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
        转改进
      </Button>
    </div>
  );
}

/* ------------------------------ 聚类 → 改进项 ------------------------------ */

export function CreateImprovementButton({ rule, disabled }: { rule: string; disabled: boolean }) {
  const { run, pending } = useApiAction();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending || disabled}
      onClick={() => run("/api/improvements", { body: { rule }, successMessage: "已从规则聚类创建改进项" })}
    >
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
      {disabled ? "已有改进项" : "生成改进项"}
    </Button>
  );
}

/* ------------------------------ 草案生成 / 应用 ------------------------------ */

export function ImprovementActions({
  improvementId,
  draftStatus,
  applied,
}: {
  improvementId: string;
  draftStatus: "draft" | "applied" | "discarded" | null;
  applied: boolean;
}) {
  const { run, pending } = useApiAction();
  const [confirmed, setConfirmed] = React.useState(false);

  const canGenerate = !applied && draftStatus !== "applied";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="xs"
          variant="outline"
          disabled={pending || !canGenerate}
          onClick={() => run("/api/improvements/generate-prompt", { body: { improvementId }, successMessage: "草案已生成（Skill 未被修改）" })}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <FlaskConical aria-hidden />}
          {draftStatus ? "重新生成草案" : "生成 Prompt 草案"}
        </Button>
        {draftStatus === "draft" ? (
          <label className="text-muted-foreground flex items-center gap-1 text-[10.5px]">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            已核对 diff
          </label>
        ) : null}
        <Button
          size="xs"
          disabled={pending || draftStatus !== "draft" || !confirmed}
          onClick={() =>
            run("/api/improvements/apply-prompt", {
              body: { improvementId, confirm: true },
              successMessage: "已应用草案：旧正文已快照，版本已递增",
            })
          }
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          应用草案
        </Button>
      </div>
      {draftStatus === "applied" ? <Badge variant="success">草案已应用</Badge> : null}
    </div>
  );
}

/* -------------------------------- A/B 实验 -------------------------------- */

export function AbTestForm({ skills }: { skills: { id: string; name: string; version: string }[] }) {
  const { run, pending } = useApiAction();
  const [name, setName] = React.useState("");
  const [skillKey, setSkillKey] = React.useState(skills[0]?.id ?? "");
  const [variantA, setVariantA] = React.useState(skills[0]?.version ?? "");
  const [variantB, setVariantB] = React.useState("");
  const [split, setSplit] = React.useState("50");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 4) {
      toast.error("实验名称至少 4 个字");
      return;
    }
    const payload = await run("/api/ab-tests", {
      body: {
        name: name.trim(),
        skillKey,
        variantA: variantA.trim(),
        variantB: variantB.trim(),
        trafficSplitA: Number(split),
      },
      successMessage: "A/B 实验已创建（指标需手动登记）",
    });
    if (payload) setName("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ab-name">实验名称</Label>
          <Input id="ab-name" value={name} onChange={(event) => setName(event.target.value)} className="h-8 text-[12px]" maxLength={60} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-skill">Skill</Label>
          <Select value={skillKey} onValueChange={setSkillKey}>
            <SelectTrigger id="ab-skill" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {skills.map((skill) => (
                <SelectItem key={skill.id} value={skill.id}>
                  {skill.name}（{skill.version}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="ab-a">A 组版本</Label>
          <Input id="ab-a" value={variantA} onChange={(event) => setVariantA(event.target.value)} className="h-8 font-mono text-[11.5px]" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-b">B 组版本</Label>
          <Input id="ab-b" value={variantB} onChange={(event) => setVariantB(event.target.value)} className="h-8 font-mono text-[11.5px]" placeholder="如 1.4.0-draft.1" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-split">A 组流量 %</Label>
          <Input id="ab-split" type="number" min={1} max={99} value={split} onChange={(event) => setSplit(event.target.value)} className="h-8 tabular text-[11.5px]" />
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" disabled={pending || !variantB.trim()}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <FlaskConical aria-hidden />}
            创建实验
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-[10.5px]">
        本版本只登记实验与指标，不做真实流量分流；结论由运营在 A/B 表格里手动登记。
      </p>
    </form>
  );
}
