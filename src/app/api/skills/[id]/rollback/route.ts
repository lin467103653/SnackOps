import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { rollbackSkill } from "@/lib/ops/service";
import { rollbackSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/skills/[id]/rollback
 * 把指定历史版本的正文恢复为当前正文：同样先给现状留快照，再写入，版本继续前进。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const input = await parseJsonBody(request, rollbackSchema);
    const result = await rollbackSkill(decodeURIComponent(id), input.version);
    revalidatePath("/skills");
    revalidatePath(`/skills/${result.skillId}`);
    revalidatePath("/ops");
    return jsonOk(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
