import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { DashboardNav } from "./_components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const user = await requireProfile();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/dashboard" className="text-sm font-semibold">
            Project Tracker
          </Link>

          <DashboardNav role={user.role} />

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">
                {user.fullName || user.email}
              </p>
              <p className="text-xs leading-tight text-muted-foreground">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
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
