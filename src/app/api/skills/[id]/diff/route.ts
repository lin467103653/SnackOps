import { jsonError, jsonOk, toErrorResponse } from "@/lib/api";
import { withContext, diffLines } from "@/lib/diff";
import { getSkillOrThrow } from "@/lib/skills/registry";
import { resolveVersionContent } from "@/lib/skills/versions";

export const dynamic = "force-dynamic";

/**
 * 版本 diff：`?from=1.2.0&to=1.3.1`，`to` 可传 `current`（当前正文）。
 * 返回结构化行（便于前端按 +/- 渲染）+ 纯文本 unified diff（便于复制）。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const skill = await getSkillOrThrow(id);
    const url = new URL(request.url);
    const from = url.searchParams.get("from")?.trim();
    const to = url.searchParams.get("to")?.trim() || "current";

    if (!from) return jsonError("请提供 from 参数（起始版本号，或 current）", 400);

    const [before, after] = await Promise.all([
      resolveVersionContent(skill.id, from),
      resolveVersionContent(skill.id, to),
    ]);

    const result = diffLines(before.content, after.content);

    return jsonOk({
      skillId: skill.id,
      from: { version: from, label: before.label },
      to: { version: to, label: after.label },
      summary: { added: result.added, removed: result.removed, unchanged: result.unchanged, changed: result.changed },
      lines: withContext(result.lines, 2),
      text: result.text,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
