import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { PasswordChangeForm } from "../profile/_components/password-change-form";

export const metadata: Metadata = {
  title: "Change password · Project Tracker",
};

export default async function ChangePasswordPage() {
  const user = await requireProfile();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("force_password_change, role")
    .eq("id", user.id)
    .single();

  // Only viewer/user accounts can be forced to change passwords; admins and
  // anyone who has already cleared the flag are sent back to the dashboard.
  if (
    !profile?.force_password_change ||
    (profile.role !== "viewer" && profile.role !== "user")
  ) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center">
      <PasswordChangeForm forced />
    </main>
  );
}
