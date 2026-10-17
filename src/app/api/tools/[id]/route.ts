import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getToolOrThrow, hasHandler, setToolEnabled } from "@/lib/tools/registry";
import { toolPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tool = await getToolOrThrow(id);
    return jsonOk({ tool, implemented: hasHandler(tool.id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** 启用 / 停用工具 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const patch = await parseJsonBody(request, toolPatchSchema);
    const tool = await setToolEnabled(id, patch.enabled ?? false);
    revalidatePath("/tools");
    revalidatePath(`/tools/${id}`);
    return jsonOk(tool);
  } catch (error) {
    return toErrorResponse(error);
  }
}
