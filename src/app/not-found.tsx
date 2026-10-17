import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <EmptyState
        icon={Compass}
        title="页面不存在"
        description="这个地址没有对应的运营模块。可以从「运营总览」重新进入，或直接查看运行记录与评测。"
        action={
          <div className="mt-2 flex gap-2">
            <Button asChild size="sm">
              <Link href="/">返回总览</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/data">查看数据资源</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
