"use client";

import { HandHelping } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApiAction } from "@/hooks/use-api-action";

export function TakeoverButton({
  ticketId,
  status,
  size = "xs",
}: {
  ticketId: string;
  status: string;
  size?: "xs" | "sm";
}) {
  const { run, pending } = useApiAction();
  const done = status === "已解决" || status === "已接管";

  return (
    <Button
      size={size}
      variant="outline"
      disabled={pending || done}
      title={done ? "该工单已结束或被接管" : "把会话转给人工客服并标记为已接管"}
      onClick={() =>
        run(`/api/tickets/${ticketId}`, {
          method: "PATCH",
          body: {},
          successMessage: "已接管：工单已转给人工客服",
        })
      }
    >
      {!pending && <HandHelping aria-hidden />}
      {pending ? "接管中…" : done ? "已接管" : "接管"}
    </Button>
  );
}
