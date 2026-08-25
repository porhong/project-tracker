"use client";

import { useSearchParams } from "next/navigation";
import type { AppRole } from "@/lib/auth/roles";
import { ProjectSwitcher } from "../../_components/project-switcher";
import { ClientOverviewSelector } from "./client-overview-selector";
import { ExportSummaryDialog } from "./export-summary-dialog";
import type {
  ClientProject,
  ClientSprint,
  ClientSprintMilestone,
  ClientSprintProgress,
} from "../types";

type ClientOverviewHeaderControlsProps = {
  projects: ClientProject[];
  visibleSprints: ClientSprint[];
  selectedSprintId: string | null;
  selectedProject: ClientProject;
  selectedSprint: ClientSprint | null;
  selectedSprintRows: ClientSprintProgress[];
  selectedSprintMilestones: ClientSprintMilestone[];
  totalPlannedHours: number;
  activityScope?: "own" | "team";
  userRole: AppRole;
};

export function ClientOverviewHeaderControls({
  projects,
  visibleSprints,
  selectedSprintId,
  selectedProject,
  selectedSprint,
  selectedSprintRows,
  selectedSprintMilestones,
  totalPlannedHours,
  activityScope = "team",
  userRole,
}: ClientOverviewHeaderControlsProps) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "timeline";
  const showSprintSelector =
    activeTab !== "release-notes" && visibleSprints.length > 0;
  const showExportButton =
    userRole === "admin" && selectedSprint && activeTab !== "release-notes";

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-end">
      <ProjectSwitcher projects={projects} />
      {showSprintSelector ? (
        <ClientOverviewSelector
          sprints={visibleSprints}
          selectedSprintId={selectedSprintId}
        />
      ) : null}
      {showExportButton ? (
        <ExportSummaryDialog
          projectName={selectedProject.name}
          projectDescription={selectedProject.description}
          sprint={selectedSprint}
          progressRows={selectedSprintRows}
          totalPlannedHours={totalPlannedHours}
          milestones={selectedSprintMilestones}
          activityScope={activityScope}
        />
      ) : null}
    </div>
  );
}
