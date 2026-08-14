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
import { Separator } from "@/components/ui/separator";
import { requireProfile } from "@/lib/auth/guards";
import { countAvailableSprintDays, memberAvailableHours } from "@/lib/sprint-capacity";
import { SPRINT_STATUS_LABELS } from "@/lib/sprint-config";
import { createClient } from "@/lib/supabase/server";
import { MySprintActivityEditor } from "./_components/my-sprint-activity-editor";

export const metadata: Metadata = {
  title: "My sprint activity · Project Tracker",
};

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 2 });

type MySprintActivityPageProps = {
  searchParams: Promise<{ project?: string | string[] }>;
};

export default async function MySprintActivityPage({
  searchParams,
}: MySprintActivityPageProps) {
  const user = await requireProfile();
  if (user.role === "viewer") redirect("/dashboard?error=forbidden");
  const params = await searchParams;
  const requestedProjectId =
    typeof params.project === "string" ? params.project : undefined;
  const supabase = await createClient();
  const sprintStatuses = user.role === "user" ? ["active"] : ["draft", "active"];
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name")
    .order("name");
  const selectedProject =
    projects?.find((project) => project.id === requestedProjectId) ?? projects?.[0];

  if (projectsError) {
    return <Alert variant="destructive"><AlertDescription>Could not load your projects: {projectsError.message}</AlertDescription></Alert>;
  }

  if (!selectedProject) {
    return <div className="space-y-6"><header className="space-y-1"><h1 className="text-2xl font-semibold">My sprint activity</h1><p className="text-sm text-muted-foreground">Manage your own activity, availability, and allocation for active sprints.</p></header><Alert><AlertDescription>You are not currently assigned to a project.</AlertDescription></Alert></div>;
  }

  const { data: sprints, error: sprintsError } = await supabase
    .from("sprints")
    .select(
      "id, project_id, sprint_number, start_date, end_date, working_days, daily_work_hours, status",
    )
    .eq("project_id", selectedProject.id)
    .in("status", sprintStatuses)
    .order("start_date", { ascending: false });
  const sprintIds = (sprints ?? []).map((sprint) => sprint.id);
  const [
    { data: allocations, error: allocationsError },
    { data: timeOff, error: timeOffError },
    { data: activities, error: activitiesError },
    { data: activityNotes, error: activityNotesError },
  ] = await Promise.all([
    sprintIds.length ? supabase.from("sprint_member_allocations").select("sprint_id, activity_id, hours").eq("user_id", user.id).in("sprint_id", sprintIds) : Promise.resolve({ data: [], error: null }),
    sprintIds.length ? supabase.from("sprint_member_time_off").select("sprint_id, start_date, end_date").eq("user_id", user.id).in("sprint_id", sprintIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("activity_types").select("id, name, is_active"),
    sprintIds.length ? supabase.from("sprint_member_activity_notes").select("sprint_id, activity, note").eq("user_id", user.id).in("sprint_id", sprintIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const error =
    sprintsError ??
    allocationsError ??
    timeOffError ??
    activitiesError ??
    activityNotesError;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load your sprint activity: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const projectsById = new Map(
    (projects ?? []).map((project) => [project.id, project.name]),
  );
  const activitiesById = new Map(
    (activities ?? []).map((activity) => [activity.id, activity.name]),
  );
  const activeActivities = (activities ?? []).filter(
    (activity) => activity.is_active,
  );
  const allocationsBySprint = new Map<string, typeof allocations>();
  (allocations ?? []).forEach((allocation) =>
    allocationsBySprint.set(allocation.sprint_id, [
      ...(allocationsBySprint.get(allocation.sprint_id) ?? []),
      allocation,
    ]),
  );
  const timeOffBySprint = new Map<string, typeof timeOff>();
  (timeOff ?? []).forEach((record) =>
    timeOffBySprint.set(record.sprint_id, [
      ...(timeOffBySprint.get(record.sprint_id) ?? []),
      record,
    ]),
  );
  const notesBySprint = new Map<string, typeof activityNotes>();
  (activityNotes ?? []).forEach((note) =>
    notesBySprint.set(note.sprint_id, [
      ...(notesBySprint.get(note.sprint_id) ?? []),
      note,
    ]),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">My sprint activity</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === "user"
            ? "Manage your own activity, availability, and allocation for active sprints."
            : "Your planned availability and activity allocation for projects you currently belong to."}
        </p>
      </header>

      {(sprints ?? []).length === 0 ? (
        <Alert>
          <AlertDescription>
            {user.role === "user"
              ? "You are not currently assigned to a project with an active sprint."
              : "You are not currently assigned to a project with a draft or active sprint."}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(sprints ?? []).map((sprint) => {
            const sprintAllocations = allocationsBySprint.get(sprint.id) ?? [];
            const sprintTimeOff = timeOffBySprint.get(sprint.id) ?? [];
            const sprintNotes = notesBySprint.get(sprint.id) ?? [];
            const days = countAvailableSprintDays(sprint, sprintTimeOff);
            const available = memberAvailableHours(sprint, sprintTimeOff);
            const allocated = sprintAllocations.reduce(
              (total, allocation) =>
                total + Number(allocation.hours),
              0,
            );
            const editable = user.role === "user" && sprint.status === "active";

            return (
              <Card key={sprint.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>
                        Sprint #{sprint.sprint_number}
                      </CardTitle>
                      <CardDescription>
                        {projectsById.get(sprint.project_id) ?? "Project"} ·{" "}
                        {sprint.start_date} — {sprint.end_date}
                      </CardDescription>
                    </div>
                    <Badge variant={sprint.status === "active" ? "default" : sprint.status === "completed" ? "secondary" : "outline"}>
                      {SPRINT_STATUS_LABELS[sprint.status as keyof typeof SPRINT_STATUS_LABELS] ?? sprint.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="font-semibold tabular-nums">{hours(available)}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Allocated</p>
                      <p className="font-semibold tabular-nums">{hours(allocated)}h</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Days</p>
                      <p className="font-semibold tabular-nums">{days}</p>
                    </div>
                  </div>
                  <Separator />

                  {editable ? (
                    <MySprintActivityEditor
                      sprintId={sprint.id}
                      startDate={sprint.start_date}
                      endDate={sprint.end_date}
                      workingDays={sprint.working_days}
                      dailyWorkHours={Number(sprint.daily_work_hours)}
                      activities={activeActivities}
                      allocations={sprintAllocations}
                      timeOff={sprintTimeOff}
                      notes={sprintNotes}
                    />
                  ) : (
                    <>
                      {sprintAllocations.length ? (
                        <ul className="grid gap-2">
                          {sprintAllocations.map((allocation) => (
                            <li
                              className="flex items-center justify-between gap-4 text-sm"
                              key={allocation.activity_id}
                            >
                              <span>
                                {activitiesById.get(allocation.activity_id) ??
                                  "Inactive activity"}
                              </span>
                              <span className="font-medium tabular-nums">
                                {hours(Number(allocation.hours))}h
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No activity allocation has been planned yet.
                        </p>
                      )}
                      {sprintNotes.length ? (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Activity notes</p>
                            <ul className="grid gap-2">
                              {sprintNotes.map((activityNote, index) => (
                                <li
                                  className="text-sm"
                                  key={`${activityNote.activity}-${index}`}
                                >
                                  <p className="font-medium">{activityNote.activity}</p>
                                  {activityNote.note ? (
                                    <p className="text-muted-foreground">
                                      {activityNote.note}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </>
                      ) : null}
                      {sprintTimeOff.length ? (
                        <p className="text-xs text-muted-foreground">
                          Time off:{" "}
                          {sprintTimeOff
                            .map(
                              (record) => `${record.start_date} — ${record.end_date}`,
                            )
                            .join(", ")}
                        </p>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
