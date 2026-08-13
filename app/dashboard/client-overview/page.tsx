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
import { ReleaseNotesEditor } from "../sprints/_components/release-notes-editor";
import { createClient } from "@/lib/supabase/server";
import { ClientOverviewSelector } from "./_components/client-overview-selector";
import { OverviewTabs } from "./_components/overview-tabs";
import type {
  ActivityNote,
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

const compactDateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 2 });

function formatDate(value: string) {
  return dateFormat.format(new Date(`${value}T00:00:00Z`));
}

function formatSprintDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const startLabel = compactDateFormat.format(start);
  const endLabel = compactDateFormat.format(end);

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${startLabel}, ${start.getUTCFullYear()} – ${endLabel}, ${end.getUTCFullYear()}`;
  }

  return startLabel === endLabel
    ? `${startLabel}, ${end.getUTCFullYear()}`
    : `${startLabel}–${endLabel}, ${end.getUTCFullYear()}`;
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

function isActivityNote(value: unknown): value is ActivityNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "note" in value &&
    "updated_at" in value &&
    typeof value.activity === "string" &&
    (typeof value.note === "string" || value.note === null) &&
    typeof value.updated_at === "string"
  );
}

function allocations(value: ClientSprintProgress["planned_allocations"]) {
  return Array.isArray(value) ? value.filter(isPlannedAllocation) : [];
}

function activityNotes(value: ClientSprintProgress["activity_notes"]) {
  return Array.isArray(value) ? value.filter(isActivityNote) : [];
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
        "id, sprint_number, version, name, description, release_notes, start_date, end_date, working_days, daily_work_hours, status",
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
  const releaseSprints = (releaseResult.data ?? []).filter((sprint) =>
    hasReleaseNoteContent(sprint.release_notes),
  );
  const schedulesBySprintId = new Map(
    (releaseResult.data ?? []).map((sprint) => [
      sprint.id,
      {
        working_days: sprint.working_days,
        daily_work_hours: Number(sprint.daily_work_hours),
      },
    ]),
  );
  const sprintMap = new Map<string, ClientSprint>();
  for (const row of progressRows) {
    const schedule = schedulesBySprintId.get(row.sprint_id);
    sprintMap.set(row.sprint_id, {
      id: row.sprint_id,
      sprint_number: row.sprint_number,
      version: row.version,
      name: row.sprint_name,
      start_date: row.start_date,
      end_date: row.end_date,
      working_days: schedule?.working_days ?? [],
      daily_work_hours: schedule?.daily_work_hours ?? 0,
      status: row.sprint_status,
    });
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
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Client overview</h1>
          <Badge variant={selectedProject.status === "active" ? "default" : "secondary"}>
            {selectedProject.status === "active" ? "Active project" : "Archived project"}
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {selectedProject.description ||
            "Follow project releases and the team’s sprint activity."}
        </p>
      </header>

      <ClientOverviewSelector
        projects={projects ?? []}
        selectedProjectId={selectedProject.id}
        sprints={visibleSprints}
        selectedSprintId={selectedSprint?.id ?? null}
      />

      <OverviewTabs
        activity={<section className="space-y-4" aria-labelledby="sprint-activity-heading">
        <div className="space-y-1">
          <h2 id="sprint-activity-heading" className="text-xl font-semibold">
            Project member activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Planned allocation and reported activity for the selected sprint.
          </p>
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
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selectedSprint.name}</CardTitle>
                    <CardDescription>
                      {selectedSprint.version} · {formatDate(selectedSprint.start_date)} —{" "}
                      {formatDate(selectedSprint.end_date)}
                    </CardDescription>
                  </div>
                  <Badge variant={sprintStatusVariant(selectedSprint.status)}>
                    {selectedSprint.status === "active" ? "Active" : "Completed"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Project members</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {selectedSprintRows.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Total activity allocation
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {hours(plannedHours)}h
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Working days</p>
                  <p className="font-semibold">
                    {workingDaysLabel(selectedSprint.working_days)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hours per work day</p>
                  <p className="font-semibold tabular-nums">
                    {hours(selectedSprint.daily_work_hours)}h
                  </p>
                </div>
              </CardContent>
            </Card>

            {selectedSprintRows.length ? (
              <Card>
                <CardContent className="px-0">
                  <div className="hidden grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1fr)_minmax(16rem,1.25fr)] gap-6 border-b px-5 py-3 text-xs font-medium text-muted-foreground md:grid">
                    <p>Member</p>
                    <p>Planned activity</p>
                    <p>Reported activity</p>
                  </div>
                  <ul className="divide-y divide-border">
                    {selectedSprintRows.map((row, index) => {
                      const memberAllocations = allocations(row.planned_allocations);
                      const memberNotes = activityNotes(row.activity_notes);
                      return (
                        <li
                          className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1fr)_minmax(16rem,1.25fr)] md:gap-6"
                          key={`${row.sprint_id}-${row.member_name || "member"}-${index}`}
                        >
                          <div>
                            <p className="font-medium">
                              {row.member_name || "Project member"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {row.competency || "Project team member"}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground md:sr-only">
                              Planned activity
                            </p>
                            {memberAllocations.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {memberAllocations.map((allocation) => (
                                  <Badge key={allocation.activity} variant="outline">
                                    {allocation.activity} · {hours(allocation.hours)}h
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">—</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground md:sr-only">
                              Reported activity
                            </p>
                            {memberNotes.length ? (
                              <ul className="grid gap-2">
                                {memberNotes.map((note, noteIndex) => (
                                  <li
                                    className="text-sm"
                                    key={`${note.activity}-${note.updated_at}-${noteIndex}`}
                                  >
                                    <span className="font-medium">{note.activity}</span>
                                    {note.note ? (
                                      <span className="text-muted-foreground">
                                        {" · "}{note.note}
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">—</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            ) : (
              <Alert>
                <AlertDescription>
                  No project members are available for this sprint.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
        </section>}

        releaseNotes={<section className="space-y-4" aria-labelledby="release-notes-heading">
        <div className="space-y-1">
          <h2 id="release-notes-heading" className="text-xl font-semibold">
            Release notes
          </h2>
          <p className="text-sm text-muted-foreground">
            Current and completed sprint releases, most recent first.
          </p>
        </div>

        {releaseSprints.length ? (
          <div className="space-y-6">
            {releaseSprints.map((sprint) => (
              <article key={sprint.id} className="space-y-3 border-t pt-6">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{sprint.name}</h3>
                    {sprint.status === "active" ? <Badge>Active</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sprint.version} · {formatSprintDateRange(sprint.start_date, sprint.end_date)}
                  </p>
                  {sprint.description ? (
                    <p className="text-sm text-muted-foreground">
                      {sprint.description}
                    </p>
                  ) : null}
                </div>
                <ReleaseNotesEditor content={sprint.release_notes} />
              </article>
            ))}
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              Sprint release notes will appear here once saved.
            </AlertDescription>
          </Alert>
        )}
        </section>}
      />
    </div>
  );
}

/** Retain the original route for old links while viewer overview lives at /dashboard. */
export default function ClientOverviewPage() {
  redirect("/dashboard");
}
