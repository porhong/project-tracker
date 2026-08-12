import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ProjectManager } from "./_components/project-manager";

export const metadata: Metadata = { title: "Projects · Project Tracker" };

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, status, created_at")
    .order("name");

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
      ) : <ProjectManager projects={data ?? []} />}
    </div>
  );
}
