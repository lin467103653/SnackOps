import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { concludeAbTest } from "@/lib/ops/service";
import { abTestPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** PATCH /api/ab-tests/[id] —— 登记指标 / 结束实验并给结论 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const input = await parseJsonBody(request, abTestPatchSchema);
    const test = await concludeAbTest(decodeURIComponent(id), input);
    revalidatePath("/ops");
    revalidatePath("/evals");
    return jsonOk(test);
  } catch (error) {
    return toErrorResponse(error);
  }
}
