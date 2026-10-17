import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger" | "positive";
  className?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "positive"
          ? "text-emerald-700"
          : "text-foreground";

  return (
    <Card className={cn("gap-0 overflow-hidden shadow-none", className)}>
      <CardContent className="flex flex-col gap-1 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-muted-foreground text-[11px] leading-tight">{label}</span>
          {Icon ? <Icon aria-hidden className="text-muted-foreground/60 size-3.5 shrink-0" /> : null}
        </div>
        <div className="flex flex-wrap items-baseline gap-1">
          <span className={cn("tabular text-[22px] leading-none font-semibold tracking-tight", toneClass)}>{value}</span>
          {unit ? <span className="text-muted-foreground text-[11px]">{unit}</span> : null}
        </div>
        {hint ? <p className="text-muted-foreground/90 text-[11px] leading-snug">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
