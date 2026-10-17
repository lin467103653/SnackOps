"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleCheck, Loader2, Play, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, TagBadge } from "@/components/status-badge";
import { useApiAction } from "@/hooks/use-api-action";

export interface PlannerConsoleProps {
  config: {
    version: string;
    model: string;
    temperature: number;
    maxTokens: number;
    promptHash: string;
    allowedSkills: string[];
    allowedTools: string[];
    defaultMandatoryCapabilities: string[];
    updatedAt: string;
    updatedBy: string;
    history: { version: string; createdAt: string; changeNote: string; promptHash: string }[];
  };
  prompt: string;
  catalog: {
    skills: { id: string; name: string; capabilities: string[] }[];
    tools: { id: string; name: string; kind: string }[];
  };
  capabilities: { id: string; label: string }[];
  provider: { configured: boolean; label: string; model: string; fixture: boolean };
}

interface PreviewResult {
  question: string;
  mandatoryCapabilities: string[];
  derivedCapabilities: string[];
  plan: {
    selectedSkills: string[];
    selectedTools: string[];
    reasoning: string;
    riskAssessment: { level: string; flags: string[]; needsRiskCheck: boolean };
    degradation: { degraded: boolean; handoff: boolean; reason: string | null } | null;
  };
  parseOk: boolean;
  parseError: string | null;
  validation: { ok: boolean; errors: string[]; warnings: string[] };
  addedSkills: string[];
  addedTools: string[];
  coverage: string[];
  plannerVersion: string;
  provider: string;
  model: string;
  fixture: boolean;
  latencyMs: number;
  raw: string;
}

const SAMPLE_QUESTIONS = [
  "帮我查一下订单 SG2026101210007 到哪了",
  "买 8 件蜂蜜黄油夏威夷果，用 SG199-30，到手多少钱？",
  "客服说我中奖了，让我先转 200 元保证金，是真的吗？",
];

