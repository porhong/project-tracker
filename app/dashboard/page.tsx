import type { Metadata } from "next";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProfile, type CurrentUser } from "@/lib/auth/guards";
import { ROLE_LABELS, STATUS_LABELS, type AppRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Overview · Project Tracker",
};

const NOTICES: Record<string, string> = {
  forbidden: "User management is restricted to administrators.",
};

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** What each role may do, stated in the same terms the guards enforce. */
const PERMISSIONS: Record<AppRole, { allowed: string[]; denied: string[] }> = {
  admin: {
    allowed: [
      "View the overview",
      "Create, edit, and remove accounts",
      "Change roles, suspend and restore access",
    ],
    denied: [],
  },
  viewer: {
    allowed: ["View the overview", "View your own account details"],
    denied: [
      "Create, edit, or remove accounts",
      "Change roles, suspend or restore access",
    ],
  },
};

function AccountCard({ user }: { user: CurrentUser }) {
  const fields = [
    { label: "Name", value: user.fullName || "—" },
    { label: "Email", value: user.email },
    {
      label: "Member since",
      value: user.createdAt ? dateFormat.format(new Date(user.createdAt)) : "—",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your account</CardTitle>
        <CardDescription>
          Only an administrator can change these details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex items-baseline justify-between gap-4"
            >
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="text-right font-medium">{field.value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge
                variant={user.status === "suspended" ? "destructive" : "outline"}
              >
                {STATUS_LABELS[user.status]}
              </Badge>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function PermissionsCard({ role }: { role: AppRole }) {
  const { allowed, denied } = PERMISSIONS[role];

  return (
    <Card>
      <CardHeader>
        <CardTitle>What you can do</CardTitle>
        <CardDescription>
          Your access is set by the {ROLE_LABELS[role]} role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {allowed.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
          {denied.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-muted-foreground"
            >
              <MinusIcon className="mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

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

      <section className="grid gap-4 md:grid-cols-2">
        <AccountCard user={user} />
        <PermissionsCard role={user.role} />
      </section>
    </div>
  );
}
