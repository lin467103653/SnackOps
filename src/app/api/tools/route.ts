import { jsonOk, toErrorResponse } from "@/lib/api";
import { auditTools, listEnabledTools, listTools } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

/** Tool 列表；`?enabled=1` 只返回启用中的（Planner 读取用） */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const onlyEnabled = url.searchParams.get("enabled") === "1";
    const [tools, all] = await Promise.all([
      onlyEnabled ? listEnabledTools() : listTools(),
      listTools(),
    ]);
    const audit = auditTools(all);

    return jsonOk({
      total: tools.length,
      filtered: onlyEnabled ? "enabled" : "all",
      audit,
      tools,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
