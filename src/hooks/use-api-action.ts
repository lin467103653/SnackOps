"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface RunOptions {
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  successMessage?: string;
}

/**
 * 统一的「调用写接口 → toast 反馈 → 刷新服务端数据」流程。
 * 所有页面上的按钮都走这里，保证成功/失败反馈一致。
 */
export function useApiAction() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async <T = unknown>(url: string, options: RunOptions = {}): Promise<T | null> => {
      const { method = "POST", body, successMessage } = options;
      setPending(true);
      try {
        const response = await fetch(url, {
          method,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : `请求失败（HTTP ${response.status}）`;
          toast.error(message);
          return null;
        }

        if (successMessage) toast.success(successMessage);
        router.refresh();
        return payload as T;
      } catch {
        toast.error("网络异常：请确认服务正在运行，或稍后重试");
        return null;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending };
}
