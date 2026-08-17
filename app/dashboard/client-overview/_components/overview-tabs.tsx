"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type OverviewTabsProps = {
  sprintTimeline: ReactNode;
  activity: ReactNode;
  releaseNotes: ReactNode;
};

export function OverviewTabs({
  sprintTimeline,
  activity,
  releaseNotes,
}: OverviewTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = searchParams.get("tab") || "timeline";

  const handleTabChange = (value: string | number | null) => {
    if (!value || typeof value !== "string") return;
    const params = new URLSearchParams(searchParams.toString());
    if (value === "timeline") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList aria-label="Project overview sections" variant="line">
        <TabsTrigger value="timeline">Sprint Overview</TabsTrigger>
        <TabsTrigger value="activity">Team & Work</TabsTrigger>
        <TabsTrigger value="release-notes">Release Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" className="pt-4">
        {sprintTimeline}
      </TabsContent>
      <TabsContent value="activity" className="pt-4">
        {activity}
      </TabsContent>
      <TabsContent value="release-notes" className="pt-4">
        {releaseNotes}
      </TabsContent>
    </Tabs>
  );
}

