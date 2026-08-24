import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseReleaseNotes } from "@/lib/release-notes";
import { SPRINT_STATUSES } from "@/lib/sprint-config";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { ToolContext } from "../context";
import { fail, ok } from "../result";

// Mirrors the limits in app/dashboard/sprints/actions.ts.
const MAX_DESCRIPTION_LENGTH = 2_000;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use YYYY-MM-DD.");

const versionSchema = z
  .string()
  .trim()
  .regex(/^v\S.*$/, "Version must start with v.")
  .max(80, "Version must be at most 80 characters.");

const workingDaysSchema = z
  .array(
    z
      .number()
      .int()
      .min(1, "Working days use 1 (Monday) through 7 (Sunday).")
      .max(7, "Working days use 1 (Monday) through 7 (Sunday)."),
  )
  .min(1, "Choose at least one working day.")
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

const dailyWorkHoursSchema = z
  .number()
  .gt(0, "Daily work hours must be greater than 0 and at most 24.")
  .max(24, "Daily work hours must be greater than 0 and at most 24.");

const descriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_DESCRIPTION_LENGTH,
    `Description must be at most ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters.`,
  );

// Mirrors the limits in app/dashboard/sprints/actions.ts.
const ALLOWED_MILESTONE_STATUSES = ["upcoming", "in_progress", "completed", "delayed"] as const;
const ALLOWED_MILESTONE_ICONS = [
  "compass",
  "sparkles",
  "code",
  "shield",
  "rocket",
  "flag",
  "check",
  "users",
] as const;
const MAX_MILESTONE_TITLE_LENGTH = 120;
const MAX_MILESTONE_DESCRIPTION_LENGTH = 1_000;

function databaseError(message: string) {
  if (message.includes("sprints_project_number_key")) {
    return "This project already has that sprint number.";
  }
  if (message.includes("sprints_one_active_per_project_key")) {
    return "This project already has an active sprint.";
  }
  return message;
}

