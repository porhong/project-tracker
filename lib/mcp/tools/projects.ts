import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { ToolContext } from "../context";
import { fail, ok } from "../result";

// Mirrors the limits in app/dashboard/projects/actions.ts.
const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2_000;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Project name is required.")
  .max(
    MAX_NAME_LENGTH,
    `Project name must be at most ${MAX_NAME_LENGTH} characters.`,
  );

const descriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_DESCRIPTION_LENGTH,
    `Description must be at most ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters.`,
  );

function databaseError(message: string) {
  if (message.includes("projects_name_key")) {
    return "A project with that name already exists.";
  }
  return message;
}

export function registerProjectTools(server: McpServer, ctx: ToolContext) {
  const { client } = ctx;

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List all projects with their status and members. Admin only.",
      inputSchema: {},
    },
    async () => {
      const [{ data: projects, error }, { data: members, error: memberError }] =
        await Promise.all([
          client.from("projects").select("*").order("created_at"),
          client
            .from("project_members")
            .select("project_id, user_id, profiles(full_name, email)"),
        ]);
      if (error) return fail(error.message);
      if (memberError) return fail(memberError.message);

      const membersByProject = new Map<string, unknown[]>();
      for (const member of members ?? []) {
        const list = membersByProject.get(member.project_id) ?? [];
        list.push({
          user_id: member.user_id,
          full_name: member.profiles?.full_name ?? null,
          email: member.profiles?.email ?? null,
        });
        membersByProject.set(member.project_id, list);
      }

      return ok(
        (projects ?? []).map((project) => ({
          ...project,
          members: membersByProject.get(project.id) ?? [],
        })),
      );
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Get one project by id, including its members and sprints. Admin only.",
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const [{ data: project, error }, { data: members }, { data: sprints }] =
        await Promise.all([
          client.from("projects").select("*").eq("id", id).single(),
          client
            .from("project_members")
            .select("user_id, profiles(full_name, email)")
            .eq("project_id", id),
          client
            .from("sprints")
            .select(
              "id, sprint_number, version, status, start_date, end_date",
            )
            .eq("project_id", id)
            .order("sprint_number"),
        ]);
      if (error || !project) return fail("Project not found.");
      return ok({
        ...project,
        members: (members ?? []).map((member) => ({
          user_id: member.user_id,
          full_name: member.profiles?.full_name ?? null,
          email: member.profiles?.email ?? null,
        })),
        sprints: sprints ?? [],
      });
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description:
        "Create a project. Names are unique. Admin only.",
      inputSchema: {
        name: nameSchema,
        description: descriptionSchema.optional(),
      },
    },
    async ({ name, description }) => {
      const { data, error } = await client
        .from("projects")
        .insert({ name, description: description || null })
        .select()
        .single();
      if (error) return fail(databaseError(error.message));
      return ok(data);
    },
  );

  server.registerTool(
    "update_project",
    {
      title: "Update project",
      description:
        "Update a project's name, description, or status (active/archived). Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        name: nameSchema.optional(),
        description: descriptionSchema.optional(),
        status: z
          .enum(["active", "archived"])
          .describe("Archive or re-activate the project.")
          .optional(),
      },
    },
    async ({ id, name, description, status }) => {
      if (name === undefined && description === undefined && !status) {
        return fail("Provide at least one field to update.");
      }
      const { data: current, error: readError } = await client
        .from("projects")
        .select("id")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("Project not found.");

      const update: TablesUpdate<"projects"> = {};
      if (name !== undefined) update.name = name;
      if (description !== undefined) update.description = description || null;
      if (status) update.status = status;

      const { data, error } = await client
        .from("projects")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) return fail(databaseError(error.message));
      return ok(data);
    },
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete project",
      description:
        "Permanently delete a project. Blocked while the project still has sprints; delete them with delete_sprint first. Members are detached automatically. Requires confirm: true. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm permanent deletion."),
      },
    },
    async ({ id }) => {
      const { data: project, error: readError } = await client
        .from("projects")
        .select("id, name")
        .eq("id", id)
        .single();
      if (readError || !project) return fail("Project not found.");

      const { count, error: countError } = await client
        .from("sprints")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id);
      if (countError) return fail(countError.message);
      if ((count ?? 0) > 0) {
        return fail(
          `Project "${project.name}" still has ${count} sprint(s). Delete them with delete_sprint first.`,
        );
      }

      // project_members rows cascade with the project.
      const { error } = await client.from("projects").delete().eq("id", id);
      if (error) return fail(error.message);
      return ok({ deleted: project });
    },
  );

  server.registerTool(
    "add_project_member",
    {
      title: "Add project member",
      description:
        "Assign a user to a project. Archived projects and suspended users are rejected. Admin only.",
      inputSchema: {
        project_id: z.string().uuid(),
        user_id: z.string().uuid(),
      },
    },
    async ({ project_id, user_id }) => {
      const [{ data: project, error: projectError }, { data: user, error: userError }] =
        await Promise.all([
          client.from("projects").select("status").eq("id", project_id).single(),
          client.from("profiles").select("status").eq("id", user_id).single(),
        ]);
      if (projectError || !project) return fail("Project not found.");
      if (project.status !== "active") {
        return fail("Archived projects cannot receive new members.");
      }
      if (userError || !user) return fail("User not found.");
      if (user.status !== "active") {
        return fail("Suspended users cannot be assigned.");
      }

      const { error } = await client
        .from("project_members")
        .upsert(
          { project_id, user_id },
          { onConflict: "project_id,user_id", ignoreDuplicates: true },
        );
      if (error) return fail(error.message);
      return ok({ project_id, user_id });
    },
  );

  server.registerTool(
    "remove_project_member",
    {
      title: "Remove project member",
      description: "Remove a user from a project. Admin only.",
      inputSchema: {
        project_id: z.string().uuid(),
        user_id: z.string().uuid(),
      },
    },
    async ({ project_id, user_id }) => {
      const { error } = await client
        .from("project_members")
        .delete()
        .eq("project_id", project_id)
        .eq("user_id", user_id);
      if (error) return fail(error.message);
      return ok({ project_id, user_id, removed: true });
    },
  );
}
