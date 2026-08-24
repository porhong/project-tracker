"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guards";
import { AVATAR_BUCKET, isAvatarPathForUser } from "@/lib/profile/avatar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

const MAX_FULL_NAME_LENGTH = 120;
const MAX_COMPETENCY_LENGTH = 120;
const MIN_PASSWORD_LENGTH = 8;

function fail(error: string): ProfileActionResult {
  return { ok: false, error };
}

function revalidateProfile() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/users");
}

function readProfileFields(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const competency = String(formData.get("competency") ?? "").trim();

  if (fullName.length > MAX_FULL_NAME_LENGTH) {
    return { error: `Full name must be at most ${MAX_FULL_NAME_LENGTH} characters.` };
  }
  if (competency.length > MAX_COMPETENCY_LENGTH) {
    return { error: `Competency must be at most ${MAX_COMPETENCY_LENGTH} characters.` };
  }

  return { fullName, competency };
}

async function deleteStoredAvatar(path: string) {
  const { error } = await createAdminClient().storage
    .from(AVATAR_BUCKET)
    .remove([path]);
  return error;
}

/**
 * Updates only the current user's personal fields. Identity is always derived
 * from the verified session; the browser never chooses the profile row.
 */
export async function updateMyProfile(formData: FormData): Promise<ProfileActionResult> {
  const user = await requireProfile();
  const fields = readProfileFields(formData);
  if (fields.error) return fail(fields.error);

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  if (readError || !current) return fail("Could not load your current profile.");

  const submittedPath = formData.get("avatar_path");
  const avatarPath =
    typeof submittedPath === "string" && submittedPath
      ? submittedPath
      : current.avatar_path;
  const replacingAvatar = avatarPath !== current.avatar_path;

  if (replacingAvatar && !isAvatarPathForUser(avatarPath, user.id)) {
    return fail("The uploaded profile photo is invalid. Please upload it again.");
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fields.fullName || null,
      competency: fields.competency || null,
      avatar_path: avatarPath,
    })
    .eq("id", user.id);

  if (updateError) {
    if (replacingAvatar && avatarPath) await deleteStoredAvatar(avatarPath);
    return fail(updateError.message);
  }

  revalidateProfile();

  const removePrevious = formData.get("delete_previous_avatar") === "on";
  if (replacingAvatar && removePrevious && current.avatar_path) {
    const cleanupError = await deleteStoredAvatar(current.avatar_path);
    if (cleanupError) {
      return {
        ok: true,
        warning: "Your profile was saved, but the previous photo could not be deleted.",
      };
    }
  }

  return { ok: true };
}

export async function removeMyAvatar(): Promise<ProfileActionResult> {
  const user = await requireProfile();
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .single();
  if (readError || !current) return fail("Could not load your current profile.");
  if (!current.avatar_path) return { ok: true };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", user.id);
  if (updateError) return fail(updateError.message);

  revalidateProfile();
  const cleanupError = await deleteStoredAvatar(current.avatar_path);
  if (cleanupError) {
    return {
      ok: true,
      warning: "Your profile was updated, but the old photo could not be deleted.",
    };
  }
  return { ok: true };
}

/**
 * Changes the current user's password.
 *
 * For voluntary changes the current password is verified first. For forced
 * changes (first sign-in after admin provisioning) the current password is not
 * required because the user has just authenticated with it and the profile flag
 * is the source of truth for skipping the check.
 *
 * The password is updated through the service role so Supabase does not require
 * a reauthentication nonce.
 */
export async function changeMyPassword(
  formData: FormData,
): Promise<ProfileActionResult> {
  const user = await requireProfile();

  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_new_password") ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return fail(
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (newPassword !== confirmPassword) {
    return fail("New password and confirmation do not match.");
  }

  // Use the service role to read the forced-change flag; this prevents the
  // browser from claiming a forced change when one is not actually pending.
  const admin = createAdminClient();
  const { data: profile, error: profileReadError } = await admin
    .from("profiles")
    .select("force_password_change")
    .eq("id", user.id)
    .single();
  if (profileReadError || !profile) {
    return fail("Could not load your account status.");
  }

  const forcedChange = profile.force_password_change;

  if (!forcedChange) {
    const currentPassword = String(formData.get("current_password") ?? "");
    if (!currentPassword) {
      return fail("Current password is required.");
    }
    if (newPassword === currentPassword) {
      return fail("New password must be different from the current password.");
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !publishableKey) {
      return fail("Authentication service is not configured.");
    }

    // Verify the current password without affecting the browser session.
    const authClient = createSupabaseClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: verifyError } = await authClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      return fail("Current password is incorrect.");
    }
  }

  // Apply the new password and clear the forced-change flag.
  const { error: passwordError } = await admin.auth.admin.updateUserById(
    user.id,
    { password: newPassword },
  );
  if (passwordError) {
    return fail(passwordError.message);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ force_password_change: false })
    .eq("id", user.id);
  if (profileError) {
    return fail(profileError.message);
  }

  revalidateProfile();
  return { ok: true };
}
