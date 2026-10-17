import { NextResponse } from "next/server";
import type { ZodType } from "zod";

import { StoreError } from "./store";

/** 统一声明 UTF-8，避免命令行工具（如 PowerShell）把中文按单字节解码 */
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: JSON_HEADERS });
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status, headers: JSON_HEADERS });
}

/** 统一解析 + 校验请求体，错误信息直接面向运营可读 */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "请求体必须是合法的 JSON");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.map(String).join(".") || "请求体"} ${issue.message}`)
      .join("；");
    throw new ApiError(422, `参数校验失败：${detail}`);
  }
  return parsed.data;
}

export function toErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof StoreError) {
    const status =
      error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_FILE_NAME" ? 400 : error.code === "LOCK_TIMEOUT" ? 503 : 500;
    return jsonError(`存储层错误（${error.code}）：${error.message}`, status);
  }

  console.error("[snackops/api] 未处理的异常", error);
  return jsonError("服务器内部错误，请稍后重试", 500);
}
