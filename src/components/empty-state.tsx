import * as React from "react";
import { Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-9 text-center", className)}>
      <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full" aria-hidden>
        <Icon className="size-4" />
      </span>
      <p className="text-[13px] font-medium">{title}</p>
      {description ? <p className="text-muted-foreground max-w-sm text-[11px] leading-relaxed">{description}</p> : null}
      {action}
    </div>
  );
}
