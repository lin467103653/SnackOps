import { revalidatePath } from "next/cache";

import { jsonOk, parseJsonBody, toErrorResponse } from "@/lib/api";
import { getAnnotations } from "@/lib/data";
import { createAnnotationRecord } from "@/lib/ops/service";
import { annotationCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/annotations?status=&tag=&targetType=&limit= */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const tag = url.searchParams.get("tag");
    const targetType = url.searchParams.get("targetType");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);

    const items = (await getAnnotations())
      .filter((annotation) => (status ? annotation.status === status : true))
      .filter((annotation) => (tag ? annotation.tag === tag : true))
      .filter((annotation) => (targetType ? annotation.targetType === targetType : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return jsonOk({ total: items.length, items });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/annotations —— 新建标注（支持多维评分与状态） */
export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, annotationCreateSchema);
    const annotation = await createAnnotationRecord(input);
    revalidatePath("/ops");
    revalidatePath("/skills");
    return jsonOk(annotation, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
