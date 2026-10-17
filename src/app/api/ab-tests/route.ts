import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getAbTests } from "@/lib/data";
import { createAbTest } from "@/lib/ops/service";
import { abTestCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = (await getAbTests()).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return jsonOk({ total: items.length, items });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/ab-tests —— 创建一个 Prompt A/B 实验（手动登记指标，不做流量分流） */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, abTestCreateSchema);
    const test = await createAbTest(input);
    revalidatePath("/ops");
    revalidatePath("/evals");
    return jsonOk(test, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
