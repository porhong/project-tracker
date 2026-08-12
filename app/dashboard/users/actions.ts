"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  SUSPEND_BAN_DURATION,
  UNSUSPEND_BAN_DURATION,
  isAppRole,
  isUserStatus,
  type AppRole,
  type UserStatus,
} from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MIN_PASSWORD_LENGTH = 8;

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function revalidate() {
  revalidatePath("/dashboard/users");
  revalidatePath("/dashboard");
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Blocks changes that would leave the app with no way back in: removing the
 * last active admin, or an admin locking themselves out.
 */
async function assertNotLastActiveAdmin(
  admin: AdminClient,
  targetId: string,
  action: string,
): Promise<string | null> {
  const { data, error } = await admin
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

export async function createUser(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = formData.get("role");

  if (!email) return fail("Email is required.");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!isAppRole(role)) return fail("Select a valid role.");

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    // Admin-provisioned accounts are usable immediately; no verification email.
    email_confirm: true,
    user_metadata: { full_name: fullName },
    // Authorization data belongs in app_metadata, which only the service role
    // can write. user_metadata is user-editable and unsafe for this.
    app_metadata: { role },
  });

  if (error || !created.user) {
    return fail(
      error?.message.toLowerCase().includes("already")
        ? "A user with that email already exists."
        : (error?.message ?? "Could not create the user."),
    );
  }

  // The on_auth_user_created trigger already inserted the profile, but GoTrue
  // applies custom app_metadata *after* the auth.users insert, so the trigger
  // saw no role and defaulted to 'viewer'. Set the real role explicitly.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role, full_name: fullName || null })
    .eq("id", created.user.id);

  if (profileError) {
    // Don't leave a half-provisioned account behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(profileError.message);
  }

  revalidate();
  return { ok: true };
}

export async function updateUser(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role");

  if (!id) return fail("Missing user.");
  if (!email) return fail("Email is required.");
  if (!isAppRole(role)) return fail("Select a valid role.");
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("profiles")
    .select("email, role")
    .eq("id", id)
    .single();

  if (readError || !current) return fail("User not found.");

  const demoting = current.role === "admin" && role !== "admin";
  if (demoting) {
    if (id === me.id) return fail("You cannot change your own role.");
    const blocked = await assertNotLastActiveAdmin(admin, id, "demote");
    if (blocked) return fail(blocked);
  }

  const attributes: {
    email?: string;
    email_confirm?: boolean;
    password?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  } = {
    user_metadata: { full_name: fullName },
    app_metadata: { role },
  };

  if (email !== current.email) {
    attributes.email = email;
    attributes.email_confirm = true;
  }
  if (password) attributes.password = password;

  const { error: authError } = await admin.auth.admin.updateUserById(
    id,
    attributes,
  );
  if (authError) return fail(authError.message);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ email, full_name: fullName || null, role: role as AppRole })
    .eq("id", id);

  if (profileError) return fail(profileError.message);

  revalidate();
  return { ok: true };
}

export async function setUserStatus(
  id: string,
  status: UserStatus,
): Promise<ActionResult> {
  const me = await requireAdmin();

  if (!id) return fail("Missing user.");
  if (!isUserStatus(status)) return fail("Invalid status.");

  const suspending = status === "suspended";
  if (suspending && id === me.id) {
    return fail("You cannot suspend your own account.");
  }

  const admin = createAdminClient();

  if (suspending) {
    const blocked = await assertNotLastActiveAdmin(admin, id, "suspend");
    if (blocked) return fail(blocked);
  }

  // Two layers: ban at the Auth layer so the user cannot sign in or refresh
  // their token, and flip the profile status that proxy.ts reads to cut short
  // an access token that was already issued.
  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: suspending ? SUSPEND_BAN_DURATION : UNSUSPEND_BAN_DURATION,
  });
  if (authError) return fail(authError.message);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ status })
    .eq("id", id);

  if (profileError) return fail(profileError.message);

  revalidate();
  return { ok: true };
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const me = await requireAdmin();

  if (!id) return fail("Missing user.");
  if (id === me.id) return fail("You cannot delete your own account.");

  const admin = createAdminClient();
  const blocked = await assertNotLastActiveAdmin(admin, id, "delete");
  if (blocked) return fail(blocked);

  // The profiles row goes with it via `on delete cascade`.
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return fail(error.message);

  revalidate();
  return { ok: true };
}