export function PlannerConsole({ config, prompt, catalog, capabilities, provider }: PlannerConsoleProps) {
  const { run, pending } = useApiAction();
  const router = useRouter();

  const [model, setModel] = React.useState(config.model);
  const [temperature, setTemperature] = React.useState(String(config.temperature));
  const [maxTokens, setMaxTokens] = React.useState(String(config.maxTokens));
  const [systemPrompt, setSystemPrompt] = React.useState(prompt);
  const [changeNote, setChangeNote] = React.useState("");
  const [allowedSkills, setAllowedSkills] = React.useState<string[]>(config.allowedSkills);
  const [allowedTools, setAllowedTools] = React.useState<string[]>(config.allowedTools);
  const [defaults, setDefaults] = React.useState<string[]>(config.defaultMandatoryCapabilities);

  const [question, setQuestion] = React.useState(SAMPLE_QUESTIONS[0]!);
  const [previewCaps, setPreviewCaps] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = React.useState<{ message: string; hint: string | null } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const promptChanged = systemPrompt !== prompt;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = await run<{ data: { version: string } }>("/api/planner", {
      method: "PUT",
      body: {
        model: model.trim(),
        temperature: Number(temperature),
        maxTokens: Number(maxTokens),
        systemPrompt,
        allowedSkills,
        allowedTools,
        defaultMandatoryCapabilities: defaults,
        changeNote: changeNote.trim() || undefined,
      },
      successMessage: "Planner 配置已保存",
    });
    if (payload?.data?.version) {
      toast.success(`当前 Planner 版本 v${payload.data.version}`);
      setChangeNote("");
      router.refresh();
    }
  }

  async function handlePreview() {
    if (question.trim().length < 2) {
      toast.error("请先输入测试问题");
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    try {
      const response = await fetch("/api/planner/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          mandatoryCapabilities: previewCaps.length > 0 ? previewCaps : undefined,
          allowedSkills,
          allowedTools,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; data: PreviewResult }
        | { ok: false; error: string; hint?: string }
        | null;

      if (!response.ok || !body || body.ok === false) {
        const message = body && "error" in body ? body.error : `预览失败（HTTP ${response.status}）`;
        setPreviewError({ message, hint: body && "hint" in body ? (body.hint ?? null) : null });
        toast.error("预览失败");
        return;
      }
      setPreview(body.data);
      toast.success(`计划已生成：${body.data.validation.ok ? "校验通过" : "校验未通过"}`);
    } catch (error) {
      setPreviewError({ message: error instanceof Error ? error.message : "网络错误", hint: null });
    } finally {
      setPreviewing(false);
    }
  }

  const skillName = new Map(catalog.skills.map((skill) => [skill.id, skill.name]));
  const toolName = new Map(catalog.tools.map((tool) => [tool.id, tool.name]));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <form onSubmit={handleSave} className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold">Planner 配置</h2>
            <p className="text-muted-foreground text-[11px]">
              v{config.version} · 更新于 {config.updatedAt.slice(0, 16).replace("T", " ")} · {config.updatedBy}
            </p>
          </div>
          <Badge variant="outline" className="font-mono">
            hash {config.promptHash}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="planner-model">规划模型</Label>
            <Input id="planner-model" value={model} onChange={(e) => setModel(e.target.value)} className="h-8 font-mono text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="planner-temp">温度</Label>
            <Input
              id="planner-temp"
              type="number"
              step="0.05"
              min={0}
              max={2}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="h-8 tabular text-[12px]"
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="planner-tokens">Max Tokens</Label>
            <Input
              id="planner-tokens"
              type="number"
              min={128}
              max={32768}
              step={64}
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="h-8 tabular text-[12px]"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="planner-note">变更说明（写入版本历史）</Label>
            <Input
              id="planner-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="例如：补充「价格必须调 calculate_price」"
              className="h-8 text-[12px]"
              maxLength={120}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="planner-prompt">Planner 系统提示词</Label>
            <span className="text-muted-foreground text-[10.5px]">
              {systemPrompt.length} 字符{promptChanged ? " · 有未保存修改" : ""}
            </span>
          </div>
          <Textarea
            id="planner-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            spellCheck={false}
            className="scroll-area-thin min-h-[180px] resize-y font-mono text-[11.5px] leading-relaxed"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[12px] font-medium">可选 Skill</p>
            <p className="text-muted-foreground text-[10.5px]">不勾选 = 全部启用中的 Skill 都可选</p>
            <div className="border-border scroll-area-thin max-h-[168px] space-y-1 overflow-auto rounded-md border p-2">
              {catalog.skills.map((skill) => (
                <label key={skill.id} className="flex cursor-pointer items-start gap-1.5 text-[11.5px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allowedSkills.includes(skill.id)}
                    onChange={() => setAllowedSkills((current) => toggle(current, skill.id))}
                  />
                  <span className="min-w-0 break-words">
                    {skill.name}
                    <span className="text-muted-foreground font-mono text-[10px]"> {skill.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[12px] font-medium">可选 Tool</p>
            <p className="text-muted-foreground text-[10.5px]">不勾选 = 全部启用中的 Tool 都可选</p>
            <div className="border-border scroll-area-thin max-h-[168px] space-y-1 overflow-auto rounded-md border p-2">
              {catalog.tools.map((tool) => (
                <label key={tool.id} className="flex cursor-pointer items-start gap-1.5 text-[11.5px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allowedTools.includes(tool.id)}
                    onChange={() => setAllowedTools((current) => toggle(current, tool.id))}
                  />
                  <span className="min-w-0 break-words">
                    {tool.name}
                    <span className="text-muted-foreground font-mono text-[10px]"> {tool.id}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[12px] font-medium">默认额外必需能力</p>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((capability) => {
              const checked = defaults.includes(capability.id);
              return (
                <button
                  key={capability.id}
                  type="button"
                  onClick={() => setDefaults((current) => toggle(current, capability.id))}
                  aria-pressed={checked}
                  className={`rounded-md border px-2 py-0.5 text-[11px] ${
                    checked ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]" : "border-border text-muted-foreground"
                  }`}
                >
                  {capability.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[11px]">保存会立即影响真实运行与预览</p>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
            {pending ? "保存中…" : "保存配置"}
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        <div className="bg-card rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">计划预览</h2>
            <Badge variant={provider.configured ? (provider.fixture ? "warning" : "success") : "danger"}>
              {provider.configured ? `${provider.label}` : "Provider 未配置"}
            </Badge>
          </div>
          <div className="mt-2 space-y-2">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[64px] text-[12.5px]"
              placeholder="输入一个测试问题"
              maxLength={600}
            />
            <div className="flex flex-wrap gap-1">
              {SAMPLE_QUESTIONS.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setQuestion(sample)}
                  className="border-border text-muted-foreground hover:bg-accent max-w-full truncate rounded-md border px-2 py-0.5 text-[10.5px]"
                >
                  {sample.slice(0, 18)}…
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium">本次预览强制必需能力（留空 = 按问题推导 ∪ 默认值）</p>
              <div className="flex flex-wrap gap-1">
                {capabilities.map((capability) => {
                  const checked = previewCaps.includes(capability.id);
                  return (
                    <button
                      key={capability.id}
                      type="button"
                      onClick={() => setPreviewCaps((current) => toggle(current, capability.id))}
                      aria-pressed={checked}
                      className={`rounded-md border px-1.5 py-0.5 text-[10.5px] ${
                        checked ? "border-primary/40 bg-primary/12 text-[color:var(--primary)]" : "border-border text-muted-foreground"
                      }`}
                    >
                      {capability.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handlePreview} disabled={previewing || !provider.configured}>
                {previewing ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
                {previewing ? "生成中…" : "预览计划"}
              </Button>
            </div>
          </div>
        </div>

        {previewError ? (
          <div className="rounded-lg border border-rose-300/70 bg-rose-50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-rose-900">
              <AlertTriangle aria-hidden className="size-3.5" />
              预览失败
            </p>
            <p className="mt-1 text-[11.5px] text-rose-800">{previewError.message}</p>
            {previewError.hint ? <p className="mt-1 text-[11px] text-rose-700">{previewError.hint}</p> : null}
          </div>
        ) : null}

        {preview ? (
          <div className="bg-card space-y-2.5 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold">计划结果</h2>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={preview.validation.ok ? "success" : "error"} />
                <span className="text-muted-foreground text-[10.5px]">
                  v{preview.plannerVersion} · {preview.latencyMs} ms
                </span>
              </div>
            </div>

            {!preview.parseOk ? (
              <p className="rounded-md border border-amber-300/70 bg-amber-50 px-2 py-1.5 text-[11.5px] text-amber-900">
                Plan JSON 解析失败，已使用安全 fallback：{preview.parseError}
              </p>
            ) : null}

            <div>
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">必需能力</p>
              <div className="flex flex-wrap gap-1">
                {preview.mandatoryCapabilities.map((capability) => (
                  <TagBadge key={capability}>{capability}</TagBadge>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">selectedSkills</p>
                <ul className="space-y-0.5 text-[11.5px]">
                  {preview.plan.selectedSkills.length === 0 ? (
                    <li className="text-muted-foreground">（空）</li>
                  ) : (
                    preview.plan.selectedSkills.map((id) => (
                      <li key={id} className="break-words">
                        · {skillName.get(id) ?? id}
                        <span className="text-muted-foreground font-mono text-[10px]"> {id}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">selectedTools</p>
                <ul className="space-y-0.5 text-[11.5px]">
                  {preview.plan.selectedTools.length === 0 ? (
                    <li className="text-muted-foreground">（空）</li>
                  ) : (
                    preview.plan.selectedTools.map((id) => (
                      <li key={id} className="break-words">
                        · {toolName.get(id) ?? id}
                        <span className="text-muted-foreground font-mono text-[10px]"> {id}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>

            <div>
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">reasoning</p>
              <p className="text-[11.5px] leading-relaxed">{preview.plan.reasoning}</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">风险 {preview.plan.riskAssessment.level}</Badge>
              {preview.plan.riskAssessment.needsRiskCheck ? <Badge variant="warning">需要风险审查</Badge> : null}
              {preview.plan.degradation ? <Badge variant="danger">降级 / 转人工</Badge> : null}
            </div>

            <div>
              <p className="text-muted-foreground mb-1 text-[10.5px] tracking-wide uppercase">校验结果</p>
              {preview.validation.ok && preview.validation.warnings.length === 0 ? (
                <p className="flex items-center gap-1 text-[11.5px] text-emerald-700">
                  <CircleCheck aria-hidden className="size-3.5" />
                  通过：能力覆盖、启用状态、必需 Tool 都满足
                </p>
              ) : (
                <ul className="space-y-1 text-[11.5px]">
                  {preview.validation.errors.map((error) => (
                    <li key={error} className="flex gap-1.5 text-rose-800">
                      <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                      {error}
                    </li>
                  ))}
                  {preview.validation.warnings.map((warning) => (
                    <li key={warning} className="flex gap-1.5 text-amber-800">
                      <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-foreground mt-1 text-[10.5px]">
                覆盖能力：{preview.coverage.join("、") || "无"}
                {preview.addedSkills.length > 0 || preview.addedTools.length > 0
                  ? ` · 校验器补齐：${[...preview.addedSkills, ...preview.addedTools].join("、")}`
                  : ""}
              </p>
            </div>

            <details>
              <summary className="text-muted-foreground flex cursor-pointer items-center gap-1 text-[11px] select-none">
                <ShieldCheck aria-hidden className="size-3" />
                查看模型原始输出
              </summary>
              <pre className="scroll-area-thin mt-1.5 max-h-[220px] overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10.5px] leading-relaxed">
                {preview.raw}
              </pre>
            </details>
          </div>
        ) : null}

        <div className="bg-card rounded-lg border p-4">
          <h2 className="text-[13px] font-semibold">版本历史</h2>
          {config.history.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-[11.5px]">还没有历史版本。</p>
          ) : (
            <ul className="mt-1 divide-y text-[11.5px]">
              {config.history.map((entry) => (
                <li key={`${entry.version}-${entry.createdAt}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
                  <span className="font-mono">v{entry.version}</span>
                  <span className="text-muted-foreground min-w-0 flex-1 break-words">{entry.changeNote}</span>
                  <span className="text-muted-foreground font-mono text-[10px]">{entry.promptHash}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
