import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  countAvailableSprintDays,
  memberAvailableHours,
} from "@/lib/sprint-capacity";
import type { ToolContext } from "../context";
import { fail, ok } from "../result";

// Mirrors the limits in app/dashboard/settings/actions.ts.
const MAX_ACTIVITY_NAME_LENGTH = 80;

// Mirrors the limits in app/dashboard/sprints/actions.ts.
const MAX_ACTIVITY_NAME_LENGTH_NOTE = 160;
const MAX_NOTE_LENGTH = 2_000;
const MIN_ALLOCATION_HOURS = 0.25;
const MAX_ALLOCATION_HOURS = 100_000;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use YYYY-MM-DD.");

const activityNameSchema = z
  .string()
  .trim()
  .min(1, "Activity name is required.")
  .max(
    MAX_ACTIVITY_NAME_LENGTH,
    `Activity name must be at most ${MAX_ACTIVITY_NAME_LENGTH} characters.`,
  );

function databaseError(message: string) {
  if (message.includes("activity_types_name_key")) {
    return "An activity with that name already exists.";
  }
  return message;
}

type AllocationInput = { user_id: string; activity_id: string; hours: number };
type TimeOffInput = { user_id: string; start_date: string; end_date: string };
type TimeOffRange = { start_date: string; end_date: string };
type ActivityNoteInput = {
  user_id: string;
  activity: string;
  note: string | null;
};

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function validatePlanInput(input: {
  allocations: AllocationInput[];
  time_off: TimeOffInput[];
  activity_notes: ActivityNoteInput[];
}): { data: typeof input } | { error: string } {
  const allocationKeys = new Set<string>();
  for (const allocation of input.allocations) {
    if (
      !allocation.user_id ||
      !allocation.activity_id ||
      !Number.isFinite(allocation.hours) ||
      allocation.hours < MIN_ALLOCATION_HOURS ||
      allocation.hours > MAX_ALLOCATION_HOURS ||
      roundToTwoDecimals(allocation.hours) !== allocation.hours
    ) {
      return {
        error: `Activity hours must be between ${MIN_ALLOCATION_HOURS} and ${MAX_ALLOCATION_HOURS.toLocaleString()}, using at most two decimal places.`,
      };
    }
    const key = `${allocation.user_id}:${allocation.activity_id}`;
    if (allocationKeys.has(key)) {
      return { error: "Each activity can only be allocated once per member." };
    }
    allocationKeys.add(key);
  }

  const rangesByUser = new Map<string, TimeOffInput[]>();
  for (const record of input.time_off) {
    if (!record.user_id || record.end_date < record.start_date) {
      return { error: "Choose a valid time-off date range." };
    }
    const list = rangesByUser.get(record.user_id) ?? [];
    list.push(record);
    rangesByUser.set(record.user_id, list);
  }
  for (const ranges of rangesByUser.values()) {
    ranges.sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (
      ranges.some(
        (range, index) =>
          index > 0 && range.start_date <= ranges[index - 1].end_date,
      )
    ) {
      return { error: "Time-off ranges for the same member cannot overlap." };
    }
  }

  for (const note of input.activity_notes) {
    if (
      !note.user_id ||
      !note.activity ||
      note.activity.length > MAX_ACTIVITY_NAME_LENGTH_NOTE ||
      (note.note !== null && note.note.length > MAX_NOTE_LENGTH)
    ) {
      return {
        error: `Activity notes need an activity name of at most ${MAX_ACTIVITY_NAME_LENGTH_NOTE} characters and details of at most ${MAX_NOTE_LENGTH.toLocaleString()} characters.`,
      };
    }
  }

  return { data: input };
}

async function loadEditableSprint(
  client: ToolContext["client"],
  sprintId: string,
): Promise<{ error: string } | { data: TablesUpdate<"sprints"> & { id: string; project_id: string; start_date: string; end_date: string; status: string } }> {
  const { data, error } = await client
    .from("sprints")
    .select(
      "id, project_id, sprint_number, version, description, start_date, end_date, working_days, daily_work_hours, status",
    )
    .eq("id", sprintId)
    .single();
  if (error || !data) return { error: "Sprint not found." };
  if (data.status === "completed" || data.status === "archived") {
    return { error: "Completed or archived sprint plans are read-only." };
  }
  return { data };
}

