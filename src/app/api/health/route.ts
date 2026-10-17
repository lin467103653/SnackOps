import { NextResponse } from "next/server";

import { collectionNames } from "@/lib/collections";
import { getDataDir, getStoreMetrics, listDataFiles } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 健康检查：服务是否活着、数据目录是否可读、22 个集合文件是否齐全。
 * 供部署探针与 /settings 页面使用。
 */
export async function GET() {
  const startedAt = performance.now();
  try {
    const files = await listDataFiles();
    const present = new Set(files.map((file) => file.file));
    const missing = collectionNames.length;

    return NextResponse.json({
      ok: true,
      data: {
        status: "ok" as const,
        service: "snackops",
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - startedAt),
        dataDir: getDataDir(),
        fileCount: files.length,
        collectionCount: collectionNames.length,
        missingFiles: collectionNames.filter((name) => !present.has(`${name.replace(/_/g, "_")}.json`)).length,
        expectedFiles: missing,
        metrics: getStoreMetrics(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `健康检查失败：${error instanceof Error ? error.message : "未知错误"}`,
        data: { status: "degraded" as const, dataDir: getDataDir() },
      },
      { status: 503 },
    );
  }
}
