import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ClientOverviewSkeleton() {
  return (
    <div
      data-slot="overview-skeleton"
      className="space-y-8 animate-in fade-in duration-300"
    >
      <header className="grid gap-4 border-b pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="max-w-2xl space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
          <Skeleton className="h-8 w-full sm:w-64 rounded-2xl" />
          <Skeleton className="h-8 w-full sm:w-64 rounded-2xl" />
          <Skeleton className="h-8 w-28 rounded-2xl" />
        </div>
      </header>

      <div className="space-y-6">
        <div className="flex gap-2 border-b pb-2">
          <Skeleton className="h-8 w-32 rounded-2xl" />
          <Skeleton className="h-8 w-28 rounded-2xl" />
          <Skeleton className="h-8 w-28 rounded-2xl" />
        </div>

        <Card className="rounded-2xl border-border">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-24 rounded-2xl" />
            </div>
            <Skeleton className="h-4 w-96 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-2xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
