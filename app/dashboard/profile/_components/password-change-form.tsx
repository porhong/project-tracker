"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeMyPassword, type ProfileActionResult } from "../actions";

type Props = {
  forced?: boolean;
};

export function PasswordChangeForm({ forced = false }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ProfileActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    const newPassword = String(formData.get("new_password") ?? "");
    const confirmPassword = String(formData.get("confirm_new_password") ?? "");

    if (newPassword !== confirmPassword) {
      setResult({ ok: false, error: "New password and confirmation do not match." });
      return;
    }

    startTransition(async () => {
      setResult(null);
      const actionResult = await changeMyPassword(formData);
      setResult(actionResult);

      if (actionResult.ok) {
        formRef.current?.reset();
        if (forced) {
          router.push("/dashboard");
        }
      }
    });
  };

  useEffect(() => {
    if (result?.ok) {
      toast.success(forced ? "Password changed. Redirecting…" : "Password changed.");
    } else if (result && !result.ok) {
      toast.error(result.error);
    }
  }, [result, forced]);

  return (
    <Card className={forced ? "w-full max-w-md" : undefined}>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          {forced
            ? "Your account requires a password change before you can continue."
            : "Update your password by providing your current one."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={submit} className="space-y-4">
          {forced ? (
            <Alert>
              <AlertDescription>
                You must change your password now. The password you were given is
                temporary.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="current_password">Current password</Label>
            <Input
              id="current_password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">
              Must be at least 8 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_new_password">Confirm new password</Label>
            <Input
              id="confirm_new_password"
              name="confirm_new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          {result && !result.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={pending}>
            <KeyRoundIcon data-icon="inline-start" />
            {pending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
