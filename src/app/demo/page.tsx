import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MonitorPlay } from "lucide-react";

import { DemoChat } from "@/components/demo-chat";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getLlmStatus } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "聊天演示" };

export default async function DemoPage() {
  const llm = await getLlmStatus();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link href="/">
            <ArrowLeft aria-hidden />
            返回工作台
          </Link>
        </Button>
        <Button asChild variant="ghost" size="xs" className="text-muted-foreground">
          <Link href="/runs">
            <MonitorPlay aria-hidden />
            运行记录
          </Link>
        </Button>
      </div>

      <PageHeader
        title="聊天演示"
        description="最简化的对话界面：只有一个输入框和回复气泡，但背后跑的是同一条 Agent 主链路，每条回复都能点进 Trace。"
      />

      <DemoChat providerLabel={`${llm.provider ?? "未配置"} · ${llm.model}`} fixture={llm.fixture} configured={llm.configured} />
    </div>
  );
}
