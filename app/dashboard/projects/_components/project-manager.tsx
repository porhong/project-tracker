"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { MoreHorizontalIcon, PlusIcon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveProject,
  assignProjectMember,
  createProject,
  removeProjectMember,
  updateProject,
  type ActionResult,
} from "../actions";
import type { ProjectMemberRow, ProjectRow, UserOption } from "../types";

type DialogProps = {
  mode: "create" | "edit";
  project?: ProjectRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const dateFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function userLabel(user: UserOption) {
  return user.full_name || user.email;
}

function ProjectFormDialog({ mode, project, open, onOpenChange }: DialogProps) {
  const action = mode === "create" ? createProject : updateProject;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(mode === "create" ? "Project created successfully." : "Project updated successfully.");
      onOpenChange(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onOpenChange, mode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add project" : "Edit project"}</DialogTitle>
          <DialogDescription>
            Projects organize sprint history, planning, and team assignments.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {project ? <input type="hidden" name="id" value={project.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              name="name"
              required
              maxLength={160}
              defaultValue={project?.name ?? ""}
              placeholder="Mobile app"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              name="description"
              maxLength={2000}
              defaultValue={project?.description ?? ""}
              placeholder="Optional project context"
            />
          </div>
          {state && !state.ok ? (
            <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectMembersDialog({
  project,
  members,
  users,
  open,
  onOpenChange,
}: {
  project: ProjectRow;
  members: ProjectMemberRow[];
  users: UserOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    assignProjectMember,
    null,
  );
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [isRemoving, startTransition] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      toast.success("User assigned to project.");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);

  const memberIds = useMemo(
    () => new Set(members.filter((member) => member.project_id === project.id).map((member) => member.user_id)),
    [members, project.id],
  );
  const assignedUsers = users.filter((user) => memberIds.has(user.id));
  const availableUsers = users.filter((user) => !memberIds.has(user.id));

  const removeMember = (userId: string) => {
    setRemovalError(null);
    startTransition(async () => {
      const result = await removeProjectMember(project.id, userId);
      if (!result.ok) {
        toast.error(result.error);
        setRemovalError(result.error);
      } else {
        toast.success("User removed from project.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members · {project.name}</DialogTitle>
          <DialogDescription>
            Assign active users to this project. Removing an assignment does not remove the user account.
          </DialogDescription>
        </DialogHeader>

        {project.status === "active" ? (
          <form
            action={(formData) => {
              setSelectedUserId("");
              formAction(formData);
            }}
            className="space-y-3"
          >
            <input type="hidden" name="project_id" value={project.id} />
            <input type="hidden" name="user_id" value={selectedUserId} />
            <div className="space-y-2">
              <Label htmlFor="project-member">Add user</Label>
              <Select value={selectedUserId} onValueChange={(value) => setSelectedUserId(value ?? "")}>
                <SelectTrigger id="project-member" className="w-full">
                  <SelectValue>
                    {(value) => {
                      const user = users.find((candidate) => candidate.id === value);
                      return user ? userLabel(user) : "Select a user";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {userLabel(user)}{user.competency ? ` · ${user.competency}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={pending || !selectedUserId}>
              <UserPlusIcon data-icon="inline-start" />
              {pending ? "Assigning…" : "Assign user"}
            </Button>
          </form>
        ) : (
          <Alert><AlertDescription>Archived projects cannot receive new members.</AlertDescription></Alert>
        )}

        {state && !state.ok ? (
          <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
        ) : null}
        {removalError ? (
          <Alert variant="destructive"><AlertDescription>{removalError}</AlertDescription></Alert>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Assigned users</h3>
          {assignedUsers.length ? (
            <ul className="divide-y rounded-2xl border">
              {assignedUsers.map((user) => (
                <li key={user.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{userLabel(user)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.competency || user.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={isRemoving}
                    onClick={() => removeMember(user.id)}
                  >
                    <XIcon />
                    <span className="sr-only">Remove {userLabel(user)} from {project.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No users are assigned yet.</p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectManager({
  projects,
  members,
  users,
}: {
  projects: ProjectRow[];
  members: ProjectMemberRow[];
  users: UserOption[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [managingMembers, setManagingMembers] = useState<ProjectRow | null>(null);
  const [archiving, setArchiving] = useState<ProjectRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const memberCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    members.forEach((member) => counts.set(member.project_id, (counts.get(member.project_id) ?? 0) + 1));
    return counts;
  }, [members]);

  const runArchive = () => {
    if (!archiving) return;
    startTransition(async () => {
      const result = await archiveProject(archiving.id);
      if (result.ok) {
        toast.success(`Project ${archiving.name} archived.`);
        setArchiving(null);
      } else {
        toast.error(result.error);
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon data-icon="inline-start" />
          Add project
        </Button>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Members</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-0" /></TableRow></TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell><p className="font-medium">{project.name}</p>{project.description ? <p className="max-w-xl truncate text-xs text-muted-foreground">{project.description}</p> : null}</TableCell>
                <TableCell className="text-muted-foreground">{memberCountByProject.get(project.id) ?? 0}</TableCell>
                <TableCell><Badge variant={project.status === "active" ? "outline" : "secondary"}>{project.status === "active" ? "Active" : "Archived"}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{dateFormat.format(new Date(project.created_at))}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}><MoreHorizontalIcon /><span className="sr-only">Actions for {project.name}</span></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setManagingMembers(project)}>Manage members</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditing(project)}>Edit</DropdownMenuItem>
                      {project.status === "active" ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setArchiving(project)}>Archive</DropdownMenuItem></> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {creating ? <ProjectFormDialog mode="create" open onOpenChange={setCreating} /> : null}
      {editing ? <ProjectFormDialog mode="edit" project={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} /> : null}
      {managingMembers ? <ProjectMembersDialog project={managingMembers} members={members} users={users} open onOpenChange={(open) => { if (!open) setManagingMembers(null); }} /> : null}
      <Dialog open={Boolean(archiving)} onOpenChange={(open) => { if (!open) setArchiving(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Archive {archiving?.name}?</DialogTitle><DialogDescription>Its sprint history and member assignments remain available, but no new sprint or member assignment can be created.</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button variant="destructive" disabled={pending} onClick={runArchive}>{pending ? "Archiving…" : "Archive project"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
