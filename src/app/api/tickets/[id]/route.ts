import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { takeoverTicket } from "@/lib/mutations";
import { takeoverInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** 接管工单：把会话从 Agent 转给人工，并记录首响时间 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const input = await parseJsonBody(request, takeoverInputSchema);
    const ticket = await takeoverTicket(id, input);
    revalidatePath("/");
    revalidatePath("/data/tickets");
    return jsonOk(ticket);
  } catch (error) {
    return toErrorResponse(error);
  }
}
