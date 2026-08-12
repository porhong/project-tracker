"use client";

import { useState, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteUser, setUserStatus, type ActionResult } from "../actions";
import type { UserRow } from "../types";

type Props = {
  user: UserRow;
  isSelf: boolean;
  onEdit: () => void;
  onError: (message: string) => void;
};

export function UserRowActions({ user, isSelf, onEdit, onError }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const suspended = user.status === "suspended";

  const run = (work: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) onError(result.error);
      else setConfirmingDelete(false);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" disabled={pending} />}
        >
          <MoreHorizontalIcon />
          <span className="sr-only">Actions for {user.email}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuItem
            disabled={isSelf}
            onClick={() =>
              run(() =>
                setUserStatus(user.id, suspended ? "active" : "suspended"),
              )
            }
          >
            {suspended ? "Reactivate" : "Suspend"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={isSelf}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(next) => setConfirmingDelete(next)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {user.email}?</DialogTitle>
            <DialogDescription>
              This permanently removes the account and its profile. Any access
              token already issued to them stays valid until it expires.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => deleteUser(user.id))}
            >
              {pending ? "Deleting…" : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
