import { Skeleton } from "@/components/ui/skeleton";

export function StatGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="bg-card rounded-lg border px-3.5 py-3">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2.5 h-5 w-20" />
          <Skeleton className="mt-2 h-2 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted/50 flex gap-3 border-b px-3 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 border-b px-3 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3 flex-1" style={{ opacity: 1 - rowIndex * 0.08 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2 border-b pb-4">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <StatGridSkeleton />
      <TableSkeleton />
    </div>
  );
}
