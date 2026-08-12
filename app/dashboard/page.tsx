import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/guards";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Overview · Project Tracker",
};

const NOTICES: Record<string, string> = {
  forbidden: "You do not have access to that page.",
};

async function AdminStats() {
  const supabase = await createClient();
  // RLS lets admins read every profile; a viewer would only ever see their own.
  const { data } = await supabase.from("profiles").select("role, status");
  const rows = data ?? [];

  const stats = [
    { label: "Total users", value: rows.length },
    {
      label: "Admins",
      value: rows.filter((row) => row.role === "admin").length,
    },
    {
      label: "Viewers",
      value: rows.filter((row) => row.role === "viewer").length,
    },
    {
      label: "Suspended",
      value: rows.filter((row) => row.status === "suspended").length,
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardDescription>{stat.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{stat.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const user = await requireProfile();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const notice = error ? NOTICES[error] : undefined;

  return (
    <div className="space-y-8">
      {notice ? (
        <Alert variant="destructive" role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            Welcome back, {user.fullName || user.email}
          </h1>
          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
            {ROLE_LABELS[user.role]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {user.role === "admin"
            ? "You can manage accounts from the Users page."
            : "You have read-only access."}
        </p>
      </header>

      {user.role === "admin" ? <AdminStats /> : null}
    </div>
  );
}
