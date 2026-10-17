import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getRatings } from "@/lib/data";
import { createRating } from "@/lib/ops/service";
import { ratingInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/ratings?targetType=&minScore=&maxScore=&from=&to=&intent=&limit= */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType");
    const minScore = Number(url.searchParams.get("minScore") ?? 0) || 0;
    const maxScore = Number(url.searchParams.get("maxScore") ?? 6) || 6;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const intent = url.searchParams.get("intent");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

    const ratings = (await getRatings())
      .filter((rating) => (targetType ? rating.targetType === targetType : true))
      .filter((rating) => rating.score >= minScore && rating.score <= maxScore)
      .filter((rating) => (intent ? (rating.intent ?? "").includes(intent) : true))
      .filter((rating) => {
        const created = new Date(rating.createdAt).getTime();
        if (from && created < new Date(from).getTime()) return false;
        if (to && created > new Date(to).getTime()) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return jsonOk({ total: ratings.length, items: ratings });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/ratings —— 记录评分；≤2 分自动生成坏案例标注 */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, ratingInputSchema);
    const result = await createRating(input);
    revalidatePath("/ops");
    revalidatePath(`/runs/${input.runId}`);
    return jsonOk(result, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
