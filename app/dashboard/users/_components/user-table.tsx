"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/auth/roles";
import type { UserRow } from "../types";
import { UserFormDialog } from "./user-form-dialog";
import { UserRowActions } from "./user-row-actions";

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function UserTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {users.length} {users.length === 1 ? "account" : "accounts"}
        </p>
        <Button onClick={() => setCreating(true)}>
          {/* `data-icon` is what the preset's size variants key their
              leading/trailing padding off of. */}
          <PlusIcon data-icon="inline-start" />
          Add user
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Competency</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.full_name || "—"}
                  {user.id === currentUserId ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (you)
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.email}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.competency || "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === "admin" ? "default" : "secondary"}
                  >
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      user.status === "suspended" ? "destructive" : "outline"
                    }
                  >
                    {STATUS_LABELS[user.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateFormat.format(new Date(user.created_at))}
                </TableCell>
                <TableCell>
                  <UserRowActions
                    user={user}
                    isSelf={user.id === currentUserId}
                    onEdit={() => {
                      setError(null);
                      setEditing(user);
                    }}
                    onError={setError}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {creating ? (
        <UserFormDialog
          key="create"
          mode="create"
          open
          onOpenChange={(open) => setCreating(open)}
        />
      ) : null}

      {editing ? (
        <UserFormDialog
          key={editing.id}
          mode="edit"
          user={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
