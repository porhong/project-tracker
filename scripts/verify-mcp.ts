/**
 * Smoke test for the admin MCP tool layer: spins up the real MCP server
 * in-process (InMemoryTransport) with a throwaway admin identity, exercises
 * every tool's happy path and guardrails, then cleans up. Not part of the app.
 *
 * Route-level Bearer auth (lib/mcp/auth.ts) is not covered here because it is
 * bound to Next's server build; test it manually with `bun run mcp:token` and
 * an MCP client against `bun run dev`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClient } from "@supabase/supabase-js";
import { createMcpServer } from "../lib/mcp/server";
import type { Database } from "../lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;

const service = createClient<Database>(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const adminEmail = `mcp-verify-admin-${stamp}@example.com`;
const extraAdminEmail = `mcp-verify-admin2-${stamp}@example.com`;
const userEmail = `mcp-verify-user-${stamp}@example.com`;
const password = "Sup3rSecret!verify";

const results: string[] = [];
const record = (label: string, pass: boolean, detail = "") =>
  results.push(
    `${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );

let adminId = "";
let extraAdminId = "";
let projectId = "";
let extraProjectId = "";
const sprintIds: string[] = [];
let createdUserId = "";

try {
  // Throwaway admin acts as the MCP caller.
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: "MCP Verify Admin" },
      app_metadata: { role: "admin" },
    });
  if (createError || !created.user) throw createError;
  adminId = created.user.id;
  // GoTrue applies app_metadata after the profile trigger ran; set it here,
  // exactly like the app's createUser action does.
  await service.from("profiles").update({ role: "admin" }).eq("id", adminId);

  const server = createMcpServer({
    admin: { id: adminId, email: adminEmail },
    client: service,
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "verify-mcp", version: "0.1.0" });
  await client.connect(clientTransport);

  type ToolResult = Awaited<ReturnType<typeof client.callTool>>;
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args });
  const isError = (result: ToolResult) => result.isError === true;
  const text = (result: ToolResult) => {
    const [first] = result.content as Array<{ text?: string }>;
    return first?.text ?? "";
  };
  const detail = (result: ToolResult) => text(result).slice(0, 120);
  const payload = (result: ToolResult): Record<string, unknown> => {
    try {
      return JSON.parse(text(result)) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const { tools } = await client.listTools();
  record(
    "server exposes all 19 admin tools",
    tools.length === 19,
    `count=${tools.length}: ${tools.map((tool) => tool.name).join(", ")}`,
  );

  // --- Projects -----------------------------------------------------------
  let result = await call("create_project", {
    name: `MCP Verify Project ${stamp}`,
    description: "Created by verify-mcp",
  });
  record("create_project", !isError(result), detail(result));
  projectId = String(payload(result).id ?? "");

  result = await call("create_project", {
    name: `MCP Verify Project ${stamp}`,
  });
  record(
    "create_project rejects duplicate names",
    isError(result),
    detail(result),
  );

  result = await call("update_project", {
    id: projectId,
    description: "Updated by verify-mcp",
  });
  record("update_project", !isError(result), detail(result));

  result = await call("list_projects");
  record(
    "list_projects includes the new project",
    !isError(result) && text(result).includes(projectId),
  );

  // --- Users (created early so member tools have someone) -----------------
  result = await call("create_user", {
    email: userEmail,
    password,
    full_name: "MCP Verify User",
    role: "user",
  });
  record("create_user", !isError(result), detail(result));
  createdUserId = String(payload(result).id ?? "");

  result = await call("create_user", {
    email: userEmail,
    password,
    role: "user",
  });
  record(
    "create_user rejects duplicate emails",
    isError(result),
    detail(result),
  );

  result = await call("update_user", { id: createdUserId, role: "viewer" });
  record("update_user changes role", !isError(result), detail(result));

  result = await call("list_users");
  record(
    "list_users includes the new user",
    !isError(result) && text(result).includes(createdUserId),
  );

  result = await call("get_user", { id: createdUserId });
  record(
    "get_user returns the profile",
    !isError(result) && text(result).includes(userEmail),
  );

  result = await call("update_user", { id: adminId, role: "user" });
  record(
    "update_user blocks changing your own role",
    isError(result),
    detail(result),
  );

  result = await call("set_user_status", {
    id: adminId,
    status: "suspended",
  });
  record(
    "set_user_status blocks suspending your own account",
    isError(result),
    detail(result),
  );

  result = await call("create_user", {
    email: extraAdminEmail,
    password,
    full_name: "MCP Verify Extra Admin",
    role: "admin",
  });
  record("create_user extra admin", !isError(result), detail(result));
  extraAdminId = String(payload(result).id ?? "");

  const { data: activeAdmins } = await service
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");
  const preexistingAdmins = (activeAdmins ?? []).filter(
    (row) => row.id !== adminId && row.id !== extraAdminId,
  );

  if (preexistingAdmins.length === 0 && extraAdminId) {
    // HTTP auth is bypassed here, so we can drop the caller's DB role and
    // still invoke tools as that identity — that's the only way to reach
    // the last-admin guard without targeting ourselves.
    await service.from("profiles").update({ role: "user" }).eq("id", adminId);
    try {
      result = await call("update_user", { id: extraAdminId, role: "user" });
      record(
        "update_user blocks demoting the last active admin",
        isError(result) && text(result).includes("last active administrator"),
        detail(result),
      );

      result = await call("set_user_status", {
        id: extraAdminId,
        status: "suspended",
      });
      record(
        "set_user_status blocks suspending the last active admin",
        isError(result) && text(result).includes("last active administrator"),
        detail(result),
      );

      result = await call("delete_user", { id: extraAdminId, confirm: true });
      record(
        "delete_user blocks deleting the last active admin",
        isError(result) && text(result).includes("last active administrator"),
        detail(result),
      );
    } finally {
      await service.from("profiles").update({ role: "admin" }).eq("id", adminId);
    }
  } else {
    const skip = "other active admins already exist in this database";
    record("update_user blocks demoting the last active admin", true, skip);
    record(
      "set_user_status blocks suspending the last active admin",
      true,
      skip,
    );
    record("delete_user blocks deleting the last active admin", true, skip);
  }

  result = await call("set_user_status", {
    id: createdUserId,
    status: "suspended",
  });
  record("set_user_status suspends", !isError(result), detail(result));

  // --- Project members ------------------------------------------------------
  result = await call("add_project_member", {
    project_id: projectId,
    user_id: createdUserId,
  });
  record(
    "add_project_member rejects suspended users",
    isError(result),
    detail(result),
  );

  result = await call("set_user_status", {
    id: createdUserId,
    status: "active",
  });
  record("set_user_status reactivates", !isError(result), detail(result));

  result = await call("add_project_member", {
    project_id: projectId,
    user_id: createdUserId,
  });
  record("add_project_member", !isError(result), detail(result));

  result = await call("get_project", { id: projectId });
  record(
    "get_project shows the member",
    !isError(result) && text(result).includes(createdUserId),
  );

  result = await call("remove_project_member", {
    project_id: projectId,
    user_id: createdUserId,
  });
  record("remove_project_member", !isError(result), detail(result));

  // --- Archived project guardrails (separate project so sprints stay intact)
  result = await call("create_project", {
    name: `MCP Verify Archive ${stamp}`,
  });
  record("create_project for archive tests", !isError(result), detail(result));
  extraProjectId = String(payload(result).id ?? "");

  result = await call("update_project", {
    id: extraProjectId,
    status: "archived",
  });
  record("update_project archives a project", !isError(result), detail(result));

  result = await call("add_project_member", {
    project_id: extraProjectId,
    user_id: createdUserId,
  });
  record(
    "add_project_member rejects archived projects",
    isError(result),
    detail(result),
  );

  result = await call("create_sprint", {
    project_id: extraProjectId,
    sprint_number: 1,
    version: "v1.0",
    start_date: "2026-08-24",
    end_date: "2026-09-04",
    working_days: [1, 2, 3, 4, 5],
    daily_work_hours: 8,
  });
  record(
    "create_sprint rejects archived projects",
    isError(result),
    detail(result),
  );

  result = await call("delete_project", {
    id: extraProjectId,
    confirm: true,
  });
  record(
    "delete_project succeeds with no sprints",
    !isError(result),
    detail(result),
  );
  extraProjectId = "";

  // --- Sprints --------------------------------------------------------------
  result = await call("create_sprint", {
    project_id: projectId,
    sprint_number: 1,
    version: "v1.0",
    start_date: "2026-08-24",
    end_date: "2026-09-04",
    working_days: [1, 2, 3, 4, 5],
    daily_work_hours: 8,
  });
  record("create_sprint", !isError(result), detail(result));
  const firstSprintId = String(payload(result).id ?? "");
  sprintIds.push(firstSprintId);

  result = await call("list_sprints", { project_id: projectId });
  record(
    "list_sprints includes the new sprint",
    !isError(result) && text(result).includes(firstSprintId),
  );

  result = await call("get_sprint", { id: firstSprintId });
  record(
    "get_sprint returns the sprint",
    !isError(result) && text(result).includes("v1.0"),
  );

  result = await call("create_sprint", {
    project_id: projectId,
    sprint_number: 1,
    version: "v1.0-duplicate",
    start_date: "2026-09-07",
    end_date: "2026-09-18",
    working_days: [1, 2, 3, 4, 5],
    daily_work_hours: 8,
  });
  record(
    "create_sprint rejects duplicate sprint numbers",
    isError(result),
    detail(result),
  );

  result = await call("create_sprint", {
    project_id: projectId,
    sprint_number: 2,
    version: "no-v-prefix",
    start_date: "2026-09-07",
    end_date: "2026-09-18",
    working_days: [1, 2, 3, 4, 5],
    daily_work_hours: 8,
  });
  record(
    "create_sprint rejects versions without v prefix",
    isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "active",
  });
  record("set_sprint_status activates a draft", !isError(result), detail(result));

  result = await call("create_sprint", {
    project_id: projectId,
    sprint_number: 2,
    version: "v2.0",
    start_date: "2026-09-07",
    end_date: "2026-09-18",
    working_days: [1, 2, 3, 4, 5],
    daily_work_hours: 8,
  });
  const secondSprintId = String(payload(result).id ?? "");
  sprintIds.push(secondSprintId);

  result = await call("set_sprint_status", {
    id: secondSprintId,
    status: "active",
  });
  record(
    "only one active sprint per project",
    isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "completed",
  });
  record(
    "set_sprint_status completes an active sprint",
    !isError(result),
    detail(result),
  );

  result = await call("update_sprint", {
    id: firstSprintId,
    description: "should not apply",
  });
  record(
    "update_sprint rejected on completed",
    isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "active",
  });
  record(
    "re-enabling a completed sprint requires confirm",
    isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "active",
    confirm: true,
  });
  record(
    "re-enable completed sprint with confirm",
    !isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "archived",
  });
  record(
    "archiving a sprint requires confirm",
    isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "archived",
    confirm: true,
  });
  record("archive sprint with confirm", !isError(result), detail(result));

  result = await call("update_sprint", {
    id: firstSprintId,
    description: "should not apply",
  });
  record(
    "update_sprint rejected on archived",
    isError(result),
    detail(result),
  );

  result = await call("set_sprint_status", {
    id: firstSprintId,
    status: "draft",
  });
  record("unarchive restores to draft", !isError(result), detail(result));

  result = await call("update_sprint", {
    id: secondSprintId,
    description: "Updated by verify-mcp",
  });
  record("update_sprint", !isError(result), detail(result));

  // Preserve-plan / delete-user guards need a sprint plan row for the user.
  result = await call("add_project_member", {
    project_id: projectId,
    user_id: createdUserId,
  });
  record(
    "re-add project member before plan guards",
    !isError(result),
    detail(result),
  );

  const { error: noteError } = await service
    .from("sprint_member_activity_notes")
    .insert({
      sprint_id: secondSprintId,
      user_id: createdUserId,
      activity: "verify-mcp",
      note: "guardrail fixture",
    });
  record(
    "seed sprint activity note for delete/remove guards",
    !noteError,
    noteError?.message ?? "",
  );

  result = await call("delete_user", { id: createdUserId, confirm: true });
  record(
    "delete_user blocks users with sprint plan records",
    isError(result) && text(result).includes("sprint capacity or activity"),
    detail(result),
  );

  result = await call("remove_project_member", {
    project_id: projectId,
    user_id: createdUserId,
  });
  record(
    "remove_project_member preserves sprint plan records",
    !isError(result) && payload(result).preserved_plan_records === true,
    detail(result),
  );

  // --- Destructive guardrails ------------------------------------------------
  result = await call("delete_sprint", { id: firstSprintId });
  record("delete_sprint requires confirm", isError(result), detail(result));

  result = await call("delete_project", { id: projectId });
  record("delete_project requires confirm", isError(result), detail(result));

  result = await call("delete_project", { id: projectId, confirm: true });
  record(
    "delete_project blocked while sprints exist",
    isError(result),
    detail(result),
  );

  result = await call("delete_sprint", { id: firstSprintId, confirm: true });
  record("delete_sprint with confirm", !isError(result), detail(result));
  sprintIds.splice(sprintIds.indexOf(firstSprintId), 1);

  result = await call("delete_sprint", { id: secondSprintId, confirm: true });
  record("delete_sprint remaining sprint", !isError(result), detail(result));
  sprintIds.splice(sprintIds.indexOf(secondSprintId), 1);

  result = await call("delete_project", { id: projectId, confirm: true });
  record(
    "delete_project succeeds after sprints are gone",
    !isError(result),
    detail(result),
  );
  projectId = "";

  result = await call("delete_user", { id: adminId, confirm: true });
  record(
    "delete_user blocks deleting your own account",
    isError(result),
    detail(result),
  );

  if (extraAdminId) {
    result = await call("delete_user", { id: extraAdminId, confirm: true });
    record("delete_user extra admin with confirm", !isError(result), detail(result));
    extraAdminId = "";
  }

  result = await call("delete_user", { id: createdUserId, confirm: true });
  record("delete_user with confirm", !isError(result), detail(result));
  createdUserId = "";

  await client.close();
  await server.close();
} catch (error) {
  record(
    "unexpected error",
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  for (const sprintId of sprintIds.filter(Boolean)) {
    await service.from("sprints").delete().eq("id", sprintId);
  }
  for (const id of [projectId, extraProjectId].filter(Boolean)) {
    await service.from("projects").delete().eq("id", id);
  }
  const userIds = [adminId, extraAdminId, createdUserId].filter(Boolean);
  for (const id of userIds) {
    await service.auth.admin.deleteUser(id);
  }
  const { data: leftovers } = userIds.length
    ? await service.from("profiles").select("email").in("id", userIds)
    : { data: [] };
  record(
    "cleanup removed all test users",
    (leftovers?.length ?? 0) === 0,
    `leftover=${leftovers?.map((row) => row.email).join(",") || "none"}`,
  );

  console.log("\n" + results.join("\n") + "\n");
  if (results.some((entry) => entry.startsWith("FAIL"))) process.exit(1);
}
