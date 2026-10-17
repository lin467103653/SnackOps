import { cn } from "@/lib/utils";
import type { DiffLine } from "@/lib/diff";

/**
 * 版本 diff 展示：每行带 +/- 符号与行号，不只依赖颜色。
 */
export function DiffView({
  lines,
  summary,
  fromLabel,
  toLabel,
}: {
  lines: DiffLine[];
  summary: { added: number; removed: number; changed: boolean };
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[11px]">
        <span className="text-muted-foreground">
          {fromLabel} → {toLabel}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/12 px-1.5 py-0.5 font-medium text-emerald-700">
          +{summary.added} 行
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-600/12 px-1.5 py-0.5 font-medium text-rose-700">
          −{summary.removed} 行
        </span>
        {summary.changed ? null : <span className="text-muted-foreground">两个版本内容一致</span>}
      </div>

      <div className="scroll-area-thin max-h-[520px] overflow-auto">
        <table className="w-full border-collapse font-mono text-[11.5px] leading-relaxed">
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={`${index}-${line.type}`}
                className={cn(
                  line.type === "add" && "bg-emerald-500/8",
                  line.type === "remove" && "bg-rose-500/8",
                  line.type === "equal" && "text-muted-foreground",
                )}
              >
                <td className="w-10 border-r px-1.5 py-0.5 text-right align-top select-none tabular opacity-60">
                  {line.left ?? ""}
                </td>
                <td className="w-10 border-r px-1.5 py-0.5 text-right align-top select-none tabular opacity-60">
                  {line.right ?? ""}
                </td>
                <td className="w-5 py-0.5 text-center align-top select-none font-semibold">
                  {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                </td>
                <td className="px-2 py-0.5 align-top whitespace-pre-wrap break-words">{line.text || " "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
