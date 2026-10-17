"use client";

import * as React from "react";
import { Save, RotateCcw, FileDiff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";

interface SaveResponse {
  changed: boolean;
  skill: { version: string; hash: string };
  snapshot: { version: string; changeNote: string } | null;
  autoSnapshot: { version: string } | null;
  beforeSnapshot: { id: string; version: string; changeNote: string } | null;
  fileInSync: boolean;
}

/**
 * 提示词正文编辑器。
 *
 * 保存时服务端会先给「当前正文」自动打快照，再写入新正文并递增版本号，
 * 所以这里只需要一个变更说明 + 一个保存按钮。
 */
export function SkillEditor({
  skillId,
  initialContent,
  version,
}: {
  skillId: string;
  initialContent: string;
  version: string;
}) {
  const { run, pending } = useApiAction();
  const [content, setContent] = React.useState(initialContent);
  const [changeNote, setChangeNote] = React.useState("");
  const [lastSaved, setLastSaved] = React.useState<SaveResponse | null>(null);

  const dirty = content !== initialContent;
  const tooShort = content.trim().length < 20;

  async function handleSave() {
    if (tooShort) {
      toast.error("提示词正文至少需要 20 个字符");
      return;
    }
    const payload = await run<{ data: SaveResponse }>(`/api/skills/${skillId}/content`, {
      method: "PUT",
      body: { content, changeNote: changeNote.trim() || undefined },
      successMessage: "已保存：旧正文自动快照 + 新版本已生成",
    });
    if (!payload?.data) return;
    setLastSaved(payload.data);
    setChangeNote("");
  }

  return (
    <div className="space-y-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">
          当前版本 <span className="font-mono text-foreground">{version}</span> · 正文 {content.length} 字符
          {dirty ? <span className="ml-2 text-amber-700">有未保存修改</span> : null}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setContent(initialContent);
              toast.success("已还原为当前版本内容");
            }}
            disabled={pending || !dirty}
          >
            <RotateCcw aria-hidden />
            还原
          </Button>
          <Button size="sm" onClick={handleSave} disabled={pending || !dirty || tooShort}>
            <Save aria-hidden />
            {pending ? "保存中…" : "保存版本"}
          </Button>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        spellCheck={false}
        aria-label="系统提示词正文"
        className="scroll-area-thin min-h-[420px] resize-y font-mono text-[12px] leading-relaxed"
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="skill-change-note">变更说明（写进版本记录，便于回溯）</Label>
          <Input
            id="skill-change-note"
            value={changeNote}
            onChange={(event) => setChangeNote(event.target.value)}
            placeholder="例如：补充 R7 诈骗话术与 R8 放行判定"
            className="h-8 text-[12.5px]"
            maxLength={120}
            disabled={pending}
          />
        </div>
        <p className="text-muted-foreground pb-1 text-[11px] whitespace-nowrap">
          旧正文会先留档，再写入新版本
        </p>
      </div>

      {lastSaved ? (
        <div className="rounded-md border border-emerald-300/70 bg-emerald-50 px-2.5 py-2 text-[11.5px] text-emerald-900" aria-live="polite">
          <p className="font-medium">
            已保存为 v{lastSaved.skill.version} · hash {lastSaved.skill.hash}
            {lastSaved.fileInSync ? " · 镜像文件已同步" : " · 镜像文件写入失败，可在右侧重新导出"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2">
            {lastSaved.beforeSnapshot ? (
              <span>
                旧正文已留档：v{lastSaved.beforeSnapshot.version}
                {lastSaved.autoSnapshot ? "（本次新建自动快照）" : `（复用「${lastSaved.beforeSnapshot.changeNote}」）`}
              </span>
            ) : (
              <span>无旧正文留档（保存前已是空内容）</span>
            )}
            <span className="inline-flex items-center gap-1">
              <FileDiff aria-hidden className="size-3" />
              去下方「版本对比」看差异
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
