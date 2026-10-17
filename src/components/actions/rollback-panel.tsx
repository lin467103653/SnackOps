"use client";

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RollbackButton } from "@/components/actions/rollback-button";

export interface RollbackVersionRow {
  version: string;
  changeNote: string;
  createdAt: string;
  author: string;
  hash: string;
  auto: boolean;
}

/**
 * 运营中心的版本回滚面板。
 * 初始版本列表由服务端渲染传入；切换 Skill 时按需重新拉取（事件里请求，不在 effect 里写状态）。
 */
export function RollbackPanel({
  skills,
  initial,
}: {
  skills: { id: string; name: string; version: string }[];
  initial: { skillId: string; versions: RollbackVersionRow[] };
}) {
  const [skillId, setSkillId] = React.useState(initial.skillId);
  const [versions, setVersions] = React.useState<RollbackVersionRow[]>(initial.versions);
  const [version, setVersion] = React.useState(initial.versions.find((row) => row.version !== skills.find((s) => s.id === initial.skillId)?.version)?.version ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const current = skills.find((skill) => skill.id === skillId);
  const selected = versions.find((row) => row.version === version);

  async function changeSkill(nextId: string) {
    setSkillId(nextId);
    setLoading(true);
    setError(null);
    setVersions([]);
    setVersion("");

    try {
      const response = await fetch(`/api/skills/${encodeURIComponent(nextId)}/versions`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: { versions: RollbackVersionRow[] } }
        | { ok: false; error: string }
        | null;

      if (!response.ok || !payload || payload.ok === false) {
        setError(payload && "error" in payload ? payload.error : `读取版本失败（HTTP ${response.status}）`);
        return;
      }

      const rows = payload.data.versions ?? [];
      setVersions(rows);
      const nextCurrent = skills.find((skill) => skill.id === nextId)?.version;
      setVersion(rows.find((row) => row.version !== nextCurrent)?.version ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rollback-skill">Skill</Label>
          <Select value={skillId} onValueChange={(value) => void changeSkill(value)}>
            <SelectTrigger id="rollback-skill" size="sm" className="w-full">
              <SelectValue placeholder="选择 Skill" />
            </SelectTrigger>
            <SelectContent>
              {skills.map((skill) => (
                <SelectItem key={skill.id} value={skill.id}>
                  {skill.name}（当前 v{skill.version}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rollback-version">回滚到的版本</Label>
          <Select value={version} onValueChange={setVersion} disabled={loading || versions.length === 0}>
            <SelectTrigger id="rollback-version" size="sm" className="w-full">
              <SelectValue placeholder={loading ? "读取版本中…" : versions.length === 0 ? "没有历史版本" : "选择版本"} />
            </SelectTrigger>
            <SelectContent>
              {versions.map((row) => (
                <SelectItem key={row.version} value={row.version}>
                  v{row.version} · {row.changeNote.slice(0, 20)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <Loader2 aria-hidden className="animate-spin" />
          正在读取版本…
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md border border-rose-300/70 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-900">{error}</p>
      ) : null}

      {!loading && versions.length === 0 && !error ? (
        <p className="text-muted-foreground text-[11px]">该 Skill 还没有版本快照，保存一次正文后即可回滚。</p>
      ) : null}

      {selected ? (
        <div className="rounded-md border p-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="font-mono">
              v{selected.version}
            </Badge>
            <Badge variant={selected.auto ? "warning" : "info"}>{selected.auto ? "自动快照" : "人工保存"}</Badge>
            <span className="text-muted-foreground">
              {selected.author} · {selected.createdAt.slice(0, 16).replace("T", " ")} · {selected.hash}
            </span>
          </div>
          <p className="mt-1 leading-relaxed">{selected.changeNote}</p>
          <p className="text-muted-foreground mt-1">
            回滚会用这一版正文生成新版本：当前 v{current?.version} 会先被留档，历史不丢。
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {version ? (
          <RollbackButton skillId={skillId} version={version} size="sm" variant="outline" label={`回滚到 v${version}`} />
        ) : (
          <Button size="sm" variant="outline" disabled>
            <RotateCcw aria-hidden />
            回滚
          </Button>
        )}
        <span className="text-muted-foreground text-[10.5px]">回滚需二次确认；失败会保留原正文并提示原因。</span>
      </div>
    </div>
  );
}
