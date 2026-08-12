"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { isSprintStatus, type SprintStatus, WEEKDAYS } from "@/lib/sprint-config";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const weekdayValues = new Set<number>(WEEKDAYS.map((day) => day.value));

function fail(error: string): ActionResult { return { ok: false, error }; }
function revalidate() { revalidatePath("/dashboard/sprints"); revalidatePath("/dashboard/projects"); }

function parseWorkingDays(value: FormDataEntryValue | null) {
  const days = String(value ?? "")
    .split(",")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && weekdayValues.has(day));
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
  return uniqueDays.length === days.length ? uniqueDays : null;
}

function sprintInput(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const sprintNumber = Number(formData.get("sprint_number"));
  const version = String(formData.get("version") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const workingDays = parseWorkingDays(formData.get("working_days"));
  const dailyWorkHours = Number(formData.get("daily_work_hours"));

  if (!projectId) return { error: "Select a project." } as const;
  if (!Number.isInteger(sprintNumber) || sprintNumber <= 0) return { error: "Sprint number must be a positive whole number." } as const;
  if (!version || version.length > 80) return { error: "Version is required and must be at most 80 characters." } as const;
  if (!name || name.length > 160) return { error: "Sprint name is required and must be at most 160 characters." } as const;
  if (description.length > 2_000) return { error: "Description must be at most 2,000 characters." } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) return { error: "Choose a valid date range." } as const;
  if (!workingDays?.length) return { error: "Choose at least one working day." } as const;
  if (!Number.isFinite(dailyWorkHours) || dailyWorkHours <= 0 || dailyWorkHours > 24) return { error: "Daily work hours must be greater than 0 and at most 24." } as const;

  return { data: { project_id: projectId, sprint_number: sprintNumber, version, name, description: description || null, start_date: startDate, end_date: endDate, working_days: workingDays, daily_work_hours: dailyWorkHours } } as const;
}

function databaseError(message: string): ActionResult {
  if (message.includes("sprints_project_number_key")) return fail("This project already has that sprint number.");
  if (message.includes("sprints_one_active_per_project_key")) return fail("This project already has an active sprint.");
  return fail(message);
}

async function assertActiveProject(projectId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("status").eq("id", projectId).single();
  if (error || !data) return "Project not found.";
  return data.status === "active" ? null : "Archived projects cannot receive new sprints.";
}

export async function createSprint(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const input = sprintInput(formData); if ("error" in input && input.error) return fail(input.error);
  const projectError = await assertActiveProject(input.data.project_id); if (projectError) return fail(projectError);
  const supabase = await createClient();
  const { error } = await supabase.from("sprints").insert(input.data);
  if (error) return databaseError(error.message);
  revalidate(); return { ok: true };
}

export async function updateSprint(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? ""); if (!id) return fail("Missing sprint.");
  const input = sprintInput(formData); if ("error" in input && input.error) return fail(input.error);
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("sprints").select("project_id, status").eq("id", id).single();
  if (readError || !current) return fail("Sprint not found.");
  if (current.status === "completed") return fail("Completed sprints are read-only.");
  if (current.status !== "draft" && current.project_id !== input.data.project_id) return fail("Only draft sprints can move between projects.");
  if (current.project_id !== input.data.project_id) { const projectError = await assertActiveProject(input.data.project_id); if (projectError) return fail(projectError); }
  const { error } = await supabase.from("sprints").update(input.data).eq("id", id);
  if (error) return databaseError(error.message);
  revalidate(); return { ok: true };
}

export async function setSprintStatus(id: string, status: SprintStatus): Promise<ActionResult> {
  await requireAdmin();
  if (!id || !isSprintStatus(status)) return fail("Invalid sprint status.");
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("sprints").select("status, project_id").eq("id", id).single();
  if (readError || !current) return fail("Sprint not found.");
  if (current.status === "draft" && status !== "active") return fail("Draft sprints can only be activated.");
  if (current.status === "active" && status !== "completed") return fail("Active sprints can only be completed.");
  if (current.status === "completed") return fail("Completed sprints cannot change status.");
  if (status === "active") { const projectError = await assertActiveProject(current.project_id); if (projectError) return fail(projectError); }
  const { error } = await supabase.from("sprints").update({ status }).eq("id", id);
  if (error) return databaseError(error.message);
  revalidate(); return { ok: true };
}

export async function deleteSprint(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return fail("Missing sprint.");
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("sprints").select("status").eq("id", id).single();
  if (readError || !current) return fail("Sprint not found.");
  if (current.status !== "draft") return fail("Only draft sprints can be deleted.");
  const { error } = await supabase.from("sprints").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidate(); return { ok: true };
}