async function validatePlanReferences(
  client: ToolContext["client"],
  sprint: { project_id: string; start_date: string; end_date: string },
  plan: { allocations: AllocationInput[]; time_off: TimeOffInput[]; activity_notes: ActivityNoteInput[] },
) {
  const userIds = [
    ...new Set(
      [...plan.allocations, ...plan.time_off, ...plan.activity_notes].map(
        (record) => record.user_id,
      ),
    ),
  ];
  const activityIds = [
    ...new Set(plan.allocations.map((record) => record.activity_id)),
  ];

  const [{ data: members, error: membersError }, { data: activities, error: activitiesError }] =
    await Promise.all([
      client.from("project_members").select("user_id").eq("project_id", sprint.project_id),
      activityIds.length
        ? client
            .from("activity_types")
            .select("id, is_active")
            .in("id", activityIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (membersError || activitiesError) return "Could not validate the sprint plan.";

  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = memberIds.length
    ? await client.from("profiles").select("id, status").in("id", memberIds)
    : { data: [], error: null };
  if (profilesError) return "Could not validate the sprint plan.";

  const validUsers = new Set((members ?? []).map((member) => member.user_id));
  const activeUsers = new Set(
    (profiles ?? [])
      .filter((profile) => profile.status === "active")
      .map((profile) => profile.id),
  );
  if (userIds.some((id) => !validUsers.has(id) || !activeUsers.has(id))) {
    return "Every planned member must be an active member of this project.";
  }

  const activeActivities = new Set(
    (activities ?? [])
      .filter((activity) => activity.is_active)
      .map((activity) => activity.id),
  );
  if (activityIds.some((id) => !activeActivities.has(id))) {
    return "Choose active work activities.";
  }

  if (
    plan.time_off.some(
      (record) =>
        record.start_date < sprint.start_date || record.end_date > sprint.end_date,
    )
  ) {
    return "Time off must fall within the sprint date range.";
  }

  return null;
}

export function registerCapacityTools(server: McpServer, ctx: ToolContext) {
  const { client } = ctx;

  server.registerTool(
    "list_activity_types",
    {
      title: "List activity types",
      description: "List all work activity types used in sprint capacity plans. Admin only.",
      inputSchema: {},
    },
    async () => {
      const { data, error } = await client
        .from("activity_types")
        .select("id, name, is_active, created_at, updated_at")
        .order("name");
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  server.registerTool(
    "create_activity_type",
    {
      title: "Create activity type",
      description: "Create a new work activity type for sprint capacity plans. Admin only.",
      inputSchema: {
        name: activityNameSchema,
      },
    },
    async ({ name }) => {
      const { data, error } = await client
        .from("activity_types")
        .insert({ name })
        .select()
        .single();
      if (error) return fail(databaseError(error.message));
      return ok(data);
    },
  );

  server.registerTool(
    "set_activity_type_active",
    {
      title: "Set activity type active",
      description:
        "Activate or deactivate a work activity type. Inactive activities cannot be selected in new plans but remain visible in historical plans. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        is_active: z.boolean(),
      },
    },
    async ({ id, is_active }) => {
      const { data: current, error: readError } = await client
        .from("activity_types")
        .select("id")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("Activity type not found.");

      const { data, error } = await client
        .from("activity_types")
        .update({ is_active })
        .eq("id", id)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "get_sprint_capacity",
    {
      title: "Get sprint capacity",
      description:
        "Get the full member capacity plan for a sprint, including allocations, time off, activity notes, and computed available hours per member. Admin only.",
      inputSchema: {
        sprint_id: z.string().uuid(),
      },
    },
    async ({ sprint_id }) => {
      const { data: sprint, error: sprintError } = await client
        .from("sprints")
        .select(
          "id, project_id, sprint_number, version, description, start_date, end_date, working_days, daily_work_hours, status",
        )
        .eq("id", sprint_id)
        .single();
      if (sprintError || !sprint) return fail("Sprint not found.");

      const [
        { data: projectMembers },
        { data: allocations },
        { data: timeOff },
        { data: activityNotes },
      ] = await Promise.all([
        client
          .from("project_members")
          .select("user_id, profiles(id, email, full_name, competency, status)")
          .eq("project_id", sprint.project_id),
        client
          .from("sprint_member_allocations")
          .select("id, user_id, activity_id, hours")
          .eq("sprint_id", sprint_id),
        client
          .from("sprint_member_time_off")
          .select("id, user_id, start_date, end_date")
          .eq("sprint_id", sprint_id),
        client
          .from("sprint_member_activity_notes")
          .select("id, user_id, activity, note")
          .eq("sprint_id", sprint_id),
      ]);

      const memberMap = new Map(
        (projectMembers ?? []).map((member) => [
          member.user_id,
          {
            user_id: member.user_id,
            email: member.profiles?.email ?? null,
            full_name: member.profiles?.full_name ?? null,
            competency: member.profiles?.competency ?? null,
            status: member.profiles?.status ?? null,
          },
        ]),
      );

      const timeOffByUser = new Map<string, TimeOffRange[]>();
      for (const record of timeOff ?? []) {
        const list = timeOffByUser.get(record.user_id) ?? [];
        list.push({
          start_date: record.start_date,
          end_date: record.end_date,
        });
        timeOffByUser.set(record.user_id, list);
      }

      const allocationsByUser = new Map<string, number>();
      for (const allocation of allocations ?? []) {
        allocationsByUser.set(
          allocation.user_id,
          (allocationsByUser.get(allocation.user_id) ?? 0) + allocation.hours,
        );
      }

      const memberSummaries = Array.from(memberMap.values()).map((member) => {
        const memberTimeOff = timeOffByUser.get(member.user_id) ?? [];
        const availableDays = countAvailableSprintDays(sprint, memberTimeOff);
        const availableHours = memberAvailableHours(sprint, memberTimeOff);
        const allocatedHours = allocationsByUser.get(member.user_id) ?? 0;
        return {
          ...member,
          available_days: availableDays,
          available_hours: availableHours,
          allocated_hours: allocatedHours,
          remaining_hours: roundToTwoDecimals(availableHours - allocatedHours),
        };
      });

      return ok({
        sprint: {
          id: sprint.id,
          project_id: sprint.project_id,
          sprint_number: sprint.sprint_number,
          version: sprint.version,
          description: sprint.description,
          start_date: sprint.start_date,
          end_date: sprint.end_date,
          working_days: sprint.working_days,
          daily_work_hours: sprint.daily_work_hours,
          status: sprint.status,
        },
        members: memberSummaries,
        allocations: allocations ?? [],
        time_off: timeOff ?? [],
        activity_notes: activityNotes ?? [],
      });
    },
  );

  server.registerTool(
    "set_sprint_capacity",
    {
      title: "Set sprint capacity",
      description:
        "Replace the entire member capacity plan for a sprint: activity allocations, time-off ranges, and activity notes. The sprint must be draft or active. Admin only.",
      inputSchema: {
        sprint_id: z.string().uuid(),
        allocations: z.array(
          z.object({
            user_id: z.string().uuid(),
            activity_id: z.string().uuid(),
            hours: z.number(),
          }),
        ),
        time_off: z.array(
          z.object({
            user_id: z.string().uuid(),
            start_date: dateSchema,
            end_date: dateSchema,
          }),
        ),
        activity_notes: z.array(
          z.object({
            user_id: z.string().uuid(),
            activity: z.string().trim().min(1),
            note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
          }),
        ),
      },
    },
    async ({ sprint_id, allocations, time_off, activity_notes }) => {
      const editable = await loadEditableSprint(client, sprint_id);
      if ("error" in editable) return fail(editable.error);

      const normalizedNotes: ActivityNoteInput[] = activity_notes.map((note) => ({
        user_id: note.user_id,
        activity: note.activity,
        note: note.note ?? null,
      }));

      const plan = validatePlanInput({
        allocations,
        time_off,
        activity_notes: normalizedNotes,
      });
      if ("error" in plan) return fail(plan.error);

      const referenceError = await validatePlanReferences(
        client,
        editable.data,
        plan.data,
      );
      if (referenceError) return fail(referenceError);

      // The dashboard action uses the authenticated replace_sprint_member_plan
      // RPC, which reads auth.uid(). The MCP service-role client has no user
      // JWT, so we perform the same atomic replacement directly.
      const sprintId = sprint_id;
      const [{ error: deleteAllocationsError }, { error: deleteTimeOffError }, { error: deleteNotesError }] =
        await Promise.all([
          client.from("sprint_member_allocations").delete().eq("sprint_id", sprintId),
          client.from("sprint_member_time_off").delete().eq("sprint_id", sprintId),
          client.from("sprint_member_activity_notes").delete().eq("sprint_id", sprintId),
        ]);
      if (deleteAllocationsError) return fail(deleteAllocationsError.message);
      if (deleteTimeOffError) return fail(deleteTimeOffError.message);
      if (deleteNotesError) return fail(deleteNotesError.message);

      const insertErrors: (string | null)[] = [];
      if (allocations.length > 0) {
        const { error } = await client
          .from("sprint_member_allocations")
          .insert(
            allocations.map((allocation) => ({
              sprint_id: sprintId,
              user_id: allocation.user_id,
              activity_id: allocation.activity_id,
              hours: allocation.hours,
            })),
          );
        insertErrors.push(error?.message ?? null);
      }
      if (time_off.length > 0) {
        const { error } = await client
          .from("sprint_member_time_off")
          .insert(
            time_off.map((record) => ({
              sprint_id: sprintId,
              user_id: record.user_id,
              start_date: record.start_date,
              end_date: record.end_date,
            })),
          );
        insertErrors.push(error?.message ?? null);
      }
      if (normalizedNotes.length > 0) {
        const { error } = await client
          .from("sprint_member_activity_notes")
          .insert(
            normalizedNotes.map((note) => ({
              sprint_id: sprintId,
              user_id: note.user_id,
              activity: note.activity,
              note: note.note,
            })),
          );
        insertErrors.push(error?.message ?? null);
      }
      const firstError = insertErrors.find(Boolean);
      if (firstError) return fail(firstError);

      return ok({ sprint_id, allocations, time_off, activity_notes: normalizedNotes });
    },
  );
}
