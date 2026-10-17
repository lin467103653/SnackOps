import { getAnnotations } from "@/lib/data";
import { annotationExportRows } from "@/lib/ops/service";

export const dynamic = "force-dynamic";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

/** GET /api/annotations/export?format=json|csv&status=&tag= */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "json").toLowerCase();
    const status = url.searchParams.get("status");
    const tag = url.searchParams.get("tag");

    const annotations = (await getAnnotations())
      .filter((annotation) => (status ? annotation.status === status : true))
      .filter((annotation) => (tag ? annotation.tag === tag : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const rows = annotationExportRows(annotations);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      const csv = `\uFEFF${toCsv(rows)}`;
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="snackops-annotations-${stamp}.csv"`,
        },
      });
    }

    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), total: rows.length, items: rows }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="snackops-annotations-${stamp}.json"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "导出失败" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
