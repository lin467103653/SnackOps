import { jsonOk, toErrorResponse } from "@/lib/api";
import { getSkillOrThrow } from "@/lib/skills/registry";
import { listVersions } from "@/lib/skills/versions";

export const dynamic = "force-dynamic";

/** 列出版本（默认不带正文，只给元数据；正文走 /versions/[version]） */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const skill = await getSkillOrThrow(id);
    const url = new URL(request.url);
    const withContent = url.searchParams.get("withContent") === "1";
    const versions = await listVersions(skill.id);

    return jsonOk({
      skillId: skill.id,
      currentVersion: skill.version,
      total: versions.length,
      versions: versions.map((version) => ({
        id: version.id,
        version: version.version,
        hash: version.hash,
        changeNote: version.changeNote,
        auto: version.auto,
        author: version.author,
        createdAt: version.createdAt,
        evalScore: version.evalScore,
        regression: version.regression,
        ...(withContent ? { content: version.content } : {}),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
