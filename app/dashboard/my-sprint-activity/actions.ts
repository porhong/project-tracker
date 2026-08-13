"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

type AllocationInput = { activity_id: string; hours_per_day: number };
type TimeOffInput = { start_date: string; end_date: string };
type ActivityNoteInput = { activity: string; note: string | null };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parsePlan(formData: FormData):
  | {
      data: {
        allocations: AllocationInput[];
        timeOff: TimeOffInput[];
        notes: ActivityNoteInput[];
      };
    }
  | { error: string } {
  try {
    const allocationsRaw: unknown = JSON.parse(
      String(formData.get("allocations") ?? "[]"),
    );
    const timeOffRaw: unknown = JSON.parse(
      String(formData.get("time_off") ?? "[]"),
    );
    const notesRaw: unknown = JSON.parse(
      String(formData.get("activity_notes") ?? "[]"),
    );
    if (
      !Array.isArray(allocationsRaw) ||
      !Array.isArray(timeOffRaw) ||
      !Array.isArray(notesRaw)
    ) {
      return { error: "Invalid sprint activity." };
    }

    const allocations: AllocationInput[] = [];
    const activityIds = new Set<string>();
    for (const value of allocationsRaw) {
      if (!isRecord(value)) return { error: "Invalid activity allocation." };
      const activityId = String(value.activity_id ?? "");
      const hours = Number(value.hours_per_day);
      if (
        !UUID_PATTERN.test(activityId) ||
        !Number.isFinite(hours) ||
        hours < 0.25 ||
        hours > 24 ||
        Math.round(hours * 100) !== hours * 100
      ) {
        return {
          error:
            "Activity hours must be between 0.25 and 24, using at most two decimal places.",
        };
      }
      if (activityIds.has(activityId)) {
        return { error: "Each activity can only be allocated once." };
      }
      activityIds.add(activityId);
      allocations.push({ activity_id: activityId, hours_per_day: hours });
    }

    const timeOff: TimeOffInput[] = [];
    for (const value of timeOffRaw) {
      if (!isRecord(value)) return { error: "Invalid time-off record." };
      const startDate = String(value.start_date ?? "");
      const endDate = String(value.end_date ?? "");
      if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
        return { error: "Choose a valid time-off date range." };
      }
      timeOff.push({ start_date: startDate, end_date: endDate });
    }
    timeOff.sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (
      timeOff.some(
        (range, index) =>
          index > 0 && range.start_date <= timeOff[index - 1].end_date,
      )
    ) {
      return { error: "Time-off date ranges cannot overlap." };
    }

    const notes: ActivityNoteInput[] = [];
    for (const value of notesRaw) {
      if (!isRecord(value)) return { error: "Invalid activity note." };
      const activity = String(value.activity ?? "").trim();
      const note = String(value.note ?? "").trim();
      if (!activity || activity.length > 160 || note.length > 2_000) {
        return {
          error:
            "Activity notes need an activity name of at most 160 characters and details of at most 2,000 characters.",
        };
      }
      notes.push({ activity, note: note || null });
    }

    return { data: { allocations, timeOff, notes } };
  } catch {
    return { error: "Invalid sprint activity." };
  }
}

export async function saveMyActiveSprintPlan(
  _previousState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireProfile();
  if (user.role !== "user") {
    return fail("Only User accounts can manage sprint activity.");
  }

  const sprintId = String(formData.get("sprint_id") ?? "");
  if (!UUID_PATTERN.test(sprintId)) return fail("Invalid sprint.");
  const plan = parsePlan(formData);
  if ("error" in plan) return fail(plan.error);

  const supabase = await createClient();
  const [{ data: sprint, error: sprintError }, { data: activities, error: activitiesError }] =
    await Promise.all([
      supabase
        .from("sprints")
        .select("start_date, end_date, status")
        .eq("id", sprintId)
        .single(),
      plan.data.allocations.length
        ? supabase
            .from("activity_types")
            .select("id, is_active")
            .in(
              "id",
              plan.data.allocations.map((allocation) => allocation.activity_id),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (sprintError || !sprint || sprint.status !== "active") {
    return fail("Active sprint not found.");
  }
  if (activitiesError) return fail("Could not validate selected activities.");
  const activeActivityIds = new Set(
    (activities ?? [])
      .filter((activity) => activity.is_active)
      .map((activity) => activity.id),
  );
  if (
    plan.data.allocations.some(
      (allocation) => !activeActivityIds.has(allocation.activity_id),
    )
  ) {
    return fail("Choose active work activities.");
  }
  if (
    plan.data.timeOff.some(
      (timeOff) =>
        timeOff.start_date < sprint.start_date || timeOff.end_date > sprint.end_date,
    )
  ) {
    return fail("Time off must fall within the active sprint date range.");
  }

  const { error } = await supabase.rpc("replace_my_active_sprint_plan", {
    p_sprint_id: sprintId,
    p_allocations: plan.data.allocations,
    p_time_off: plan.data.timeOff,
    p_activity_notes: plan.data.notes,
  });
  if (error) return fail(error.message);

  revalidatePath("/dashboard/my-sprint-activity");
  return { ok: true };
}
