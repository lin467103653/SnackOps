import * as React from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 统一的区块容器：标题 + 说明 + 右上角操作 + 内容。
 * 页面里不再出现「卡片套卡片」，需要分组时用分隔线与小标题。
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  footer,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden shadow-none", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px]">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("px-0 pb-0", contentClassName)}>{children}</CardContent>
      {footer ? <div className="text-muted-foreground border-t px-4 py-2 text-[11px]">{footer}</div> : null}
    </Card>
  );
}
