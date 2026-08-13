"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth/roles";
import { createUser, updateUser, type ActionResult } from "../actions";
import type { UserRow } from "../types";

type Props = {
  mode: "create" | "edit";
  user?: UserRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UserFormDialog({ mode, user, open, onOpenChange }: Props) {
  const action = mode === "create" ? createUser : updateUser;
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(action, null);
  const [role, setRole] = useState<AppRole>(user?.role ?? "viewer");

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add user" : "Edit user"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "The account is active immediately — no confirmation email is sent."
              : "A role change takes effect for that user on their next token refresh."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {mode === "edit" ? (
            <input type="hidden" name="id" value={user?.id ?? ""} />
          ) : null}
          <input type="hidden" name="role" value={role} />

          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              defaultValue={user?.full_name ?? ""}
              placeholder="Ada Lovelace"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={user?.email ?? ""}
              placeholder="user@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="competency">Competency</Label>
            <Input
              id="competency"
              name="competency"
              maxLength={120}
              defaultValue={user?.competency ?? ""}
              placeholder="Frontend engineering"
            />
            <p className="text-xs text-muted-foreground">
              Optional primary area of expertise.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              {mode === "create" ? "Password" : "New password"}
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required={mode === "create"}
              placeholder={
                mode === "create" ? "At least 8 characters" : "Leave blank to keep"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-trigger">Role</Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as AppRole)}
            >
              <SelectTrigger id="role-trigger" className="w-full">
                {/* Without a formatter Base UI renders the raw enum value. */}
                <SelectValue>
                  {(value) => ROLE_LABELS[value as AppRole] ?? String(value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {APP_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === "admin"
                ? "Full access, including user management."
                : role === "user"
                  ? "Can manage only their own activity in active sprints."
                  : "Read-only access to the dashboard."}
            </p>
          </div>

          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Create user"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
