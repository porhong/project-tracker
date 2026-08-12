"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { archiveProject, createProject, updateProject, type ActionResult } from "../actions";
import type { ProjectRow } from "../types";

type DialogProps = { mode: "create" | "edit"; project?: ProjectRow; open: boolean; onOpenChange: (open: boolean) => void };

function ProjectFormDialog({ mode, project, open, onOpenChange }: DialogProps) {
  const action = mode === "create" ? createProject : updateProject;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  useEffect(() => { if (state?.ok) onOpenChange(false); }, [state, onOpenChange]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent><DialogHeader><DialogTitle>{mode === "create" ? "Add project" : "Edit project"}</DialogTitle><DialogDescription>Projects organize sprint history and planning.</DialogDescription></DialogHeader>
      <form action={formAction} className="space-y-4">
        {project ? <input type="hidden" name="id" value={project.id} /> : null}
        <div className="space-y-2"><Label htmlFor="project-name">Name</Label><Input id="project-name" name="name" required maxLength={160} defaultValue={project?.name ?? ""} placeholder="Mobile app" /></div>
        <div className="space-y-2"><Label htmlFor="project-description">Description</Label><Textarea id="project-description" name="description" maxLength={2000} defaultValue={project?.description ?? ""} placeholder="Optional project context" /></div>
        {state && !state.ok ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose><Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function ProjectManager({ projects }: { projects: ProjectRow[] }) {
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<ProjectRow | null>(null); const [archiving, setArchiving] = useState<ProjectRow | null>(null); const [error, setError] = useState<string | null>(null); const [pending, startTransition] = useTransition();
  const runArchive = () => { if (!archiving) return; startTransition(async () => { const result = await archiveProject(archiving.id); if (result.ok) setArchiving(null); else setError(result.error); }); };
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">{projects.length} {projects.length === 1 ? "project" : "projects"}</p><Button onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />Add project</Button></div>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    <div className="overflow-x-auto rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-0" /></TableRow></TableHeader><TableBody>{projects.map((project) => <TableRow key={project.id}><TableCell><p className="font-medium">{project.name}</p>{project.description ? <p className="max-w-xl truncate text-xs text-muted-foreground">{project.description}</p> : null}</TableCell><TableCell><Badge variant={project.status === "active" ? "outline" : "secondary"}>{project.status === "active" ? "Active" : "Archived"}</Badge></TableCell><TableCell className="text-muted-foreground">{new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(project.created_at))}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}><MoreHorizontalIcon /><span className="sr-only">Actions for {project.name}</span></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => setEditing(project)}>Edit</DropdownMenuItem>{project.status === "active" ? <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setArchiving(project)}>Archive</DropdownMenuItem></> : null}</DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table></div>
    {creating ? <ProjectFormDialog mode="create" open onOpenChange={setCreating} /> : null}{editing ? <ProjectFormDialog mode="edit" project={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} /> : null}
    <Dialog open={Boolean(archiving)} onOpenChange={(open) => { if (!open) setArchiving(null); }}><DialogContent><DialogHeader><DialogTitle>Archive {archiving?.name}?</DialogTitle><DialogDescription>Its sprint history remains available, but no new sprint can be created for it.</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button variant="destructive" disabled={pending} onClick={runArchive}>{pending ? "Archiving…" : "Archive project"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
