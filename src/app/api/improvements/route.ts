import { revalidatePath } from "next/cache";

import { jsonError, jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getAgentRuns, getAnnotations, getImprovements, getRatings } from "@/lib/data";
import { createImprovement } from "@/lib/mutations";
import { buildClusters } from "@/lib/ops/clusters";
import { createImprovementFromCluster } from "@/lib/ops/service";
import { improvementFromManualSchema, improvementFromRuleSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = (await getImprovements()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return jsonOk({ total: items.length, items });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/improvements
 * - { rule }：按规则聚类创建（服务端重新计算，不信任前端数据）
 * - 其余：沿用第一段的手工创建表单
 */
export async function POST(request: Request) {
  try {
    const raw = (await request.clone().json().catch(() => ({}))) as Record<string, unknown>;

    if (typeof raw.rule === "string") {
      const input = await parseJsonBody(request, improvementFromRuleSchema);
      const [runs, ratings, annotations, improvements] = await Promise.all([
        getAgentRuns(),
        getRatings(),
        getAnnotations(),
        getImprovements(),
      ]);
      const clusters = buildClusters({ runs, ratings, annotations, improvements });
      const cluster = clusters.find((item) => item.rule === input.rule);
      if (!cluster) return jsonError(`没有找到规则聚类：${input.rule}（可能已经被处理）`, 404);

      const improvement = await createImprovementFromCluster(cluster);
      revalidatePath("/ops");
      revalidatePath("/improvements");
      return jsonOk(improvement, 201);
    }

    const input = await parseJsonBody(request, improvementFromManualSchema);
    const improvement = await createImprovement(input);
    revalidatePath("/ops");
    revalidatePath("/improvements");
    return jsonOk(improvement, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
