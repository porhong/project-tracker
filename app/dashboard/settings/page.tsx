import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceScheduleForm } from "./_components/workspace-schedule-form";

export const metadata: Metadata = { title: "Settings · Project Tracker" };

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("working_days, daily_work_hours")
    .eq("id", true)
    .single();
  return <div className="space-y-6"><header className="space-y-1"><h1 className="text-2xl font-semibold">Settings</h1><p className="text-sm text-muted-foreground">Configure the calendar defaults used when creating new sprints.</p></header>{error ? <Alert variant="destructive"><AlertDescription>Could not load workspace settings: {error.message}</AlertDescription></Alert> : <WorkspaceScheduleForm settings={data ?? { working_days: [1, 2, 3, 4, 5], daily_work_hours: 8 }} />}</div>;
}