export function registerSprintTools(server: McpServer, ctx: ToolContext) {
  const { client } = ctx;

  async function activeProjectError(projectId: string) {
    const { data, error } = await client
      .from("projects")
      .select("status")
      .eq("id", projectId)
      .single();
    if (error || !data) return "Project not found.";
    return data.status === "active"
      ? null
      : "Archived projects cannot receive new sprints.";
  }

  server.registerTool(
    "list_sprints",
    {
      title: "List sprints",
      description:
        "List sprints, optionally filtered by project and/or status. Admin only.",
      inputSchema: {
        project_id: z.string().uuid().optional(),
        status: z.enum(SPRINT_STATUSES).optional(),
      },
    },
    async ({ project_id, status }) => {
      let query = client
        .from("sprints")
        .select(
          "id, project_id, sprint_number, version, description, start_date, end_date, working_days, daily_work_hours, planned_capacity_hours, status",
        )
        .order("created_at", { ascending: false });
      if (project_id) query = query.eq("project_id", project_id);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  server.registerTool(
    "get_sprint",
    {
      title: "Get sprint",
      description: "Get one sprint by id, including its project. Admin only.",
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const { data, error } = await client
        .from("sprints")
        .select(
          "id, project_id, sprint_number, version, description, start_date, end_date, working_days, daily_work_hours, planned_capacity_hours, status, release_notes, projects(name)",
        )
        .eq("id", id)
        .single();
      if (error || !data) return fail("Sprint not found.");
      return ok(data);
    },
  );

  server.registerTool(
    "create_sprint",
    {
      title: "Create sprint",
      description:
        "Create a draft sprint for an active project. working_days uses 1 (Monday) through 7 (Sunday); when working_days or daily_work_hours are omitted, the workspace defaults apply. planned_capacity_hours is computed by the database. Admin only.",
      inputSchema: {
        project_id: z.string().uuid(),
        sprint_number: z
          .number()
          .int()
          .positive("Sprint number must be a positive whole number."),
        version: versionSchema,
        description: descriptionSchema.optional(),
        start_date: dateSchema,
        end_date: dateSchema,
        working_days: workingDaysSchema.optional(),
        daily_work_hours: dailyWorkHoursSchema.optional(),
      },
    },
    async (input) => {
      if (input.end_date < input.start_date) {
        return fail("Choose a valid date range.");
      }
      const projectError = await activeProjectError(input.project_id);
      if (projectError) return fail(projectError);

      let workingDays = input.working_days;
      let dailyWorkHours = input.daily_work_hours;
      if (!workingDays || dailyWorkHours === undefined) {
        const { data: settings } = await client
          .from("workspace_settings")
          .select("working_days, daily_work_hours")
          .eq("id", true)
          .single();
        workingDays ??= settings?.working_days;
        dailyWorkHours ??= settings?.daily_work_hours;
      }
      if (!workingDays?.length || dailyWorkHours === undefined) {
        return fail(
          "Provide working_days and daily_work_hours; no workspace defaults are configured.",
        );
      }

      const { data, error } = await client
        .from("sprints")
        .insert({
          project_id: input.project_id,
          sprint_number: input.sprint_number,
          version: input.version,
          description: input.description || null,
          start_date: input.start_date,
          end_date: input.end_date,
          working_days: workingDays,
          daily_work_hours: dailyWorkHours,
        })
        .select()
        .single();
      if (error) return fail(databaseError(error.message));
      return ok(data);
    },
  );

  server.registerTool(
    "update_sprint",
    {
      title: "Update sprint",
      description:
        "Update a draft or active sprint's fields. Completed and archived sprints are read-only, and sprints cannot move between projects. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        sprint_number: z
          .number()
          .int()
          .positive("Sprint number must be a positive whole number.")
          .optional(),
        version: versionSchema.optional(),
        description: descriptionSchema.optional(),
        start_date: dateSchema.optional(),
        end_date: dateSchema.optional(),
        working_days: workingDaysSchema.optional(),
        daily_work_hours: dailyWorkHoursSchema.optional(),
      },
    },
    async ({ id, ...fields }) => {
      if (Object.values(fields).every((value) => value === undefined)) {
        return fail("Provide at least one field to update.");
      }
      const { data: current, error: readError } = await client
        .from("sprints")
        .select("status, start_date, end_date")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("Sprint not found.");
      if (current.status === "completed" || current.status === "archived") {
        return fail("Completed or archived sprints are read-only.");
      }

      const startDate = fields.start_date ?? current.start_date;
      const endDate = fields.end_date ?? current.end_date;
      if (endDate < startDate) return fail("Choose a valid date range.");

      const update: TablesUpdate<"sprints"> = {};
      if (fields.sprint_number !== undefined) {
        update.sprint_number = fields.sprint_number;
      }
      if (fields.version !== undefined) update.version = fields.version;
      if (fields.description !== undefined) {
        update.description = fields.description || null;
      }
      if (fields.start_date !== undefined) update.start_date = fields.start_date;
      if (fields.end_date !== undefined) update.end_date = fields.end_date;
      if (fields.working_days !== undefined) {
        update.working_days = fields.working_days;
      }
      if (fields.daily_work_hours !== undefined) {
        update.daily_work_hours = fields.daily_work_hours;
      }

      const { data, error } = await client
        .from("sprints")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail(databaseError(error.message));
      return ok(data);
    },
  );

  server.registerTool(
    "set_sprint_status",
    {
      title: "Set sprint status",
      description:
        "Move a sprint through its lifecycle: draft -> active -> completed. completed -> active (re-enable) and any -> archived require confirm: true. archived -> draft restores. A project can only have one active sprint. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        status: z.enum(SPRINT_STATUSES),
        confirm: z
          .literal(true)
          .describe(
            "Required to re-enable a completed sprint or archive a sprint.",
          )
          .optional(),
      },
    },
    async ({ id, status, confirm }) => {
      const { data: current, error: readError } = await client
        .from("sprints")
        .select("status, project_id")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("Sprint not found.");

      if (status === "archived") {
        if (current.status === "archived") {
          return fail("Sprint is already archived.");
        }
        if (confirm !== true) {
          return fail(
            "Archiving hides the sprint from planning. Pass confirm: true to archive it.",
          );
        }
      } else if (current.status === "draft" && status !== "active") {
        return fail("Draft sprints can only be activated.");
      } else if (current.status === "active" && status !== "completed") {
        return fail("Active sprints can only be completed.");
      } else if (current.status === "completed") {
        if (status !== "active") {
          return fail(
            "Completed sprints can only be re-enabled (status: active) or archived.",
          );
        }
        if (confirm !== true) {
          return fail(
            "Re-enabling a completed sprint reopens planning. Pass confirm: true to re-enable it.",
          );
        }
      } else if (current.status === "archived" && status !== "draft") {
        return fail("Archived sprints can only be restored to draft.");
      }

      if (status === "active") {
        const projectError = await activeProjectError(current.project_id);
        if (projectError) return fail(projectError);
      }

      const { data, error } = await client
        .from("sprints")
        .update({ status })
        .eq("id", id)
        .select("id, status")
        .single();
      if (error) return fail(databaseError(error.message));
      return ok(data);
    },
  );

  server.registerTool(
    "delete_sprint",
    {
      title: "Delete sprint",
      description:
        "Permanently delete a sprint and its member plans. Requires confirm: true. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm permanent deletion."),
      },
    },
    async ({ id }) => {
      const { data: current, error: readError } = await client
        .from("sprints")
        .select("id, version, status")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("Sprint not found.");
      // sprint_member_* and sprint_milestones rows cascade with the sprint.
      const { error } = await client.from("sprints").delete().eq("id", id);
      if (error) return fail(error.message);
      return ok({ deleted: current });
    },
  );

  server.registerTool(
    "set_sprint_release_notes",
    {
      title: "Set sprint release notes",
      description:
        "Update a sprint's release notes as a Tiptap JSON document. Completed and archived sprints are read-only. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        release_notes: z
          .any()
          .describe("Tiptap JSON document object."),
      },
    },
    async ({ id, release_notes }) => {
      const { data: current, error: readError } = await client
        .from("sprints")
        .select("status")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("Sprint not found.");
      if (current.status === "completed" || current.status === "archived") {
        return fail("Completed or archived sprint release notes are read-only.");
      }

      const parsed = parseReleaseNotes(JSON.stringify(release_notes));
      if ("error" in parsed) return fail(parsed.error);

      const { data, error } = await client
        .from("sprints")
        .update({ release_notes: parsed.data })
        .eq("id", id)
        .select("id, release_notes")
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "get_sprint_milestones",
    {
      title: "Get sprint milestones",
      description: "Get a sprint's delivery milestones in order. Admin only.",
      inputSchema: {
        sprint_id: z.string().uuid(),
      },
    },
    async ({ sprint_id }) => {
      const { data, error } = await client
        .from("sprint_milestones")
        .select(
          "id, sprint_id, title, description, target_date, status, icon, order_index, created_at, updated_at",
        )
        .eq("sprint_id", sprint_id)
        .order("order_index");
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  server.registerTool(
    "set_sprint_milestones",
    {
      title: "Set sprint milestones",
      description:
        "Replace a sprint's delivery milestones. Pass an empty array to clear them. The sprint must be draft or active. Admin only.",
      inputSchema: {
        sprint_id: z.string().uuid(),
        milestones: z.array(
          z.object({
            title: z
              .string()
              .trim()
              .min(1)
              .max(MAX_MILESTONE_TITLE_LENGTH),
            description: z
              .string()
              .trim()
              .max(MAX_MILESTONE_DESCRIPTION_LENGTH)
              .optional(),
            target_date: dateSchema,
            status: z.enum(ALLOWED_MILESTONE_STATUSES),
            icon: z.enum(ALLOWED_MILESTONE_ICONS),
          }),
        ),
      },
    },
    async ({ sprint_id, milestones }) => {
      const { data: sprint, error: readError } = await client
        .from("sprints")
        .select("status")
        .eq("id", sprint_id)
        .single();
      if (readError || !sprint) return fail("Sprint not found.");
      if (sprint.status === "completed" || sprint.status === "archived") {
        return fail("Completed or archived sprint milestones are read-only.");
      }

      const { error: deleteError } = await client
        .from("sprint_milestones")
        .delete()
        .eq("sprint_id", sprint_id);
      if (deleteError) return fail(deleteError.message);

      if (milestones.length > 0) {
        const rows = milestones.map((milestone, index) => ({
          sprint_id,
          title: milestone.title,
          description: milestone.description || null,
          target_date: milestone.target_date,
          status: milestone.status,
          icon: milestone.icon,
          order_index: index,
        }));
        const { error: insertError } = await client
          .from("sprint_milestones")
          .insert(rows);
        if (insertError) return fail(insertError.message);
      }

      return ok({ sprint_id, milestones: milestones.length });
    },
  );
}
