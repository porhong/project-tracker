import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireViewer } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ClientOverviewHeaderControls } from "./_components/client-overview-header-controls";
import { MemberActivityExplorer } from "./_components/member-activity-explorer";
import { OverviewTabs } from "./_components/overview-tabs";
import { ReleaseNotesFeed } from "./_components/release-notes-feed";
import { SprintTimeline } from "./_components/sprint-timeline";
import type {
  ClientReleaseSprint,
  ClientSprint,
  ClientSprintMilestone,
  ClientSprintProgress,
  PlannedAllocation,
} from "./types";

export const metadata: Metadata = {
  title: "Client overview · Project Tracker",
};

type ClientOverviewPageProps = {
  searchParams: Promise<{
    project?: string | string[];
    sprint?: string | string[];
  }>;
};

function isPlannedAllocation(value: unknown): value is PlannedAllocation {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "hours" in value &&
    typeof value.activity === "string" &&
    typeof value.hours === "number"
  );
}

function allocations(value: ClientSprintProgress["planned_allocations"]) {
  return Array.isArray(value) ? value.filter(isPlannedAllocation) : [];
}

function hasReleaseNoteContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasReleaseNoteContent);
  if (value && typeof value === "object") {
    const node = value as { content?: unknown; text?: unknown };
    return hasReleaseNoteContent(node.text) || hasReleaseNoteContent(node.content);
  }
  return false;
}

export async function ClientOverview({
  searchParams,
}: ClientOverviewPageProps) {
  await requireViewer();
  const params = await searchParams;
  const requestedProjectId =
    typeof params.project === "string" ? params.project : undefined;
  const requestedSprintId =
    typeof params.sprint === "string" ? params.sprint : undefined;
  const supabase = await createClient();

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, description, status")
    .order("name");

  if (projectsError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load your projects: {projectsError.message}
        </AlertDescription>
      </Alert>
    );
  }

  const selectedProject =
    projects?.find((project) => project.id === requestedProjectId) ??
    projects?.[0];

  if (!selectedProject) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Client overview</h1>
          <p className="text-sm text-muted-foreground">
            Follow project releases and the team&apos;s sprint activity.
          </p>
        </header>
        <Alert>
          <AlertDescription>
            You have not been assigned to a project yet. Ask your project
            administrator to grant access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [releaseResult, progressResult] = await Promise.all([
    supabase
      .from("sprints")
      .select(
        "id, sprint_number, version, description, release_notes, start_date, end_date, working_days, daily_work_hours, status",
      )
      .eq("project_id", selectedProject.id)
      .in("status", ["active", "completed"])
      .order("end_date", { ascending: false }),
    supabase.rpc("get_client_project_sprint_progress", {
      p_project_id: selectedProject.id,
    }),
  ]);

  const sprintIds = (releaseResult.data ?? []).map((sprint) => sprint.id);
  const { data: milestonesResult, error: milestonesError } = sprintIds.length
    ? await supabase
        .from("sprint_milestones")
        .select("id, sprint_id, title, description, target_date, status, icon, order_index")
        .in("sprint_id", sprintIds)
        .order("order_index", { ascending: true })
    : { data: [], error: null };

  const error = releaseResult.error ?? progressResult.error ?? milestonesError;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load this project overview: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const allMilestones = (milestonesResult ?? []) as ClientSprintMilestone[];
  const progressRows = (progressResult.data ?? []) as ClientSprintProgress[];
  const releaseSprints: ClientReleaseSprint[] = (releaseResult.data ?? [])
    .filter((sprint) => hasReleaseNoteContent(sprint.release_notes))
    .map((sprint) => ({
      id: sprint.id,
      sprint_number: sprint.sprint_number,
      version: sprint.version,
      description: sprint.description,
      release_notes: sprint.release_notes,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      working_days: sprint.working_days,
      daily_work_hours: Number(sprint.daily_work_hours),
      status: sprint.status,
    }));

  const sprintMap = new Map<string, ClientSprint>();
  for (const sprint of releaseResult.data ?? []) {
    sprintMap.set(sprint.id, {
      id: sprint.id,
      sprint_number: sprint.sprint_number,
      version: sprint.version,
      description: sprint.description,
      release_notes: sprint.release_notes,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      working_days: sprint.working_days ?? [],
      daily_work_hours: Number(sprint.daily_work_hours) || 0,
      status: sprint.status,
    });
  }
  for (const row of progressRows) {
    if (!sprintMap.has(row.sprint_id)) {
      sprintMap.set(row.sprint_id, {
        id: row.sprint_id,
        sprint_number: row.sprint_number,
        version: row.version,
        description: null,
        release_notes: null,
        start_date: row.start_date,
        end_date: row.end_date,
        working_days: [],
        daily_work_hours: 0,
        status: row.sprint_status,
      });
    }
  }
  const visibleSprints = [...sprintMap.values()];
  const selectedSprint =
    visibleSprints.find((sprint) => sprint.id === requestedSprintId) ??
    visibleSprints.find((sprint) => sprint.status === "active") ??
    visibleSprints[0];
  const selectedSprintRows = selectedSprint
    ? progressRows.filter((row) => row.sprint_id === selectedSprint.id)
    : [];
  const selectedSprintMilestones = selectedSprint
    ? allMilestones.filter((m) => m.sprint_id === selectedSprint.id)
    : [];
  const plannedHours = selectedSprintRows.reduce(
    (total, row) =>
      total + allocations(row.planned_allocations).reduce((sum, item) => sum + item.hours, 0),
    0,
  );

  return (
    <div className="space-y-8">
      <header className="grid gap-4 border-b pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Client overview</h1>
            <Badge variant={selectedProject.status === "active" ? "default" : "secondary"}>
              {selectedProject.status === "active" ? "Active project" : "Archived project"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedProject.description ||
              "Follow project releases and the team’s sprint activity."}
          </p>
        </div>
        <ClientOverviewHeaderControls
          projects={projects ?? []}
          visibleSprints={visibleSprints}
          selectedSprintId={selectedSprint?.id ?? null}
        />
      </header>

      <OverviewTabs
        sprintTimeline={
          !selectedSprint ? (
            <Alert>
              <AlertDescription>
                No active or completed sprint is available for this project yet.
              </AlertDescription>
            </Alert>
          ) : (
            <SprintTimeline
              sprint={selectedSprint}
              progressRows={selectedSprintRows}
              totalPlannedHours={plannedHours}
              milestones={selectedSprintMilestones}
            />
          )
        }
        activity={
          !selectedSprint ? (
            <Alert>
              <AlertDescription>
                No active or completed sprint is available for this project yet.
              </AlertDescription>
            </Alert>
          ) : (
            <MemberActivityExplorer
              sprint={selectedSprint}
              progressRows={selectedSprintRows}
              totalPlannedHours={plannedHours}
            />
          )
        }
        releaseNotes={<ReleaseNotesFeed releases={releaseSprints} />}
      />
    </div>
  );
}

/** Retain the original route for old links while viewer overview lives at /dashboard. */
export default function ClientOverviewPage() {
  redirect("/dashboard");
}
