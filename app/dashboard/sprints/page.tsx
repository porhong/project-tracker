import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ProjectSwitcher } from "../_components/project-switcher";
import { SprintManager } from "./_components/sprint-manager";

export const metadata: Metadata = { title: "Sprints · Project Tracker" };

type SprintsPageProps = {
  searchParams: Promise<{ project?: string | string[] }>;
};

export default async function SprintsPage({ searchParams }: SprintsPageProps) {
  await requireAdmin();
  const params = await searchParams;
  const requestedProjectId =
    typeof params.project === "string" ? params.project : undefined;
  const supabase = await createClient();
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, status")
    .order("name");
  const selectedProject =
    projects?.find((project) => project.id === requestedProjectId) ?? projects?.[0];

  if (projectsError) {
    return <Alert variant="destructive"><AlertDescription>Could not load projects: {projectsError.message}</AlertDescription></Alert>;
  }

  if (!selectedProject) {
    return <div className="space-y-6"><header className="space-y-1"><h1 className="text-2xl font-semibold">Sprints</h1><p className="text-sm text-muted-foreground">Plan project iterations with a saved work calendar, capacity, and team activity allocation.</p></header><Alert><AlertDescription>Create a project before planning sprints.</AlertDescription></Alert></div>;
  }

  const [{ data: sprints, error: sprintsError }, { data: settings, error: settingsError }, { data: activities, error: activitiesError }, { data: projectMembers, error: projectMembersError }] = await Promise.all([
    supabase.from("sprints").select("id, project_id, sprint_number, version, description, release_notes, start_date, end_date, working_days, daily_work_hours, planned_capacity_hours, status").eq("project_id", selectedProject.id).order("start_date", { ascending: false }),
    supabase.from("workspace_settings").select("working_days, daily_work_hours").eq("id", true).single(),
    supabase.from("activity_types").select("id, name, is_active").order("name"),
    supabase.from("project_members").select("project_id, user_id").eq("project_id", selectedProject.id),
  ]);
  const sprintIds = (sprints ?? []).map((sprint) => sprint.id);
  const memberIds = (projectMembers ?? []).map((member) => member.user_id);
  const [{ data: profiles, error: profilesError }, { data: allocations, error: allocationsError }, { data: timeOff, error: timeOffError }, { data: activityNotes, error: activityNotesError }, { data: milestones, error: milestonesError }] = await Promise.all([
    memberIds.length ? supabase.from("profiles").select("id, email, full_name, competency, status").eq("status", "active").in("id", memberIds) : Promise.resolve({ data: [], error: null }),
    sprintIds.length ? supabase.from("sprint_member_allocations").select("id, sprint_id, user_id, activity_id, hours").in("sprint_id", sprintIds) : Promise.resolve({ data: [], error: null }),
    sprintIds.length ? supabase.from("sprint_member_time_off").select("id, sprint_id, user_id, start_date, end_date").in("sprint_id", sprintIds) : Promise.resolve({ data: [], error: null }),
    sprintIds.length ? supabase.from("sprint_member_activity_notes").select("id, sprint_id, user_id, activity, note").in("sprint_id", sprintIds) : Promise.resolve({ data: [], error: null }),
    sprintIds.length ? supabase.from("sprint_milestones").select("id, sprint_id, title, description, target_date, status, icon, order_index, created_at, updated_at").in("sprint_id", sprintIds).order("order_index", { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = sprintsError ?? settingsError ?? activitiesError ?? projectMembersError ?? profilesError ?? allocationsError ?? timeOffError ?? activityNotesError ?? milestonesError;
  const activeProfiles = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const members = (projectMembers ?? []).flatMap((member) => {
    const profile = activeProfiles.get(member.user_id);
    return profile ? [{ ...profile, project_id: member.project_id }] : [];
  });
  return <div className="space-y-8"><header className="grid gap-4 border-b pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="max-w-2xl space-y-1"><h1 className="text-2xl font-semibold">Sprints</h1><p className="text-sm text-muted-foreground">Plan project iterations with a saved work calendar, capacity, and team activity allocation.</p></div><ProjectSwitcher projects={projects ?? []} /></header>{error ? <Alert variant="destructive"><AlertDescription>Could not load sprint planning data: {error.message}</AlertDescription></Alert> : <SprintManager project={selectedProject} sprints={sprints ?? []} defaults={settings ?? { working_days: [1, 2, 3, 4, 5], daily_work_hours: 8 }} activities={activities ?? []} members={members} allocations={allocations ?? []} timeOff={timeOff ?? []} activityNotes={activityNotes ?? []} milestones={milestones ?? []} />}</div>;
}
