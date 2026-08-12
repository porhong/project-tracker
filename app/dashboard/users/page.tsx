import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/guards";
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
    .select("id, email, full_name, role, status, created_at")
    .order("created_at", { ascending: true });

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
        <UserTable users={data ?? []} currentUserId={me.id} />
      )}
    </div>
  );
}
