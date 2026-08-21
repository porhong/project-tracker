import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  APP_ROLES,
  SUSPEND_BAN_DURATION,
  UNSUSPEND_BAN_DURATION,
} from "@/lib/auth/roles";
import { AVATAR_BUCKET } from "@/lib/profile/avatar";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { ServiceClient, ToolContext } from "../context";
import { fail, ok } from "../result";

// Mirrors the limits in app/dashboard/users/actions.ts.
const MIN_PASSWORD_LENGTH = 8;
const MAX_COMPETENCY_LENGTH = 120;

const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  );

const competencySchema = z
  .string()
  .trim()
  .max(
    MAX_COMPETENCY_LENGTH,
    `Competency must be at most ${MAX_COMPETENCY_LENGTH} characters.`,
  );

/**
 * Blocks changes that would leave the app with no way back in: removing the
 * last active admin, or an admin locking themselves out. Mirrors
 * assertNotLastActiveAdmin in app/dashboard/users/actions.ts.
 */
async function assertNotLastActiveAdmin(
  client: ServiceClient,
  targetId: string,
  action: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active")
    .neq("id", targetId);

  if (error) return "Could not verify remaining administrators.";
  if ((data ?? []).length === 0) {
    return `Cannot ${action} the last active administrator.`;
  }
  return null;
}

