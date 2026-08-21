import type { Metadata } from "next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Project Tracker",
};

const NOTICES: Record<string, string> = {
  suspended: "This account has been suspended. Contact an administrator.",
  forbidden: "You do not have access to that page.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = error ? NOTICES[error] : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Accounts are created by an administrator. There is no self sign-up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice ? (
            <Alert variant="destructive" role="status">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
