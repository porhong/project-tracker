"use client";

import { useSearchParams } from "next/navigation";
import { ProjectSwitcher } from "../../_components/project-switcher";
import { ClientOverviewSelector } from "./client-overview-selector";
import type { ClientProject, ClientSprint } from "../types";

type ClientOverviewHeaderControlsProps = {
  projects: ClientProject[];
  visibleSprints: ClientSprint[];
  selectedSprintId: string | null;
};

export function ClientOverviewHeaderControls({
  projects,
  visibleSprints,
  selectedSprintId,
}: ClientOverviewHeaderControlsProps) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "timeline";
  const showSprintSelector =
    activeTab !== "release-notes" && visibleSprints.length > 0;

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
      <ProjectSwitcher projects={projects} />
      {showSprintSelector ? (
        <ClientOverviewSelector
          sprints={visibleSprints}
          selectedSprintId={selectedSprintId}
        />
      ) : null}
    </div>
  );
}
