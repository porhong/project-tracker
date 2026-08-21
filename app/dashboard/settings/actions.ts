"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { mintMcpPersonalAccessToken } from "@/lib/mcp/token";
import { WEEKDAYS } from "@/lib/sprint-config";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type McpTokenRow = Pick<
  Tables<"mcp_access_tokens">,
  | "id"
  | "name"
  | "token_prefix"
  | "expires_at"
  | "revoked_at"
  | "last_used_at"
  | "created_at"
>;

export type CreateMcpTokenResult =
  | { ok: true; token: string; expiresAt: string; prefix: string }
  | { ok: false; error: string };

const weekdayValues = new Set<number>(WEEKDAYS.map((day) => day.value));

export async function updateWorkspaceSettings(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const workingDays = [...new Set(
    String(formData.get("working_days") ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && weekdayValues.has(value)),
  )].sort((a, b) => a - b);
  const dailyWorkHours = Number(formData.get("daily_work_hours"));
  if (!workingDays.length) return { ok: false, error: "Choose at least one working day." };
  if (!Number.isFinite(dailyWorkHours) || dailyWorkHours <= 0 || dailyWorkHours > 24) {
    return { ok: false, error: "Daily work hours must be greater than 0 and at most 24." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_settings")
    .upsert({ id: true, working_days: workingDays, daily_work_hours: dailyWorkHours }, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/sprints");
  return { ok: true };
}

function revalidateActivities() {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/sprints");
  revalidatePath("/dashboard/my-sprint-activity");
}

export async function createActivity(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) {
    return { ok: false, error: "Activity name is required and must be at most 80 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("activity_types").insert({ name });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("activity_types_name_key")
        ? "An activity with that name already exists."
        : error.message,
    };
  }
  revalidateActivities();
  return { ok: true };
}

export async function setActivityActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Missing activity." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("activity_types")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateActivities();
  return { ok: true };
}

export async function createMcpAccessToken(
  formData: FormData,
): Promise<CreateMcpTokenResult> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim() || "MCP token";
  if (name.length > 80) {
    return { ok: false, error: "Token name must be at most 80 characters." };
  }

  const minted = mintMcpPersonalAccessToken();
  const supabase = await createClient();
  const { error } = await supabase.from("mcp_access_tokens").insert({
    user_id: admin.id,
    name,
    token_prefix: minted.tokenPrefix,
    token_hash: minted.tokenHash,
    expires_at: minted.expiresAt.toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings");
  return {
    ok: true,
    token: minted.token,
    expiresAt: minted.expiresAt.toISOString(),
    prefix: minted.tokenPrefix,
  };
}

export async function revokeMcpAccessToken(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!id) return { ok: false, error: "Missing token." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcp_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", admin.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Token not found or already revoked." };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
