import { jsonOk, toErrorResponse } from "@/lib/api";
import { getCatalogSections } from "@/lib/catalog";

export const dynamic = "force-dynamic";

/** 业务数据目录摘要（/catalog 页面同源数据） */
export async function GET() {
  try {
    const sections = await getCatalogSections();
    return jsonOk({
      generatedAt: new Date().toISOString(),
      total: sections.length,
      sections,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
