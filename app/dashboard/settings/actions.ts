"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { WEEKDAYS } from "@/lib/sprint-config";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
