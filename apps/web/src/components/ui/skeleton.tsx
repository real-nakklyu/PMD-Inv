import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-md border border-border p-3">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-3 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-4 h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-muted/65 p-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, column) => (
              <Skeleton key={column} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
