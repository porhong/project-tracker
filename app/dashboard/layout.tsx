import Link from "next/link";
import { ProfileAvatar } from "@/components/profile-avatar";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { createAvatarUrl } from "@/lib/profile/avatar-url";
import { DashboardNav } from "./_components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const user = await requireProfile();
  const avatarUrl = await createAvatarUrl(user.avatarPath);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/dashboard" className="text-sm font-semibold">
            Project Tracker
          </Link>

          <DashboardNav role={user.role} />

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/dashboard/profile"
              className="flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm leading-tight font-medium">
                  {user.fullName || user.email}
                </p>
                <p className="text-xs leading-tight text-muted-foreground">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
              <ProfileAvatar name={user.fullName} email={user.email} url={avatarUrl} />
            </Link>
            <form action="/auth/sign-out" method="post">
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
