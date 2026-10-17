import type { Metadata } from "next";
import Link from "next/link";
import { Braces, Cpu } from "lucide-react";

import { ModelsPanel, type ProviderCard } from "@/components/actions/models-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROVIDER_CATALOG, getLlmRuntimeConfig, getLlmStatus, providerMissingEnv } from "@/lib/llm";
import { secretEnvFlags } from "@/lib/llm/redact";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "模型管理" };

const SECRET_KEYS = new Set(["OPENAI_API_KEY", "COZE_API_KEY"]);

export default async function ModelsPage() {
  const [status, config] = await Promise.all([getLlmStatus(), getLlmRuntimeConfig()]);

  const providers: ProviderCard[] = PROVIDER_CATALOG.map((entry) => {
    const missing = providerMissingEnv(entry.id);
    return {
      id: entry.id,
      label: entry.label,
      vendor: entry.vendor,
      description: entry.description,
      requires: entry.requires,
      fixture: entry.fixture,
      defaultModel: entry.defaultModel,
      docs: entry.docs,
      configured: missing.length === 0,
      missing,
      active: status.provider === entry.id,
    };
  });

  const env = secretEnvFlags(["LLM_PROVIDER", "OPENAI_API_KEY", "OPENAI_BASE_URL", "LLM_MODEL", "COZE_API_KEY", "COZE_MODEL"]).map(
    (flag) => ({
      key: flag.key,
      present: flag.present,
      masked: SECRET_KEYS.has(flag.key) ? (flag.present ? "已配置（已隐藏）" : null) : flag.masked,
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="模型管理"
        description="Provider 决定 Agent 用哪个模型。切换会写入服务端配置并立即影响后续运行；缺配置时运行会被拒绝，不会退回演示模式。"
        meta={
          <>
            <Badge variant={status.configured ? (status.fixture ? "warning" : "success") : "danger"}>
              {status.configured ? (status.fixture ? "课堂演示模式" : `真实模型 · ${status.label}`) : "Provider 未配置"}
            </Badge>
            <Badge variant="outline" className="gap-1 font-mono">
              <Cpu aria-hidden className="size-3" />
              {status.model}
            </Badge>
            <Badge variant="outline">
              来源：{status.source === "config" ? "后台配置" : status.source === "env" ? "环境变量" : status.source === "auto" ? "自动推断" : "无"}
            </Badge>
          </>
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/api/llm-config" target="_blank">
              <Braces aria-hidden />
              查看 JSON
            </Link>
          </Button>
        }
      />

      <ModelsPanel
        providers={providers}
        env={env}
        config={{
          defaultModel: config.defaultModel,
          plannerModel: config.plannerModel,
          fallbackModel: config.fallbackModel,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          timeoutMs: config.timeoutMs,
          plannerMaxSteps: config.plannerMaxSteps,
          notes: config.notes,
          updatedAt: config.updatedAt,
          updatedBy: config.updatedBy,
        }}
        status={{
          configured: status.configured,
          fixture: status.fixture,
          label: status.label,
          model: status.model,
          hint: status.hint,
          source: status.source,
        }}
      />
    </div>
  );
}
