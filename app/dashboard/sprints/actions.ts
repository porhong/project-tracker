"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { parseReleaseNotes } from "@/lib/release-notes";
import { memberAvailableHours } from "@/lib/sprint-capacity";
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

export async function updateSprintReleaseNotes(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing sprint.");
  const releaseNotes = parseReleaseNotes(formData.get("release_notes"));
  if ("error" in releaseNotes) return fail(releaseNotes.error);

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("sprints").select("status").eq("id", id).single();
  if (readError || !current) return fail("Sprint not found.");
  if (current.status === "completed") return fail("Completed sprint release notes are read-only.");

  const { error } = await supabase.from("sprints").update({ release_notes: releaseNotes.data }).eq("id", id);
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

type AllocationInput = { user_id: string; activity_id: string; hours: number };
type TimeOffInput = { user_id: string; start_date: string; end_date: string };
type ActivityNoteInput = { user_id: string; activity: string; note: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePlanInput(formData: FormData): { data: { allocations: AllocationInput[]; timeOff: TimeOffInput[]; notes: ActivityNoteInput[] } } | { error: string } {
  try {
    const allocationsRaw: unknown = JSON.parse(String(formData.get("allocations") ?? "[]"));
    const timeOffRaw: unknown = JSON.parse(String(formData.get("time_off") ?? "[]"));
    const notesRaw: unknown = JSON.parse(String(formData.get("activity_notes") ?? "[]"));
    if (!Array.isArray(allocationsRaw) || !Array.isArray(timeOffRaw) || !Array.isArray(notesRaw)) return { error: "Invalid sprint capacity plan." };

    const allocations: AllocationInput[] = [];
    const allocationKeys = new Set<string>();
    for (const value of allocationsRaw) {
      if (!isRecord(value)) return { error: "Invalid activity allocation." };
      const userId = String(value.user_id ?? "");
      const activityId = String(value.activity_id ?? "");
      const hours = Number(value.hours);
      if (!userId || !activityId || !Number.isFinite(hours) || hours < 0.25 || hours > 100_000 || Math.round(hours * 100) !== hours * 100) {
        return { error: "Activity hours must be between 0.25 and 100,000, using at most two decimal places." };
      }
      const key = `${userId}:${activityId}`;
      if (allocationKeys.has(key)) return { error: "Each activity can only be allocated once per member." };
      allocationKeys.add(key);
      allocations.push({ user_id: userId, activity_id: activityId, hours });
    }

    const timeOff: TimeOffInput[] = [];
    const rangesByUser = new Map<string, TimeOffInput[]>();
    for (const value of timeOffRaw) {
      if (!isRecord(value)) return { error: "Invalid time-off record." };
      const userId = String(value.user_id ?? "");
      const startDate = String(value.start_date ?? "");
      const endDate = String(value.end_date ?? "");
      if (!userId || !isDate(startDate) || !isDate(endDate) || endDate < startDate) return { error: "Choose a valid time-off date range." };
      const record = { user_id: userId, start_date: startDate, end_date: endDate };
      timeOff.push(record);
      rangesByUser.set(userId, [...(rangesByUser.get(userId) ?? []), record]);
    }
    for (const ranges of rangesByUser.values()) {
      ranges.sort((a, b) => a.start_date.localeCompare(b.start_date));
      if (ranges.some((range, index) => index > 0 && range.start_date <= ranges[index - 1].end_date)) {
        return { error: "Time-off ranges for the same member cannot overlap." };
      }
    }
    const notes: ActivityNoteInput[] = [];
    for (const value of notesRaw) {
      if (!isRecord(value)) return { error: "Invalid activity note." };
      const userId = String(value.user_id ?? "");
      const activity = String(value.activity ?? "").trim();
      const rawNote = String(value.note ?? "").trim();
      if (!userId || !activity || activity.length > 160 || rawNote.length > 2_000) {
        return { error: "Activity notes need an activity name of at most 160 characters and details of at most 2,000 characters." };
      }
      notes.push({ user_id: userId, activity, note: rawNote || null });
    }
    return { data: { allocations, timeOff, notes } };
  } catch {
    return { error: "Invalid sprint capacity plan." };
  }
}

async function loadEditableSprint(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sprints")
    .select("id, project_id, status, start_date, end_date, working_days, daily_work_hours")
    .eq("id", id)
    .single();
  if (error || !data) return { error: "Sprint not found." } as const;
  if (data.status === "completed") return { error: "Completed sprint plans are read-only." } as const;
  return { data, supabase } as const;
}

async function validatePlanReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sprint: { project_id: string; start_date: string; end_date: string; working_days: number[]; daily_work_hours: number },
  plan: { allocations: AllocationInput[]; timeOff: TimeOffInput[]; notes: ActivityNoteInput[] },
) {
  const userIds = [...new Set([...plan.allocations, ...plan.timeOff, ...plan.notes].map((record) => record.user_id))];
  const activityIds = [...new Set(plan.allocations.map((record) => record.activity_id))];
  const [{ data: members, error: membersError }, { data: activities, error: activitiesError }] = await Promise.all([
    supabase.from("project_members").select("user_id").eq("project_id", sprint.project_id),
    activityIds.length ? supabase.from("activity_types").select("id, is_active").in("id", activityIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (membersError || activitiesError) return "Could not validate the sprint plan.";
  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await supabase.from("profiles").select("id, status").in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) return "Could not validate the sprint plan.";
  const validUsers = new Set((members ?? []).map((member) => member.user_id));
  const activeUsers = new Set((profiles ?? []).filter((profile) => profile.status === "active").map((profile) => profile.id));
  if (userIds.some((id) => !validUsers.has(id) || !activeUsers.has(id))) return "Every planned member must be an active member of this project.";
  const activeActivities = new Set((activities ?? []).filter((activity) => activity.is_active).map((activity) => activity.id));
  if (activityIds.some((id) => !activeActivities.has(id))) return "Choose active work activities.";
  if (plan.timeOff.some((record) => record.start_date < sprint.start_date || record.end_date > sprint.end_date)) return "Time off must fall within the sprint date range.";
  const activeMemberIds = [...validUsers].filter((id) => activeUsers.has(id));
  for (const memberId of activeMemberIds) {
    const memberTimeOff = plan.timeOff.filter((record) => record.user_id === memberId);
    const allocatedHours = plan.allocations
      .filter((record) => record.user_id === memberId)
      .reduce((total, record) => total + record.hours, 0);
    const availableHours = memberAvailableHours(sprint, memberTimeOff);
    if (Math.round(allocatedHours * 100) !== Math.round(availableHours * 100)) {
      return `Allocated hours (${allocatedHours}) must exactly match available hours (${availableHours}) for every active project member.`;
    }
  }
  return null;
}

export async function saveSprintMemberPlan(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing sprint.");
  const plan = parsePlanInput(formData);
  if ("error" in plan) return fail(plan.error);
  const editable = await loadEditableSprint(id);
  if ("error" in editable) return fail(editable.error ?? "Sprint not found.");
  const referenceError = await validatePlanReferences(editable.supabase, editable.data, plan.data);
  if (referenceError) return fail(referenceError);

  const { error } = await editable.supabase.rpc("replace_sprint_member_plan", {
    p_sprint_id: id,
    p_allocations: plan.data.allocations,
    p_time_off: plan.data.timeOff,
    p_activity_notes: plan.data.notes,
  });
  if (error) return fail(error.message);
  revalidate();
  revalidatePath("/dashboard/my-sprint-activity");
  return { ok: true };
}
