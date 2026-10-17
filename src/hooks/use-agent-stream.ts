"use client";

import * as React from "react";

import type { AgentEvent } from "@/lib/agent/orchestrator";
import type { AgentPlan, AgentRunStatus, AgentRunStep, PlanValidation, RiskResult } from "@/lib/types";

export interface AgentStreamState {
  running: boolean;
  runId: string | null;
  provider: string | null;
  model: string | null;
  fixture: boolean;
  mandatoryCapabilities: string[];
  plan: AgentPlan | null;
  planParseOk: boolean | null;
  planParseError: string | null;
  validation: PlanValidation | null;
  steps: AgentRunStep[];
  riskResult: RiskResult | null;
  finalReply: string | null;
  status: AgentRunStatus | null;
  error: string | null;
  errorHint: string | null;
  durationMs: number;
  startedAt: number | null;
}

const INITIAL: AgentStreamState = {
  running: false,
  runId: null,
  provider: null,
  model: null,
  fixture: false,
  mandatoryCapabilities: [],
  plan: null,
  planParseOk: null,
  planParseError: null,
  validation: null,
  steps: [],
  riskResult: null,
  finalReply: null,
  status: null,
  error: null,
  errorHint: null,
  durationMs: 0,
  startedAt: null,
};

function applyEvent(state: AgentStreamState, event: AgentEvent): AgentStreamState {
  switch (event.type) {
    case "run_start":
      return {
        ...state,
        runId: event.runId,
        provider: event.provider,
        model: event.model,
        fixture: event.fixture,
        mandatoryCapabilities: event.mandatoryCapabilities,
        startedAt: Date.now(),
      };
    case "plan":
      return {
        ...state,
        plan: event.plan,
        planParseOk: event.parseOk,
        planParseError: event.parseError,
      };
    case "validation":
      return { ...state, validation: event.validation };
    case "step":
      return { ...state, steps: [...state.steps, event.step] };
    case "risk":
      return { ...state, riskResult: event.riskResult };
    case "final":
      return {
        ...state,
        finalReply: event.finalReply,
        status: event.status,
        error: event.error,
        durationMs: event.durationMs,
      };
    case "error":
      return { ...state, error: event.message, errorHint: event.hint };
    case "done":
      return {
        ...state,
        running: false,
        runId: event.runId || state.runId,
        status: event.status,
        durationMs: event.durationMs,
      };
    default:
      return state;
  }
}

/** 解析 SSE 流：`event: x` + `data: {...}`，按空行分帧 */
async function consumeStream(response: Response, onEvent: (event: AgentEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("服务端没有返回可读流");

  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
      if (dataLine) {
        try {
          onEvent(JSON.parse(dataLine.slice(6)) as AgentEvent);
        } catch {
          // 忽略无法解析的帧
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function useAgentStream() {
  const [state, setState] = React.useState<AgentStreamState>(INITIAL);

  const start = React.useCallback(async (payload: Record<string, unknown>) => {
    setState({ ...INITIAL, running: true, startedAt: Date.now() });

    let response: Response;
    try {
      response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        running: false,
        error: `网络错误：${error instanceof Error ? error.message : "无法连接服务"}`,
      }));
      return null;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string; hint?: string } | null;
      setState((prev) => ({
        ...prev,
        running: false,
        error: body?.error ?? `请求失败（HTTP ${response.status}）`,
        errorHint: body?.hint ?? null,
      }));
      return null;
    }

    let completedRunId: string | null = null;
    await consumeStream(response, (event) => {
      if (event.type === "done" && event.runId) completedRunId = event.runId;
      setState((prev) => applyEvent(prev, event));
    });

    setState((prev) => ({ ...prev, running: false }));
    return completedRunId;
  }, []);

  const reset = React.useCallback(() => setState(INITIAL), []);

  return { state, start, reset };
}