export function registerUserTools(server: McpServer, ctx: ToolContext) {
  const { admin, client } = ctx;

  async function deleteStoredAvatar(path: string) {
    const { error } = await client.storage.from(AVATAR_BUCKET).remove([path]);
    return error;
  }

  server.registerTool(
    "list_users",
    {
      title: "List users",
      description: "List all user profiles. Admin only.",
      inputSchema: {},
    },
    async () => {
      const { data, error } = await client
        .from("profiles")
        .select("id, email, full_name, role, status, competency, created_at")
        .order("created_at");
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  server.registerTool(
    "get_user",
    {
      title: "Get user",
      description:
        "Get one user profile by id, including project memberships. Admin only.",
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }) => {
      const [{ data: profile, error }, { data: memberships }] =
        await Promise.all([
          client
            .from("profiles")
            .select(
              "id, email, full_name, role, status, competency, created_at",
            )
            .eq("id", id)
            .single(),
          client
            .from("project_members")
            .select("project_id, projects(name)")
            .eq("user_id", id),
        ]);
      if (error || !profile) return fail("User not found.");
      return ok({
        ...profile,
        projects: (memberships ?? []).map((membership) => ({
          project_id: membership.project_id,
          name: membership.projects?.name ?? null,
        })),
      });
    },
  );

  server.registerTool(
    "create_user",
    {
      title: "Create user",
      description:
        "Provision a user with an email, password, and role (admin, user, viewer). The account is confirmed immediately; no verification email is sent. Admin only.",
      inputSchema: {
        email: z.email(),
        password: passwordSchema,
        full_name: z.string().trim().optional(),
        competency: competencySchema.optional(),
        role: z.enum(APP_ROLES),
      },
    },
    async ({ email, password, full_name, competency, role }) => {
      const normalizedEmail = email.toLowerCase();
      const { data: created, error } = await client.auth.admin.createUser({
        email: normalizedEmail,
        password,
        // Admin-provisioned accounts are usable immediately.
        email_confirm: true,
        user_metadata: { full_name: full_name ?? "" },
        // Authorization data belongs in app_metadata, which only the service
        // role can write. user_metadata is user-editable and unsafe for this.
        app_metadata: { role },
      });

      if (error || !created.user) {
        return fail(
          error?.message.toLowerCase().includes("already")
            ? "A user with that email already exists."
            : (error?.message ?? "Could not create the user."),
        );
      }

      // The on_auth_user_created trigger already inserted the profile, but
      // GoTrue applies custom app_metadata *after* the auth.users insert, so
      // the trigger saw no role and defaulted to 'viewer'. Set it explicitly.
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .update({
          role,
          full_name: full_name || null,
          competency: competency || null,
        })
        .eq("id", created.user.id)
        .select("id, email, full_name, role, status, competency")
        .single();

      if (profileError) {
        // Don't leave a half-provisioned account behind.
        await client.auth.admin.deleteUser(created.user.id);
        return fail(profileError.message);
      }

      return ok(profile);
    },
  );

  server.registerTool(
    "update_user",
    {
      title: "Update user",
      description:
        "Update a user's email, full name, competency, password, role, or remove their profile photo. Admins cannot demote themselves, and the last active administrator cannot be demoted. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        email: z.email().optional(),
        full_name: z.string().trim().optional(),
        competency: competencySchema.optional(),
        password: passwordSchema.optional(),
        role: z.enum(APP_ROLES).optional(),
        remove_avatar: z
          .boolean()
          .describe("Delete the user's stored profile photo.")
          .optional(),
      },
    },
    async ({ id, email, full_name, competency, password, role, remove_avatar }) => {
      if (
        email === undefined &&
        full_name === undefined &&
        competency === undefined &&
        password === undefined &&
        role === undefined &&
        !remove_avatar
      ) {
        return fail("Provide at least one field to update.");
      }

      const { data: current, error: readError } = await client
        .from("profiles")
        .select("email, role, avatar_path")
        .eq("id", id)
        .single();
      if (readError || !current) return fail("User not found.");

      const demoting =
        role !== undefined && current.role === "admin" && role !== "admin";
      if (demoting) {
        if (id === admin.id) return fail("You cannot change your own role.");
        const blocked = await assertNotLastActiveAdmin(client, id, "demote");
        if (blocked) return fail(blocked);
      }

      const normalizedEmail = email?.toLowerCase();
      const attributes: {
        email?: string;
        email_confirm?: boolean;
        password?: string;
        user_metadata?: Record<string, unknown>;
        app_metadata?: Record<string, unknown>;
      } = {};
      if (full_name !== undefined) {
        attributes.user_metadata = { full_name };
      }
      if (role !== undefined) attributes.app_metadata = { role };
      if (normalizedEmail && normalizedEmail !== current.email) {
        attributes.email = normalizedEmail;
        attributes.email_confirm = true;
      }
      if (password) attributes.password = password;

      if (Object.keys(attributes).length > 0) {
        const { error: authError } = await client.auth.admin.updateUserById(
          id,
          attributes,
        );
        if (authError) return fail(authError.message);
      }

      const profileUpdate: TablesUpdate<"profiles"> = {};
      if (normalizedEmail !== undefined) profileUpdate.email = normalizedEmail;
      if (full_name !== undefined) profileUpdate.full_name = full_name || null;
      if (competency !== undefined) {
        profileUpdate.competency = competency || null;
      }
      if (role !== undefined) profileUpdate.role = role;
      if (remove_avatar) profileUpdate.avatar_path = null;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await client
          .from("profiles")
          .update(profileUpdate)
          .eq("id", id);
        if (profileError) return fail(profileError.message);
      }

      let warning: string | undefined;
      if (remove_avatar && current.avatar_path) {
        const cleanupError = await deleteStoredAvatar(current.avatar_path);
        if (cleanupError) {
          warning =
            "The user was updated, but the previous profile photo could not be deleted.";
        }
      }

      const { data: updated } = await client
        .from("profiles")
        .select("id, email, full_name, role, status, competency")
        .eq("id", id)
        .single();
      return ok({ ...updated, ...(warning ? { warning } : {}) });
    },
  );

  server.registerTool(
    "set_user_status",
    {
      title: "Set user status",
      description:
        "Suspend or reactivate a user. Suspension bans the account at the auth layer so it cannot sign in or refresh tokens. Admins cannot suspend themselves, and the last active administrator cannot be suspended. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        status: z.enum(["active", "suspended"]),
      },
    },
    async ({ id, status }) => {
      const suspending = status === "suspended";
      if (suspending && id === admin.id) {
        return fail("You cannot suspend your own account.");
      }
      if (suspending) {
        const blocked = await assertNotLastActiveAdmin(client, id, "suspend");
        if (blocked) return fail(blocked);
      }

      // Two layers: ban at the Auth layer so the user cannot sign in or
      // refresh their token, and flip the profile status that proxy.ts reads
      // to cut short an access token that was already issued.
      const { error: authError } = await client.auth.admin.updateUserById(id, {
        ban_duration: suspending ? SUSPEND_BAN_DURATION : UNSUSPEND_BAN_DURATION,
      });
      if (authError) return fail(authError.message);

      const { data, error: profileError } = await client
        .from("profiles")
        .update({ status })
        .eq("id", id)
        .select("id, email, status")
        .single();
      if (profileError) return fail(profileError.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_user",
    {
      title: "Delete user",
      description:
        "Permanently delete a user, their profile, and their stored profile photo. Admins cannot delete themselves, and the last active administrator cannot be deleted. Requires confirm: true. Admin only.",
      inputSchema: {
        id: z.string().uuid(),
        confirm: z
          .literal(true)
          .describe("Must be true to confirm permanent deletion."),
      },
    },
    async ({ id }) => {
      if (id === admin.id) return fail("You cannot delete your own account.");

      const blocked = await assertNotLastActiveAdmin(client, id, "delete");
      if (blocked) return fail(blocked);

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("email, avatar_path")
        .eq("id", id)
        .single();
      if (profileError || !profile) return fail("User not found.");

      // Remove the private object before the profile disappears in the
      // Auth-user cascade, otherwise no reference is left for safe cleanup.
      if (profile.avatar_path) {
        const cleanupError = await deleteStoredAvatar(profile.avatar_path);
        if (cleanupError) {
          return fail("Could not delete the user's profile photo.");
        }
      }

      // The profiles row goes with it via `on delete cascade`.
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) return fail(error.message);
      return ok({ deleted: { id, email: profile.email } });
    },
  );
}
