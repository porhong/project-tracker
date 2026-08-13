"use client";

import { useRef, useState, useTransition } from "react";
import { UploadIcon } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { AVATAR_ACCEPT, AVATAR_BUCKET, createAvatarPath, validateAvatarFile } from "@/lib/profile/avatar";
import { createClient } from "@/lib/supabase/client";
import { createUser, updateUser, type ActionResult } from "../actions";
import type { UserWithAvatar } from "../types";

type Props = {
  mode: "create" | "edit";
  user?: UserWithAvatar;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UserFormDialog({ mode, user, open, onOpenChange }: Props) {
  const action = mode === "create" ? createUser : updateUser;
  const [state, setState] = useState<ActionResult | null>(null);
  const [role, setRole] = useState<AppRole>(user?.role ?? "viewer");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseAvatar = (file: File | null) => {
    if (!file) return;
    const error = validateAvatarFile(file);
    if (error) {
      setState({ ok: false, error });
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
    setState(null);
  };

  const submit = (formData: FormData) => {
    startTransition(async () => {
      setState(null);
      if (mode === "edit" && avatarFile && user) {
        const validationError = validateAvatarFile(avatarFile);
        if (validationError) {
          setState({ ok: false, error: validationError });
          return;
        }
        const avatarPath = createAvatarPath(user.id, avatarFile);
        const { error: uploadError } = await createClient().storage
          .from(AVATAR_BUCKET)
          .upload(avatarPath, avatarFile, { contentType: avatarFile.type, upsert: false });
        if (uploadError) {
          setState({ ok: false, error: `Could not upload profile photo: ${uploadError.message}` });
          return;
        }
        formData.set("avatar_path", avatarPath);
      }

      const result = await action(null, formData);
      setState(result);
      if (result.ok && !result.warning) onOpenChange(false);
    });
  };

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

        <form action={submit} className="space-y-4">
          {mode === "edit" ? (
            <input type="hidden" name="id" value={user?.id ?? ""} />
          ) : null}
          <input type="hidden" name="role" value={role} />
          {mode === "edit" ? (
            <input type="hidden" name="avatar_path" value={user?.avatar_path ?? ""} />
          ) : null}

          {mode === "edit" && user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <ProfileAvatar name={user.full_name} email={user.email} url={avatarPreview ?? user.avatarUrl} size="lg" />
                <div className="space-y-2">
                  <Label htmlFor={`avatar-${user.id}`}>Profile photo</Label>
                  <Input
                    ref={fileInput}
                    id={`avatar-${user.id}`}
                    type="file"
                    accept={AVATAR_ACCEPT}
                    disabled={pending}
                    onChange={(event) => chooseAvatar(event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP; 5 MB maximum.</p>
                </div>
              </div>
              {user.avatar_path ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`delete-previous-avatar-${user.id}`}
                      name="delete_previous_avatar"
                      defaultChecked
                      disabled={removeAvatar}
                    />
                    <Label htmlFor={`delete-previous-avatar-${user.id}`}>
                      Delete the previous photo when replacing it
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <Checkbox
                      id={`remove-avatar-${user.id}`}
                      name="remove_avatar"
                      checked={removeAvatar}
                      disabled={pending}
                      onCheckedChange={setRemoveAvatar}
                    />
                    <Label htmlFor={`remove-avatar-${user.id}`}>Remove the current photo</Label>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

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
          {state?.ok && state.warning ? (
            <Alert><AlertDescription>{state.warning}</AlertDescription></Alert>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {mode === "edit" && avatarFile ? <UploadIcon data-icon="inline-start" /> : null}
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
