import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { SprintManager } from "./_components/sprint-manager";

export const metadata: Metadata = { title: "Sprints · Project Tracker" };

export default async function SprintsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: projects, error: projectsError }, { data: sprints, error: sprintsError }, { data: settings, error: settingsError }, { data: activities, error: activitiesError }, { data: projectMembers, error: projectMembersError }, { data: profiles, error: profilesError }, { data: allocations, error: allocationsError }, { data: timeOff, error: timeOffError }, { data: activityNotes, error: activityNotesError }] = await Promise.all([
    supabase.from("projects").select("id, name, status").order("name"),
    supabase.from("sprints").select("id, project_id, sprint_number, version, name, description, release_notes, start_date, end_date, working_days, daily_work_hours, planned_capacity_hours, status").order("start_date", { ascending: false }),
    supabase.from("workspace_settings").select("working_days, daily_work_hours").eq("id", true).single(),
    supabase.from("activity_types").select("id, name, is_active").order("name"),
    supabase.from("project_members").select("project_id, user_id"),
    supabase.from("profiles").select("id, email, full_name, competency, status").eq("status", "active"),
    supabase.from("sprint_member_allocations").select("id, sprint_id, user_id, activity_id, hours"),
    supabase.from("sprint_member_time_off").select("id, sprint_id, user_id, start_date, end_date"),
    supabase.from("sprint_member_activity_notes").select("id, sprint_id, user_id, activity, note"),
  ]);
  const error = projectsError ?? sprintsError ?? settingsError ?? activitiesError ?? projectMembersError ?? profilesError ?? allocationsError ?? timeOffError ?? activityNotesError;
  const activeProfiles = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const members = (projectMembers ?? []).flatMap((member) => {
    const profile = activeProfiles.get(member.user_id);
    return profile ? [{ ...profile, project_id: member.project_id }] : [];
  });
  return <div className="space-y-6"><header className="space-y-1"><h1 className="text-2xl font-semibold">Sprints</h1><p className="text-sm text-muted-foreground">Plan project iterations with a saved work calendar, capacity, and team activity allocation.</p></header>{error ? <Alert variant="destructive"><AlertDescription>Could not load sprint planning data: {error.message}</AlertDescription></Alert> : <SprintManager projects={projects ?? []} sprints={sprints ?? []} defaults={settings ?? { working_days: [1, 2, 3, 4, 5], daily_work_hours: 8 }} activities={activities ?? []} members={members} allocations={allocations ?? []} timeOff={timeOff ?? []} activityNotes={activityNotes ?? []} />}</div>;
}
