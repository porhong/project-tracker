"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useOverviewTab } from "./overview-tab-context";

type OverviewTabsProps = {
  sprintTimeline: ReactNode;
  activity: ReactNode;
  releaseNotes: ReactNode;
  retrospective: ReactNode;
  activityScope?: "own" | "team";
};

export function OverviewTabs({
  sprintTimeline,
  activity,
  releaseNotes,
  retrospective,
  activityScope = "team",
}: OverviewTabsProps) {
  const { activeTab, setActiveTab } = useOverviewTab();

  const handleTabChange = (value: string | number | null) => {
    if (typeof value === "string") {
      setActiveTab(value);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList aria-label="Project overview sections" variant="line">
        <TabsTrigger value="timeline">Sprint Overview</TabsTrigger>
        <TabsTrigger value="activity">
          {activityScope === "own" ? "My work" : "Team & Work"}
        </TabsTrigger>
        <TabsTrigger value="release-notes">Release Notes</TabsTrigger>
        <TabsTrigger value="retrospective">Retrospective</TabsTrigger>
      </TabsList>
      <TabsContent value="timeline" keepMounted className="pt-4">
        {sprintTimeline}
      </TabsContent>
      <TabsContent value="activity" keepMounted className="pt-4">
        {activity}
      </TabsContent>
      <TabsContent value="release-notes" keepMounted className="pt-4">
        {releaseNotes}
      </TabsContent>
      <TabsContent value="retrospective" keepMounted className="pt-4">
        {retrospective}
      </TabsContent>
    </Tabs>
  );
}


