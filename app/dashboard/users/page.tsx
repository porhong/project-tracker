import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
import { AVATAR_BUCKET } from "@/lib/profile/avatar";
import { createClient } from "@/lib/supabase/server";
import { UserTable } from "./_components/user-table";

export const metadata: Metadata = {
  title: "Users · Project Tracker",
};

export default async function UsersPage() {
  const me = await requireAdmin();

  // Read through the RLS-bound client, not the service-role one, so the
  // `profiles_select_own_or_admin` policy is exercised on the read path too.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, competency, role, status, avatar_path, created_at")
    .order("created_at", { ascending: true });

  const avatarPaths = (data ?? [])
    .map((user) => user.avatar_path)
    .filter((path): path is string => Boolean(path));
  const { data: signedAvatars } = avatarPaths.length
    ? await supabase.storage.from(AVATAR_BUCKET).createSignedUrls(avatarPaths, 60 * 60)
    : { data: [] };
  const avatarUrls = new Map(
    (signedAvatars ?? [])
      .filter((avatar) => avatar.signedUrl)
      .map((avatar) => [avatar.path, avatar.signedUrl]),
  );
  const users = (data ?? []).map((user) => ({
    ...user,
    avatarUrl: user.avatar_path ? (avatarUrls.get(user.avatar_path) ?? null) : null,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Create, edit, suspend, and remove accounts. There is no self sign-up —
          every account originates here.
        </p>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load users: {error.message}</AlertDescription>
        </Alert>
      ) : (
        <UserTable users={users} currentUserId={me.id} />
      )}
    </div>
  );
}
