import type { Metadata } from "next";
import { headers } from "next/headers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ActivityManager } from "./_components/activity-manager";
import { McpAccessCard } from "./_components/mcp-access-card";
import { SettingsTabs } from "./_components/settings-tabs";
import { WorkspaceScheduleForm } from "./_components/workspace-schedule-form";

export const metadata: Metadata = { title: "Settings · Project Tracker" };

async function resolveAppOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return "/api/mcp";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/mcp`;
}

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const endpointUrl = await resolveAppOrigin();
  const [
    { data: settings, error: settingsError },
    { data: activities, error: activitiesError },
    { data: mcpTokens, error: mcpTokensError },
  ] = await Promise.all([
    supabase
      .from("workspace_settings")
      .select("working_days, daily_work_hours")
      .eq("id", true)
      .single(),
    supabase.from("activity_types").select("id, name, is_active").order("name"),
    supabase
      .from("mcp_access_tokens")
      .select(
        "id, name, token_prefix, expires_at, revoked_at, last_used_at, created_at",
      )
      .eq("user_id", admin.id)
      .order("created_at", { ascending: false }),
  ]);
  const error = settingsError ?? activitiesError;

  const workspaceError = error ? (
    <Alert variant="destructive">
      <AlertDescription>
        Could not load workspace settings: {error.message}
      </AlertDescription>
    </Alert>
  ) : null;

  const mcpPanel = mcpTokensError ? (
    <Alert variant="destructive">
      <AlertDescription>
        Could not load MCP tokens: {mcpTokensError.message}
      </AlertDescription>
    </Alert>
  ) : (
    <McpAccessCard endpointUrl={endpointUrl} tokens={mcpTokens ?? []} />
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure calendar defaults, reusable work activities, and MCP access for
          AI agents.
        </p>
      </header>

      <SettingsTabs
        calendar={
          workspaceError ?? (
            <WorkspaceScheduleForm
              settings={
                settings ?? { working_days: [1, 2, 3, 4, 5], daily_work_hours: 8 }
              }
            />
          )
        }
        activities={
          workspaceError ?? <ActivityManager activities={activities ?? []} />
        }
        mcp={mcpPanel}
      />
    </div>
  );
}
