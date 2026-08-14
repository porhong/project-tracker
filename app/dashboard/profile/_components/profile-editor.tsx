"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
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
import { AVATAR_ACCEPT, AVATAR_BUCKET, createAvatarPath, validateAvatarFile } from "@/lib/profile/avatar";
import { createClient } from "@/lib/supabase/client";
import { removeMyAvatar, updateMyProfile } from "../actions";

type Props = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    competency: string | null;
    avatarPath: string | null;
  };
  avatarUrl: string | null;
};

export function ProfileEditor({ user, avatarUrl }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; warning?: string } | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [pending, startTransition] = useTransition();

  const chooseFile = (file: File | null) => {
    if (!file) return;
    const error = validateAvatarFile(file);
    if (error) {
      toast.error(error);
      setMessage({ error });
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMessage(null);
  };

  const save = (formData: FormData) => {
    startTransition(async () => {
      setMessage(null);
      if (selectedFile) {
        const validationError = validateAvatarFile(selectedFile);
        if (validationError) {
          toast.error(validationError);
          setMessage({ error: validationError });
          return;
        }
        const avatarPath = createAvatarPath(user.id, selectedFile);
        const { error: uploadError } = await createClient().storage
          .from(AVATAR_BUCKET)
          .upload(avatarPath, selectedFile, {
            contentType: selectedFile.type,
            upsert: false,
          });
        if (uploadError) {
          const msg = `Could not upload profile photo: ${uploadError.message}`;
          toast.error(msg);
          setMessage({ error: msg });
          return;
        }
        formData.set("avatar_path", avatarPath);
      }

      const result = await updateMyProfile(formData);
      if (!result.ok) {
        toast.error(result.error);
        setMessage({ error: result.error });
      } else {
        toast.success("Profile saved.");
        setSelectedFile(null);
        setMessage(result.warning ? { warning: result.warning } : null);
      }
    });
  };

  const removeAvatar = () => {
    startTransition(async () => {
      const result = await removeMyAvatar();
      setConfirmingRemoval(false);
      if (!result.ok) {
        toast.error(result.error);
        setMessage({ error: result.error });
      } else {
        toast.success("Profile photo removed.");
        setMessage(result.warning ? { warning: result.warning } : null);
      }
    });
  };

  const displayedUrl = previewUrl ?? avatarUrl;

  return (
    <>
      <form action={save} className="max-w-xl space-y-6">
        <input type="hidden" name="avatar_path" value={user.avatarPath ?? ""} />

        <div className="flex items-center gap-4">
          <ProfileAvatar
            name={user.fullName}
            email={user.email}
            url={displayedUrl}
            size="lg"
          />
          <div className="space-y-2">
            <Label htmlFor="profile-avatar">Profile photo</Label>
            <Input
              ref={fileInput}
              id="profile-avatar"
              type="file"
              accept={AVATAR_ACCEPT}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, or WebP; 5 MB maximum.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-full-name">Full name</Label>
          <Input
            id="profile-full-name"
            name="full_name"
            defaultValue={user.fullName ?? ""}
            maxLength={120}
            placeholder="Ada Lovelace"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-competency">Competency</Label>
          <Input
            id="profile-competency"
            name="competency"
            defaultValue={user.competency ?? ""}
            maxLength={120}
            placeholder="Frontend engineering"
          />
          <p className="text-xs text-muted-foreground">Optional primary area of expertise.</p>
        </div>

        {user.avatarPath ? (
          <div className="flex items-center gap-2 text-sm">
            <Checkbox id="delete-previous-avatar" name="delete_previous_avatar" defaultChecked />
            <Label htmlFor="delete-previous-avatar">Delete the previous photo when replacing it</Label>
          </div>
        ) : null}

        {message?.error ? (
          <Alert variant="destructive"><AlertDescription>{message.error}</AlertDescription></Alert>
        ) : null}
        {message?.warning ? (
          <Alert><AlertDescription>{message.warning}</AlertDescription></Alert>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            <UploadIcon data-icon="inline-start" />
            {pending ? "Saving…" : "Save profile"}
          </Button>
          {user.avatarPath ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirmingRemoval(true)}>
              <Trash2Icon data-icon="inline-start" />
              Remove photo
            </Button>
          ) : null}
        </div>
      </form>

      <Dialog open={confirmingRemoval} onOpenChange={setConfirmingRemoval}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove profile photo?</DialogTitle>
            <DialogDescription>This permanently deletes the current private photo.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" disabled={pending} onClick={removeAvatar}>
              {pending ? "Removing…" : "Remove photo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
