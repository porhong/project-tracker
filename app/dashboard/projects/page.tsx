import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ProjectManager } from "./_components/project-manager";

export const metadata: Metadata = { title: "Projects · Project Tracker" };

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [
    { data: projects, error: projectsError },
    { data: members, error: membersError },
    { data: users, error: usersError },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, status, created_at")
      .order("name"),
    supabase.from("project_members").select("project_id, user_id"),
    supabase
      .from("profiles")
      .select("id, email, full_name, competency, status")
      .eq("status", "active")
      .order("full_name"),
  ]);
  const error = projectsError ?? membersError ?? usersError;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Set up projects before planning their sprints. Archived projects keep their history.
        </p>
      </header>
      {error ? (
        <Alert variant="destructive"><AlertDescription>Could not load projects: {error.message}</AlertDescription></Alert>
      ) : (
        <ProjectManager
          projects={projects ?? []}
          members={members ?? []}
          users={users ?? []}
        />
      )}
    </div>
  );
}
