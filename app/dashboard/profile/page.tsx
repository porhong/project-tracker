import type { Metadata } from "next";
import { createAvatarUrl } from "@/lib/profile/avatar-url";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditor } from "./_components/profile-editor";

export const metadata: Metadata = { title: "My profile · Project Tracker" };

export default async function ProfilePage() {
  const user = await requireProfile();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, competency, avatar_path")
    .eq("id", user.id)
    .single();
  const avatarUrl = await createAvatarUrl(profile?.avatar_path);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">My profile</h1>
        <p className="text-sm text-muted-foreground">Manage the details and photo associated with your account.</p>
      </header>
      <ProfileEditor
        user={{
          id: user.id,
          email: user.email,
          fullName: profile?.full_name ?? user.fullName,
          competency: profile?.competency ?? null,
          avatarPath: profile?.avatar_path ?? null,
        }}
        avatarUrl={avatarUrl}
      />
    </div>
  );
}
