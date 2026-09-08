import { Suspense } from "react";
import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClientOverviewSkeleton } from "./client-overview/_components/overview-skeleton";
import { ClientOverview } from "./client-overview/page";

export const metadata: Metadata = {
  title: "Overview · Project Tracker",
};

const NOTICES: Record<string, string> = {
  forbidden: "You do not have permission to view that page.",
};

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const notice = error ? NOTICES[error] : undefined;

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert variant="destructive" role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      <Suspense fallback={<ClientOverviewSkeleton />}>
        <ClientOverview searchParams={Promise.resolve(params)} />
      </Suspense>
    </div>
  );
}
