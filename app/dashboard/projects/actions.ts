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
