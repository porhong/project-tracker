import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/guards";
import { workingDaysLabel } from "@/lib/sprint-config";
import { CalendarIcon, ClockIcon, TrendingUpIcon, UsersIcon } from "lucide-react";
import { ProjectSwitcher } from "../_components/project-switcher";
import { createClient } from "@/lib/supabase/server";
import { ClientOverviewSelector } from "./_components/client-overview-selector";
import { MemberActivityExplorer } from "./_components/member-activity-explorer";
import { OverviewTabs } from "./_components/overview-tabs";
import { ReleaseNotesFeed } from "./_components/release-notes-feed";
import { SprintTimeline } from "./_components/sprint-timeline";
import type {
  ClientReleaseSprint,
  ClientSprint,
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

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 2 });

function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}

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

function sprintStatusVariant(status: string) {
  return status === "active" ? "default" : "secondary";
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

  const error = releaseResult.error ?? progressResult.error;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load this project overview: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

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
        <ProjectSwitcher projects={projects ?? []} />
      </header>

      <OverviewTabs
        sprintTimeline={
          <section className="space-y-6" aria-labelledby="sprint-timeline-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 id="sprint-timeline-heading" className="text-xl font-semibold">
                  Sprint timeline &amp; milestones
                </h2>
                <p className="text-sm text-muted-foreground">
                  Track schedule, current progress, milestones, and team capacity for this sprint period.
                </p>
              </div>
              {visibleSprints.length > 0 ? (
                <ClientOverviewSelector
                  sprints={visibleSprints}
                  selectedSprintId={selectedSprint?.id ?? null}
                />
              ) : null}
            </div>

            {!selectedSprint ? (
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
              />
            )}
          </section>
        }
        activity={
          <section className="space-y-6" aria-labelledby="sprint-activity-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 id="sprint-activity-heading" className="text-xl font-semibold">
                  Project member activity
                </h2>
                <p className="text-sm text-muted-foreground">
                  Planned allocation and reported activity for the selected sprint.
                </p>
              </div>
              {visibleSprints.length > 0 ? (
                <ClientOverviewSelector
                  sprints={visibleSprints}
                  selectedSprintId={selectedSprint?.id ?? null}
                />
              ) : null}
            </div>

            {!selectedSprint ? (
              <Alert>
                <AlertDescription>
                  No active or completed sprint is available for this project yet.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          Sprint #{selectedSprint.sprint_number}
                        </CardTitle>
                        <CardDescription>
                          {selectedSprint.version} · {formatDate(selectedSprint.start_date)} —{" "}
                          {formatDate(selectedSprint.end_date)}
                        </CardDescription>
                      </div>
                      <Badge variant={sprintStatusVariant(selectedSprint.status)}>
                        {selectedSprint.status === "active" ? "Active sprint" : "Completed sprint"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-0">
                    <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <UsersIcon className="size-3.5 text-primary" />
                        <span>Team Members</span>
                      </div>
                      <p className="text-2xl font-semibold tabular-nums text-foreground">
                        {selectedSprintRows.length}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Assigned to sprint
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <ClockIcon className="size-3.5 text-primary" />
                        <span>Total Planned Effort</span>
                      </div>
                      <p className="text-2xl font-semibold tabular-nums text-foreground">
                        {hours(plannedHours)}h
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Across all activities
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <CalendarIcon className="size-3.5 text-primary" />
                        <span>Working Days</span>
                      </div>
                      <p className="text-sm font-semibold leading-tight pt-1 text-foreground">
                        {workingDaysLabel(selectedSprint.working_days)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Sprint schedule
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <TrendingUpIcon className="size-3.5 text-primary" />
                        <span>Daily Capacity</span>
                      </div>
                      <p className="text-2xl font-semibold tabular-nums text-foreground">
                        {hours(selectedSprint.daily_work_hours)}h
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Per person / work day
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <MemberActivityExplorer
                  sprint={selectedSprint}
                  progressRows={selectedSprintRows}
                  totalPlannedHours={plannedHours}
                />
              </>
            )}
          </section>
        }
        releaseNotes={
          <section className="space-y-6" aria-labelledby="release-notes-heading">
            <div className="space-y-1">
              <h2 id="release-notes-heading" className="text-xl font-semibold">
                Release notes
              </h2>
              <p className="text-sm text-muted-foreground">
                Current and completed sprint releases grouped by sprint and version.
              </p>
            </div>

            <ReleaseNotesFeed releases={releaseSprints} />
          </section>
        }
      />
    </div>
  );
}

/** Retain the original route for old links while viewer overview lives at /dashboard. */
export default function ClientOverviewPage() {
  redirect("/dashboard");
}
