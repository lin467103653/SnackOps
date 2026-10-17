"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleCheck, Loader2, PlugZap, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApiAction } from "@/hooks/use-api-action";

export interface ProviderCard {
  id: "coze" | "openai-compatible" | "classroom-fixture";
  label: string;
  vendor: string;
  description: string;
  requires: string[];
  fixture: boolean;
  defaultModel: string;
  docs: string;
  configured: boolean;
  missing: string[];
  active: boolean;
}

export interface ModelsPanelProps {
  providers: ProviderCard[];
  env: { key: string; present: boolean; masked: string | null }[];
  config: {
    defaultModel: string;
    plannerModel: string;
    fallbackModel: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
    plannerMaxSteps: number;
    notes: string;
    updatedAt: string;
    updatedBy: string;
  };
  status: {
    configured: boolean;
    fixture: boolean;
    label: string;
    model: string;
    hint: string | null;
    source: "config" | "env" | "auto" | null;
  };
}

interface TestResult {
  ok: boolean;
  provider: string | null;
  model: string;
  latencyMs: number;
  fixture: boolean;
  error: { code: string; message: string; hint: string | null } | null;
  checkedAt: string;
}

export function ModelsPanel({ providers, env, config, status }: ModelsPanelProps) {
  const { run, pending } = useApiAction();
  const router = useRouter();

  const [switching, setSwitching] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<TestResult | null>(null);

  const [defaultModel, setDefaultModel] = React.useState(config.defaultModel);
  const [plannerModel, setPlannerModel] = React.useState(config.plannerModel);
  const [fallbackModel, setFallbackModel] = React.useState(config.fallbackModel);
  const [temperature, setTemperature] = React.useState(String(config.temperature));
  const [maxTokens, setMaxTokens] = React.useState(String(config.maxTokens));
  const [timeoutMs, setTimeoutMs] = React.useState(String(config.timeoutMs));
  const [plannerMaxSteps, setPlannerMaxSteps] = React.useState(String(config.plannerMaxSteps));
  const [notes, setNotes] = React.useState(config.notes);

  async function handleSwitch(provider: ProviderCard) {
    setSwitching(provider.id);
    try {
      const response = await fetch("/api/llm-config/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: true; data: { warning: string | null; status: { configured: boolean } } }
        | { ok: false; error: string; hint?: string }
        | null;

      if (!response.ok || !body || body.ok === false) {
        const message = body && "error" in body ? body.error : `切换失败（HTTP ${response.status}）`;
        toast.error(message);
        return;
      }

      if (body.data.warning) toast.warning(body.data.warning);
      else toast.success(`已切换到 ${provider.label}`);
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const response = await fetch("/api/llm-config/test", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { ok: boolean; data?: TestResult; error?: string } | null;
      if (!response.ok || !body?.data) {
        toast.error(body?.error ?? `测试失败（HTTP ${response.status}）`);
        return;
      }
      setTest(body.data);
      if (body.data.ok) toast.success(`连接正常：${body.data.latencyMs} ms`);
      else toast.error(`连接失败：${body.data.error?.code ?? "UNKNOWN"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "网络错误");
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveModels(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("/api/llm-config", {
      method: "PUT",
      body: {
        defaultModel: defaultModel.trim(),
        plannerModel: plannerModel.trim(),
        fallbackModel: fallbackModel.trim(),
        temperature: Number(temperature),
        maxTokens: Number(maxTokens),
        timeoutMs: Number(timeoutMs),
        plannerMaxSteps: Number(plannerMaxSteps),
        notes: notes.trim(),
      },
      successMessage: "模型配置已保存",
    });
  }

  const banner =
    !status.configured
      ? { tone: "danger" as const, title: "当前 Provider 不可用", text: status.hint ?? "缺少必要配置，运行会被拒绝。" }
      : status.fixture
        ? {
            tone: "warning" as const,
            title: "课堂演示模式（演示稳定模式）",
            text: "输出由确定性 fixture 生成，不调用外部模型；所有回复与 RunRecord 都会标注。切到真实 Provider 需要对应密钥。",
          }
        : { tone: "success" as const, title: `真实模型运行中：${status.label}`, text: status.hint ?? "当前运行会真实调用外部模型。" };

  return (
    <div className="space-y-4">
      <div
        className={
          banner.tone === "danger"
            ? "rounded-lg border border-rose-300/70 bg-rose-50 px-3.5 py-2.5"
            : banner.tone === "warning"
              ? "rounded-lg border border-amber-300/70 bg-amber-50 px-3.5 py-2.5"
              : "rounded-lg border border-emerald-300/70 bg-emerald-50 px-3.5 py-2.5"
        }
        role="status"
      >
        <p
          className={
            banner.tone === "danger"
              ? "text-[12.5px] font-medium text-rose-900"
              : banner.tone === "warning"
                ? "text-[12.5px] font-medium text-amber-900"
                : "text-[12.5px] font-medium text-emerald-900"
          }
        >
          {banner.title}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed opacity-90">{banner.text}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={`bg-card flex flex-col gap-2 rounded-lg border p-3.5 ${provider.active ? "border-primary/40" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[13px] font-semibold">{provider.label}</h2>
              {provider.active ? <Badge variant="success">当前</Badge> : null}
              {provider.fixture ? <Badge variant="warning">演示</Badge> : null}
              <Badge variant={provider.configured ? "outline" : "danger"}>
                {provider.configured ? "已配置" : "缺配置"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">{provider.description}</p>
            <p className="text-muted-foreground text-[10.5px]">
              需要：{provider.requires.length === 0 ? "无需外部配置" : provider.requires.join("、")}
              {provider.missing.length > 0 ? `（缺 ${provider.missing.join("、")}）` : ""}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-1.5">
              <Button
                size="xs"
                variant={provider.active ? "outline" : "default"}
                disabled={provider.active || switching !== null}
                onClick={() => handleSwitch(provider)}
              >
                {switching === provider.id ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {provider.active ? "使用中" : switching === provider.id ? "切换中…" : "切换到此 Provider"}
              </Button>
              <span className="text-muted-foreground font-mono text-[10px]">{provider.defaultModel}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-card rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold">连接测试</h2>
            <Button size="sm" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 aria-hidden className="animate-spin" /> : <PlugZap aria-hidden />}
              {testing ? "测试中…" : "测试连接"}
            </Button>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">真实发一次最小请求；失败会返回结构化错误（不含密钥）。</p>

          {test ? (
            <div className="mt-2 space-y-1.5" aria-live="polite">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                {test.ok ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/12 px-1.5 py-0.5 font-medium text-emerald-700">
                    <CircleCheck aria-hidden className="size-3" />
                    连接正常
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-rose-600/12 px-1.5 py-0.5 font-medium text-rose-700">
                    <AlertTriangle aria-hidden className="size-3" />
                    连接失败
                  </span>
                )}
                <span className="text-muted-foreground">
                  {test.provider ?? "—"} · {test.model} · {test.latencyMs} ms
                </span>
                {test.fixture ? <Badge variant="warning">演示模式，未调用外部服务</Badge> : null}
              </div>
              {test.error ? (
                <div className="rounded-md border border-rose-300/70 bg-rose-50 px-2.5 py-2 text-[11.5px] text-rose-900">
                  <p className="font-mono text-[10.5px]">{test.error.code}</p>
                  <p className="mt-0.5 break-words">{test.error.message}</p>
                  {test.error.hint ? <p className="mt-1 text-[11px] text-rose-700">{test.error.hint}</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground mt-2 text-[11px]">还没有测试过。</p>
          )}
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h2 className="text-[13px] font-semibold">环境变量状态</h2>
          <p className="text-muted-foreground mt-1 text-[11px]">只展示「是否配置」，密钥原文不会出现在页面、客户端或日志里。</p>
          <ul className="mt-2 divide-y text-[11.5px]">
            {env.map((flag) => (
              <li key={flag.key} className="flex items-center justify-between gap-2 py-1.5">
                <span className="font-mono text-[11px]">{flag.key}</span>
                <span className={flag.present ? "text-emerald-700" : "text-muted-foreground"}>
                  {flag.present ? (flag.masked ?? "已配置") : "未配置"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-[10.5px]">
            选择来源：{status.source === "config" ? "后台配置" : status.source === "env" ? "环境变量 LLM_PROVIDER" : status.source === "auto" ? "按密钥自动推断" : "无"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSaveModels} className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold">模型与采样参数</h2>
          <span className="text-muted-foreground text-[10.5px]">
            更新于 {config.updatedAt.slice(0, 16).replace("T", " ")} · {config.updatedBy}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="model-default">默认模型</Label>
            <Input id="model-default" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} className="h-8 font-mono text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="model-planner">规划模型</Label>
            <Input id="model-planner" value={plannerModel} onChange={(e) => setPlannerModel(e.target.value)} className="h-8 font-mono text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="model-fallback">兜底模型</Label>
            <Input id="model-fallback" value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} className="h-8 font-mono text-[12px]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="model-temp">温度</Label>
            <Input id="model-temp" type="number" step="0.05" min={0} max={2} value={temperature} onChange={(e) => setTemperature(e.target.value)} className="h-8 tabular text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="model-tokens">Max Tokens</Label>
            <Input id="model-tokens" type="number" min={128} step={128} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="h-8 tabular text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="model-timeout">超时(ms)</Label>
            <Input id="model-timeout" type="number" min={1000} step={500} value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} className="h-8 tabular text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="model-steps">Planner 步数</Label>
            <Input id="model-steps" type="number" min={1} max={20} value={plannerMaxSteps} onChange={(e) => setPlannerMaxSteps(e.target.value)} className="h-8 tabular text-[12px]" />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="model-notes">备注</Label>
          <Textarea id="model-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px] text-[12px]" maxLength={200} />
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
            {pending ? "保存中…" : "保存模型配置"}
          </Button>
        </div>
      </form>
    </div>
  );
}
