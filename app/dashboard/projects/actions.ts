"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function revalidate() {
  revalidatePath("/dashboard/projects");
  revalidatePath("/dashboard/sprints");
  revalidatePath("/dashboard/users");
}

function projectMemberInput(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!projectId) return { error: "Missing project." } as const;
  if (!userId) return { error: "Select a user." } as const;
  return { data: { project_id: projectId, user_id: userId } } as const;
}

function projectInput(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return { error: "Project name is required." } as const;
  if (name.length > 160) return { error: "Project name must be at most 160 characters." } as const;
  if (description.length > 2_000) return { error: "Description must be at most 2,000 characters." } as const;
  return { data: { name, description: description || null } } as const;
}

function databaseError(message: string): ActionResult {
  if (message.includes("projects_name_key")) return fail("A project with that name already exists.");
  return fail(message);
}

export async function createProject(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const input = projectInput(formData);
  if ("error" in input && input.error) return fail(input.error);

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert(input.data);
  if (error) return databaseError(error.message);
  revalidate();
  return { ok: true };
}

export async function updateProject(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Missing project.");
  const input = projectInput(formData);
  if ("error" in input && input.error) return fail(input.error);

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(input.data).eq("id", id);
  if (error) return databaseError(error.message);
  revalidate();
  return { ok: true };
}

export async function archiveProject(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return fail("Missing project.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("status", "active");
  if (error) return fail(error.message);
  revalidate();
  return { ok: true };
}

export async function assignProjectMember(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const input = projectMemberInput(formData);
  if ("error" in input && input.error) return fail(input.error);

  const supabase = await createClient();
  const [{ data: project, error: projectError }, { data: user, error: userError }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("status")
        .eq("id", input.data.project_id)
        .single(),
      supabase
        .from("profiles")
        .select("status")
        .eq("id", input.data.user_id)
        .single(),
    ]);

  if (projectError || !project) return fail("Project not found.");
  if (project.status !== "active") {
    return fail("Archived projects cannot receive new members.");
  }
  if (userError || !user) return fail("User not found.");
  if (user.status !== "active") return fail("Suspended users cannot be assigned.");

  const { error } = await supabase.from("project_members").upsert(
    input.data,
    { onConflict: "project_id,user_id", ignoreDuplicates: true },
  );
  if (error) return fail(error.message);
  revalidate();
  return { ok: true };
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!projectId || !userId) return fail("Missing project member.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) return fail(error.message);
  revalidate();
  return { ok: true };
}
