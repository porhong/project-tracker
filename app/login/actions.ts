"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !signInData.user) {
    // Supabase returns the same error for a wrong password and a banned
    // account, so keep the message generic rather than confirming which.
    return { error: "Incorrect email or password, or the account is suspended." };
  }

  // Force viewer/user accounts to change an admin-provisioned password on first
  // sign-in before they can reach the dashboard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, force_password_change")
    .eq("id", signInData.user.id)
    .single();

  if (
    profile?.force_password_change &&
    (profile.role === "viewer" || profile.role === "user")
  ) {
    revalidatePath("/", "layout");
    redirect("/dashboard/change-password?forced=1");
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/dashboard");
}
