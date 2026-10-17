import { PageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载运营数据…</span>
      <PageSkeleton />
    </div>
  );
}
