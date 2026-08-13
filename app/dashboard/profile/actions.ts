"use server";

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
