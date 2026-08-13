"use client";

import type { ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type OverviewTabsProps = {
  activity: ReactNode;
  releaseNotes: ReactNode;
};

export function OverviewTabs({ activity, releaseNotes }: OverviewTabsProps) {
  return (
    <Tabs defaultValue="activity">
      <TabsList aria-label="Project overview sections" variant="line">
        <TabsTrigger value="activity">Project member activity</TabsTrigger>
        <TabsTrigger value="release-notes">Release notes</TabsTrigger>
      </TabsList>
      <TabsContent value="activity" className="pt-4">
        {activity}
      </TabsContent>
      <TabsContent value="release-notes" className="pt-4">
        {releaseNotes}
      </TabsContent>
    </Tabs>
  );
}
