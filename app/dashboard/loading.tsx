import { ClientOverviewSkeleton } from "./client-overview/_components/overview-skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <ClientOverviewSkeleton />
    </div>
  );
}
