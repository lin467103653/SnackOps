"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { useAgentStream } from "@/hooks/use-agent-stream";

interface Message {
  role: "user" | "assistant";
  content: string;
  runId?: string;
  status?: string;
  riskVerdict?: string;
  error?: string | null;
}

const SUGGESTIONS = ["有什么适合办公室的零食推荐？", "这单退货运费谁承担？", "订单 SG2026101210007 到哪了？"];

export function DemoChat({ providerLabel, fixture, configured }: { providerLabel: string; fixture: boolean; configured: boolean }) {
  const { state, start } = useAgentStream();
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const busy = state.running;
  const pending = busy;

  async function send(question: string) {
    const trimmed = question.trim();
    if (trimmed.length < 2) {
      toast.error("请先输入问题");
      return;
    }
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");

    const history = messages.slice(-6).map((message) => ({ role: message.role, content: message.content }));
    await start({ question: trimmed, source: "demo", conversationHistory: history });

    setMessages((current) => {
      // 用最新状态补一条 assistant 消息（start 返回时 state 可能还没提交）
      return current;
    });
  }

  // 流结束时把结果追加到消息列表
  const appendedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (state.running || !state.runId) return;
    if (appendedRef.current === state.runId) return;
    appendedRef.current = state.runId;
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: state.finalReply ?? "（没有生成回复）",
        runId: state.runId ?? undefined,
        status: state.status ?? undefined,
        riskVerdict: state.riskResult?.verdict,
        error: state.error,
      },
    ]);
  }, [state.running, state.runId, state.finalReply, state.status, state.riskResult, state.error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <div className="bg-card flex items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-[11.5px]">
        <span className="text-muted-foreground">
          Provider：<span className="text-foreground font-mono text-[11px]">{providerLabel}</span>
        </span>
        <Badge variant={configured ? (fixture ? "warning" : "success") : "danger"}>
          {configured ? (fixture ? "课堂演示模式" : "真实模型") : "未配置"}
        </Badge>
      </div>

      <div className="bg-card min-h-[320px] rounded-lg border p-3">
        {messages.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] font-medium">这里是一个简化版客服对话</p>
            <p className="text-muted-foreground max-w-sm text-[11.5px] leading-relaxed">
              和首页工作台调用的是同一条 Agent 主链路（Planner → Skill/Tool → 风险审查），只是把过程折叠起来了，
              每一步都能在运行详情里展开。
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="border-border text-muted-foreground hover:bg-accent rounded-md border px-2 py-1 text-[11px]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {messages.map((message, index) => (
              <li key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    message.role === "user"
                      ? "bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                      : "bg-muted max-w-[85%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                  }
                >
                  {message.content}
                  {message.role === "assistant" ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t pt-1.5">
                      {message.status ? <StatusBadge status={message.status} /> : null}
                      {message.riskVerdict ? (
                        <Badge variant="outline" className="gap-1">
                          <ShieldCheck aria-hidden className="size-3" />
                          风险 {message.riskVerdict}
                        </Badge>
                      ) : null}
                      {message.runId ? (
                        <Link href={`/runs/${message.runId}`} className="text-primary ml-auto inline-flex items-center gap-1 text-[11px] underline-offset-4 hover:underline">
                          查看 Trace
                          <ArrowRight aria-hidden className="size-3" />
                        </Link>
                      ) : null}
                      {message.error ? <span className="text-[10.5px] text-rose-700">{message.error}</span> : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pending ? (
          <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[11.5px]">
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            正在跑 Plan / 工具 / 风险审查…
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="输入你的问题，例如：想买点不辣的办公室零食"
          className="h-9 text-[13px]"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          发送
        </Button>
      </form>

      {state.error && !messages.some((message) => message.error === state.error) ? (
        <p className="text-[11.5px] text-rose-700">{state.error}</p>
      ) : null}
    </div>
  );
}
