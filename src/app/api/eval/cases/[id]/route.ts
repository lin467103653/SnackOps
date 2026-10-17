import { z } from "zod";

import { revalidatePath } from "next/cache";

import { ApiError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { evalCaseSchemaV2 } from "@/lib/schemas";
import { updateJson } from "@/lib/store";
import { evalCasePatchSchema } from "@/lib/validation";
import type { EvalCaseV2 } from "@/lib/types";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1);

/** PATCH /api/eval/cases/[id] —— 编辑 / 启用停用 / 复制用（duplicate=true） */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const caseId = idSchema.parse(decodeURIComponent(id));
    const input = await parseJsonBody(request, evalCasePatchSchema.extend({ duplicate: z.boolean().optional() }));

    let result: EvalCaseV2 | null = null;

    await updateJson<EvalCaseV2[]>("eval-cases.json", (current) => {
      const list = current ?? [];
      const index = list.findIndex((item) => item.id === caseId);
      if (index < 0) throw new ApiError(404, `评测用例不存在：${caseId}`);
      const existing = list[index]!;

      if (input.duplicate) {
        const copy: EvalCaseV2 = {
          ...existing,
          id: `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
          name: `${existing.name} 副本`,
          createdAt: new Date().toISOString(),
        };
        result = copy;
        return [copy, ...list];
      }

      const { duplicate: _duplicate, ...patch } = input;
      void _duplicate;
      const next: EvalCaseV2 = { ...existing, ...patch };
      const parsed = evalCaseSchemaV2.safeParse(next);
      if (!parsed.success) {
        throw new ApiError(
          422,
          `用例不合法：${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("；")}`,
        );
      }
      result = parsed.data;
      const copy = [...list];
      copy[index] = parsed.data;
      return copy;
    });

    revalidatePath("/eval");
    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/eval/cases/[id] */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const caseId = idSchema.parse(decodeURIComponent(id));
    let removed = false;
    await updateJson<EvalCaseV2[]>("eval-cases.json", (current) => {
      const list = current ?? [];
      const next = list.filter((item) => item.id !== caseId);
      removed = next.length !== list.length;
      if (!removed) throw new ApiError(404, `评测用例不存在：${caseId}`);
      return next;
    });
    revalidatePath("/eval");
    return jsonOk({ deleted: caseId, removed });
  } catch (error) {
    return toErrorResponse(error);
  }
}
