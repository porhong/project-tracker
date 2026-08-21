"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { calculateCapacityHours, SPRINT_STATUS_LABELS, WEEKDAYS, workingDaysLabel } from "@/lib/sprint-config";
import { archiveSprint, createSprint, deleteSprint, reenableSprint, setSprintStatus, unarchiveSprint, updateSprint, type ActionResult } from "../actions";
import type { ActivityTypeRow, ProjectOption, SprintMemberActivityNoteRow, SprintMemberAllocationRow, SprintMemberRow, SprintMemberTimeOffRow, SprintMilestoneRow, SprintRow } from "../types";
import { ReleaseNotesDialog } from "./release-notes-dialog";
import { SprintMemberCapacityDialog } from "./sprint-member-capacity-dialog";
import { SprintMilestonesDialog } from "./sprint-milestones-dialog";

type Defaults = { working_days: number[]; daily_work_hours: number };
type FormProps = { mode: "create" | "edit"; sprint?: SprintRow; project: ProjectOption; defaults: Defaults; open: boolean; onOpenChange: (open: boolean) => void };

function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <Label htmlFor={htmlFor}>{children}<span aria-hidden="true" className="text-destructive">*</span><span className="sr-only"> required</span></Label>;
}

function toDate(value: string) {
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
}

function DatePicker({ id, name, value, min, onChange }: { id: string; name: string; value: string; min?: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selectedDate = toDate(value);
  const minDate = min ? toDate(min) : undefined;

  return <Popover open={open} onOpenChange={setOpen}>
    <input type="hidden" name={name} value={value} />
    <PopoverTrigger render={<Button id={id} type="button" variant="outline" className="h-8 w-full justify-between text-left font-normal" aria-required="true" />}>
      <span className={selectedDate ? undefined : "text-muted-foreground"}>{selectedDate ? format(selectedDate, "PPP") : "Select a date"}</span><CalendarIcon data-icon="inline-end" />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-0">
      <Calendar mode="single" selected={selectedDate} defaultMonth={selectedDate} disabled={minDate ? { before: minDate } : undefined} onSelect={(date) => { if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false); } }} />
    </PopoverContent>
  </Popover>;
}

function SprintFormDialog({ mode, sprint, project, defaults, open, onOpenChange }: FormProps) {
  const action = mode === "create" ? createSprint : updateSprint;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const projectId = sprint?.project_id ?? project.id;
  const [version, setVersion] = useState((sprint?.version ?? "v").replace(/^v/i, ""));
  const [workingDays, setWorkingDays] = useState<number[]>(sprint?.working_days ?? defaults.working_days);
  const [startDate, setStartDate] = useState(sprint?.start_date ?? ""); const [endDate, setEndDate] = useState(sprint?.end_date ?? ""); const [dailyHours, setDailyHours] = useState(String(sprint?.daily_work_hours ?? defaults.daily_work_hours));
  const capacity = calculateCapacityHours(startDate, endDate, workingDays, Number(dailyHours));
  useEffect(() => {
    if (state?.ok) {
      toast.success(mode === "create" ? "Sprint created successfully." : "Sprint updated successfully.");
      onOpenChange(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onOpenChange, mode]);
  const toggleDay = (day: number, checked: boolean) => setWorkingDays((current) => checked ? [...new Set([...current, day])].sort((a, b) => a - b) : current.filter((value) => value !== day));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{mode === "create" ? "Create sprint" : "Edit sprint"}</DialogTitle><DialogDescription>{mode === "create" ? "The workspace calendar pre-fills this sprint and is saved as its own snapshot." : "Completed sprints cannot be changed."}</DialogDescription></DialogHeader><form action={formAction} className="space-y-4">{sprint ? <input type="hidden" name="id" value={sprint.id} /> : null}<input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="working_days" value={workingDays.join(",")} /><input type="hidden" name="version" value={`v${version}`} />
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><RequiredLabel htmlFor="sprint-number">Sprint number</RequiredLabel><Input id="sprint-number" name="sprint_number" type="number" min={1} step={1} required defaultValue={sprint?.sprint_number} placeholder="1" /></div><div className="space-y-2"><RequiredLabel htmlFor="sprint-version">Version</RequiredLabel><InputGroup><InputGroupAddon><InputGroupText>v</InputGroupText></InputGroupAddon><InputGroupInput id="sprint-version" maxLength={79} required value={version} onChange={(event) => setVersion(event.target.value.replace(/^v/i, ""))} placeholder="1.0" /></InputGroup></div><div className="space-y-2"><RequiredLabel htmlFor="start-date">Start date</RequiredLabel><DatePicker id="start-date" name="start_date" value={startDate} onChange={(nextStartDate) => { setStartDate(nextStartDate); if (endDate && endDate < nextStartDate) setEndDate(""); }} /></div><div className="space-y-2"><RequiredLabel htmlFor="end-date">End date</RequiredLabel><DatePicker id="end-date" name="end_date" value={endDate} min={startDate || undefined} onChange={setEndDate} /></div></div>
    <div className="space-y-2"><Label htmlFor="sprint-description">Description</Label><Textarea id="sprint-description" name="description" maxLength={2000} defaultValue={sprint?.description ?? ""} placeholder="Goals and scope for this sprint" /></div>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">Working days</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{WEEKDAYS.map((day) => <label className="flex items-center gap-2 text-sm" key={day.value}><Checkbox checked={workingDays.includes(day.value)} onCheckedChange={(checked) => toggleDay(day.value, checked)} /><span>{day.shortLabel}</span></label>)}</div></fieldset>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><RequiredLabel htmlFor="daily-hours">Hours per working day</RequiredLabel><Input id="daily-hours" name="daily_work_hours" type="number" min="0.25" max="24" step="0.25" required value={dailyHours} onChange={(event) => setDailyHours(event.target.value)} /></div><div className="rounded-2xl border bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">Planned capacity</p><p className="text-lg font-semibold">{capacity.toLocaleString("en", { maximumFractionDigits: 2 })} hours</p></div></div>
    {state && !state.ok ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose><Button type="submit" disabled={pending || !projectId || workingDays.length === 0}>{pending ? "Saving…" : mode === "create" ? "Create sprint" : "Save changes"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}

export function SprintManager({
  project,
  sprints,
  defaults,
  activities,
  members,
  allocations,
  timeOff,
  activityNotes,
  milestones,
}: {
  project: ProjectOption;
  sprints: SprintRow[];
  defaults: Defaults;
  activities: ActivityTypeRow[];
  members: SprintMemberRow[];
  allocations: SprintMemberAllocationRow[];
  timeOff: SprintMemberTimeOffRow[];
  activityNotes: SprintMemberActivityNoteRow[];
  milestones: SprintMilestoneRow[];
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SprintRow | null>(null);
  const [editingReleaseNotes, setEditingReleaseNotes] = useState<SprintRow | null>(null);
  const [managingMilestones, setManagingMilestones] = useState<SprintRow | null>(null);
  const [managingCapacity, setManagingCapacity] = useState<SprintRow | null>(null);
  const [starting, setStarting] = useState<SprintRow | null>(null);
  const [completing, setCompleting] = useState<SprintRow | null>(null);
  const [reenabling, setReenabling] = useState<SprintRow | null>(null);
  const [reenablePassword, setReenablePassword] = useState("");
  const [reenableError, setReenableError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<SprintRow | null>(null);
  const [archivePassword, setArchivePassword] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SprintRow | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canCreate = project.status === "active";
  const run = (
    work: () => Promise<ActionResult>,
    onSuccess?: () => void,
    onError?: (error: string) => void,
    successMessage?: string,
  ) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error);
        if (onError) {
          onError(result.error);
        } else {
          setError(result.error);
        }
      } else {
        setError(null);
        if (successMessage) toast.success(successMessage);
        onSuccess?.();
      }
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{sprints.length} {sprints.length === 1 ? "sprint" : "sprints"}</p>
        <Button disabled={!canCreate} onClick={() => setCreating(true)}>
          <PlusIcon data-icon="inline-start" />
          Create sprint
        </Button>
      </div>
      {!canCreate ? <Alert><AlertDescription>Archived projects cannot receive new sprints.</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sprint</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sprints.map((sprint) => {
              const sprintMilestones = milestones.filter((m) => m.sprint_id === sprint.id);
              return (
                <TableRow key={sprint.id}>
                  <TableCell>
                    <p className="font-medium">Sprint #{sprint.sprint_number}</p>
                    <p className="max-w-xl truncate text-xs text-muted-foreground">
                      {sprint.version}
                      {sprint.description ? ` · ${sprint.description}` : ""}
                      {sprintMilestones.length > 0
                        ? ` · ${sprintMilestones.length} milestone${sprintMilestones.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sprint.start_date} — {sprint.end_date}
                    <p className="text-xs">{workingDaysLabel(sprint.working_days)} · {sprint.daily_work_hours}h/day</p>
                  </TableCell>
                  <TableCell>{Number(sprint.planned_capacity_hours).toLocaleString("en", { maximumFractionDigits: 2 })}h</TableCell>
                  <TableCell>
                    <Badge variant={sprint.status === "active" ? "default" : sprint.status === "completed" ? "secondary" : "outline"}>
                      {SPRINT_STATUS_LABELS[sprint.status as keyof typeof SPRINT_STATUS_LABELS] ?? sprint.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={pending} />}>
                        <MoreHorizontalIcon />
                        <span className="sr-only">Actions for sprint #{sprint.sprint_number}</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setManagingMilestones(sprint)}>
                          {sprint.status === "completed" || sprint.status === "archived" ? "View milestones" : "Manage milestones"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingReleaseNotes(sprint)}>
                          {sprint.status === "completed" || sprint.status === "archived" ? "View release notes" : "Edit release notes"}
                        </DropdownMenuItem>
                        {sprint.status !== "completed" && sprint.status !== "archived" ? (
                          <>
                            <DropdownMenuItem onClick={() => setManagingCapacity(sprint)}>Manage member capacity</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditing(sprint)}>Edit</DropdownMenuItem>
                          </>
                        ) : null}
                        {sprint.status === "draft" ? (
                          <DropdownMenuItem onClick={() => setStarting(sprint)}>Start sprint</DropdownMenuItem>
                        ) : null}
                        {sprint.status === "active" ? (
                          <DropdownMenuItem onClick={() => setCompleting(sprint)}>Complete sprint</DropdownMenuItem>
                        ) : null}
                        {sprint.status === "completed" ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setReenabling(sprint);
                              setReenablePassword("");
                              setReenableError(null);
                            }}
                          >
                            Re-enable sprint
                          </DropdownMenuItem>
                        ) : null}
                        {sprint.status === "archived" ? (
                          <DropdownMenuItem onClick={() => run(() => unarchiveSprint(sprint.id), undefined, undefined, "Sprint restored to draft.")}>Restore to draft</DropdownMenuItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        {sprint.status !== "archived" ? (
                          <DropdownMenuItem
                            onClick={() => {
                              setArchiving(sprint);
                              setArchivePassword("");
                              setArchiveError(null);
                            }}
                          >
                            Archive sprint
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleting(sprint);
                            setDeletePassword("");
                            setDeleteError(null);
                          }}
                        >
                          Delete sprint
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {creating ? <SprintFormDialog mode="create" project={project} defaults={defaults} open onOpenChange={setCreating} /> : null}
      {editing ? <SprintFormDialog mode="edit" sprint={editing} project={project} defaults={defaults} open onOpenChange={(open) => { if (!open) setEditing(null); }} /> : null}
      {editingReleaseNotes ? <ReleaseNotesDialog sprint={editingReleaseNotes} open onOpenChange={(open) => { if (!open) setEditingReleaseNotes(null); }} /> : null}
      {managingMilestones ? <SprintMilestonesDialog sprint={managingMilestones} milestones={milestones.filter((m) => m.sprint_id === managingMilestones.id)} open onOpenChange={(open) => { if (!open) setManagingMilestones(null); }} /> : null}
      {managingCapacity ? <SprintMemberCapacityDialog sprint={managingCapacity} activities={activities} members={members} allocations={allocations.filter((allocation) => allocation.sprint_id === managingCapacity.id)} timeOff={timeOff.filter((record) => record.sprint_id === managingCapacity.id)} activityNotes={activityNotes.filter((note) => note.sprint_id === managingCapacity.id)} open onOpenChange={(open) => { if (!open) setManagingCapacity(null); }} /> : null}

      <Dialog open={Boolean(starting)} onOpenChange={(open) => { if (!open) setStarting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start sprint #{starting?.sprint_number}?</DialogTitle>
            <DialogDescription>Starting this sprint activates it for team member capacity and activity tracking.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button disabled={pending} onClick={() => starting && run(() => setSprintStatus(starting.id, "active"), () => setStarting(null), undefined, `Sprint #${starting.sprint_number} started.`)}>
              {pending ? "Starting…" : "Start sprint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completing)} onOpenChange={(open) => { if (!open) setCompleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete sprint #{completing?.sprint_number}?</DialogTitle>
            <DialogDescription>Completed sprints become read-only. Sprint details and member capacity can no longer be edited.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button disabled={pending} onClick={() => completing && run(() => setSprintStatus(completing.id, "completed"), () => setCompleting(null), undefined, `Sprint #${completing.sprint_number} completed.`)}>
              {pending ? "Completing…" : "Complete sprint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reenabling)}
        onOpenChange={(open) => {
          if (!open) {
            setReenabling(null);
            setReenablePassword("");
            setReenableError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-enable sprint #{reenabling?.sprint_number}?</DialogTitle>
            <DialogDescription>
              This will set the sprint back to active, allowing team members to update their capacity planning and activity records. Enter your admin password to confirm.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!reenabling || !reenablePassword) return;
              setReenableError(null);
              run(
                () => reenableSprint(reenabling.id, reenablePassword),
                () => {
                  setReenabling(null);
                  setReenablePassword("");
                  setReenableError(null);
                },
                (err) => setReenableError(err),
                `Sprint #${reenabling.sprint_number} re-enabled.`,
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="reenable-password">Admin password</Label>
              <Input
                id="reenable-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={reenablePassword}
                onChange={(e) => setReenablePassword(e.target.value)}
              />
            </div>
            {reenableError ? (
              <Alert variant="destructive">
                <AlertDescription>{reenableError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending || !reenablePassword.trim()}>
                {pending ? "Re-enabling…" : "Re-enable sprint"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(archiving)}
        onOpenChange={(open) => {
          if (!open) {
            setArchiving(null);
            setArchivePassword("");
            setArchiveError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive sprint #{archiving?.sprint_number}?</DialogTitle>
            <DialogDescription>
              Archiving this sprint makes its capacity and activity history read-only. Enter your admin password to confirm.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!archiving || !archivePassword) return;
              setArchiveError(null);
              run(
                () => archiveSprint(archiving.id, archivePassword),
                () => {
                  setArchiving(null);
                  setArchivePassword("");
                  setArchiveError(null);
                },
                (err) => setArchiveError(err),
                `Sprint #${archiving.sprint_number} archived.`,
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="archive-password">Admin password</Label>
              <Input
                id="archive-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={archivePassword}
                onChange={(e) => setArchivePassword(e.target.value)}
              />
            </div>
            {archiveError ? (
              <Alert variant="destructive">
                <AlertDescription>{archiveError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending || !archivePassword.trim()}>
                {pending ? "Archiving…" : "Archive sprint"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeletePassword("");
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sprint #{deleting?.sprint_number}?</DialogTitle>
            <DialogDescription>
              This permanently deletes sprint #{deleting?.sprint_number} along with all planned member capacity and activity notes. This action cannot be undone. Enter your admin password to confirm.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!deleting || !deletePassword) return;
              setDeleteError(null);
              run(
                () => deleteSprint(deleting.id, deletePassword),
                () => {
                  setDeleting(null);
                  setDeletePassword("");
                  setDeleteError(null);
                },
                (err) => setDeleteError(err),
                `Sprint #${deleting.sprint_number} deleted.`,
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="delete-password">Admin password</Label>
              <Input
                id="delete-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </div>
            {deleteError ? (
              <Alert variant="destructive">
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" variant="destructive" disabled={pending || !deletePassword.trim()}>
                {pending ? "Deleting…" : "Delete sprint"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
