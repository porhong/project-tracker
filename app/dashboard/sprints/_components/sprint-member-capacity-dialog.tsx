"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countAvailableSprintDays, memberAvailableHours } from "@/lib/sprint-capacity";
import { saveSprintMemberPlan, type ActionResult } from "../actions";
import type { ActivityTypeRow, SprintMemberActivityNoteRow, SprintMemberAllocationRow, SprintMemberRow, SprintMemberTimeOffRow, SprintRow } from "../types";

type TimeOffDraft = { start_date: string; end_date: string };
type ActivityNoteDraft = { activity: string; note: string };

const hours = (value: number) => value.toLocaleString("en", { maximumFractionDigits: 2 });

export function SprintMemberCapacityDialog({
  sprint,
  activities,
  members,
  allocations,
  timeOff,
  activityNotes,
  open,
  onOpenChange,
}: {
  sprint: SprintRow;
  activities: ActivityTypeRow[];
  members: SprintMemberRow[];
  allocations: SprintMemberAllocationRow[];
  timeOff: SprintMemberTimeOffRow[];
  activityNotes: SprintMemberActivityNoteRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeActivities = activities.filter((activity) => activity.is_active);
  const [allocationValues, setAllocationValues] = useState<Record<string, string>>(() => Object.fromEntries(allocations.map((allocation) => [`${allocation.user_id}:${allocation.activity_id}`, String(allocation.hours)])));
  const [timeOffValues, setTimeOffValues] = useState<Record<string, TimeOffDraft[]>>(() => {
    const grouped: Record<string, TimeOffDraft[]> = {};
    timeOff.forEach((record) => { (grouped[record.user_id] ??= []).push({ start_date: record.start_date, end_date: record.end_date }); });
    return grouped;
  });
  const [notesValues, setNotesValues] = useState<Record<string, ActivityNoteDraft[]>>(() => {
    const grouped: Record<string, ActivityNoteDraft[]> = {};
    activityNotes.forEach((record) => { (grouped[record.user_id] ??= []).push({ activity: record.activity, note: record.note ?? "" }); });
    return grouped;
  });
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(saveSprintMemberPlan, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Member capacity plan saved.");
      onOpenChange(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [onOpenChange, state]);

  const payload = useMemo(() => ({
    allocations: Object.entries(allocationValues).flatMap(([key, value]) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) return [];
      const [user_id, activity_id] = key.split(":");
      return [{ user_id, activity_id, hours: parsed }];
    }),
    timeOff: Object.entries(timeOffValues).flatMap(([user_id, ranges]) => ranges.filter((range) => range.start_date && range.end_date).map((range) => ({ user_id, ...range }))),
    notes: Object.entries(notesValues).flatMap(([user_id, notes]) => notes.filter((note) => note.activity.trim()).map((note) => ({ user_id, activity: note.activity, note: note.note }))),
  }), [allocationValues, notesValues, timeOffValues]);

  const updateAllocation = (userId: string, activityId: string, value: string) => setAllocationValues((current) => ({ ...current, [`${userId}:${activityId}`]: value }));
  const updateTimeOff = (userId: string, index: number, field: keyof TimeOffDraft, value: string) => setTimeOffValues((current) => ({ ...current, [userId]: (current[userId] ?? []).map((range, rangeIndex) => rangeIndex === index ? { ...range, [field]: value } : range) }));
  const addTimeOff = (userId: string) => setTimeOffValues((current) => ({ ...current, [userId]: [...(current[userId] ?? []), { start_date: "", end_date: "" }] }));
  const removeTimeOff = (userId: string, index: number) => setTimeOffValues((current) => ({ ...current, [userId]: (current[userId] ?? []).filter((_, rangeIndex) => rangeIndex !== index) }));
  const updateNote = (userId: string, index: number, field: keyof ActivityNoteDraft, value: string) => setNotesValues((current) => ({ ...current, [userId]: (current[userId] ?? []).map((note, noteIndex) => noteIndex === index ? { ...note, [field]: value } : note) }));
  const addNote = (userId: string) => setNotesValues((current) => ({ ...current, [userId]: [...(current[userId] ?? []), { activity: "", note: "" }] }));
  const removeNote = (userId: string, index: number) => setNotesValues((current) => ({ ...current, [userId]: (current[userId] ?? []).filter((_, noteIndex) => noteIndex !== index) }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>Member capacity · Sprint #{sprint.sprint_number}</DialogTitle><DialogDescription>Record each member’s planned sprint hours and work activity in one place. Allocations may be saved before they match available hours.</DialogDescription></DialogHeader><form action={formAction} className="space-y-5"><input type="hidden" name="id" value={sprint.id} /><input type="hidden" name="allocations" value={JSON.stringify(payload.allocations)} /><input type="hidden" name="time_off" value={JSON.stringify(payload.timeOff)} /><input type="hidden" name="activity_notes" value={JSON.stringify(payload.notes)} />{members.length === 0 ? <Alert><AlertDescription>Add active members to this project before creating its sprint capacity plan.</AlertDescription></Alert> : members.map((member) => {
    const memberTimeOff = timeOffValues[member.id] ?? [];
    const memberNotes = notesValues[member.id] ?? [];
    const availableDays = countAvailableSprintDays(sprint, memberTimeOff);
    const availableHours = memberAvailableHours(sprint, memberTimeOff);
    const allocatedHours = activeActivities.reduce((total, activity) => total + (Number(allocationValues[`${member.id}:${activity.id}`]) || 0), 0);
    const remainingHours = availableHours - allocatedHours;
    return <Card key={member.id} size="sm"><CardHeader><CardTitle>{member.full_name || member.email}</CardTitle><CardDescription>{member.competency || "No competency recorded"} · {availableDays} available work days</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">Available</p><p className="font-semibold tabular-nums">{hours(availableHours)}h</p></div><div className="rounded-2xl border bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">Allocated</p><p className="font-semibold tabular-nums">{hours(allocatedHours)}h</p></div><div className="rounded-2xl border bg-muted/40 px-3 py-2"><p className="text-xs text-muted-foreground">{remainingHours < 0 ? "Over capacity" : remainingHours > 0 ? "Unallocated" : "Matched"}</p><p className={remainingHours !== 0 ? "font-semibold tabular-nums text-destructive" : "font-semibold tabular-nums"}>{hours(Math.abs(remainingHours))}h</p></div></div>{remainingHours !== 0 ? <Alert variant={remainingHours < 0 ? "destructive" : "default"}><AlertDescription>{remainingHours < 0 ? "This plan exceeds available sprint hours, but it can still be saved." : "This member still has unallocated sprint hours, but the plan can still be saved."}</AlertDescription></Alert> : null}<fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="text-sm font-medium">Total hours for this sprint</legend>{activeActivities.map((activity) => <div key={activity.id} className="space-y-2"><Label htmlFor={`${member.id}-${activity.id}`}>{activity.name}</Label><Input id={`${member.id}-${activity.id}`} type="number" min="0" step="0.25" value={allocationValues[`${member.id}:${activity.id}`] ?? ""} onChange={(event) => updateAllocation(member.id, activity.id, event.target.value)} placeholder="0" /></div>)}</fieldset><div className="space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">Activity notes</p><Button type="button" variant="outline" size="sm" onClick={() => addNote(member.id)}><PlusIcon data-icon="inline-start" />Add activity note</Button></div><p className="text-xs text-muted-foreground">Record completed or in-progress work, such as “Research & development”, “Frontend development”, or “Backend development”.</p>{memberNotes.map((note, index) => <div key={`${member.id}-note-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="grid gap-2"><div className="space-y-1"><Label htmlFor={`${member.id}-activity-note-${index}`} className="text-xs">Activity</Label><Input id={`${member.id}-activity-note-${index}`} maxLength={160} value={note.activity} onChange={(event) => updateNote(member.id, index, "activity", event.target.value)} placeholder="Frontend development" /></div><div className="space-y-1"><Label htmlFor={`${member.id}-note-detail-${index}`} className="text-xs">Details (optional)</Label><Textarea id={`${member.id}-note-detail-${index}`} maxLength={2000} value={note.note} onChange={(event) => updateNote(member.id, index, "note", event.target.value)} placeholder="What was completed, investigated, or handed off?" /></div></div><Button type="button" variant="ghost" size="icon-sm" className="self-start sm:mt-5" onClick={() => removeNote(member.id, index)}><Trash2Icon /><span className="sr-only">Remove activity note</span></Button></div>)}</div><div className="space-y-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">Time off</p><Button type="button" variant="outline" size="sm" onClick={() => addTimeOff(member.id)}><PlusIcon data-icon="inline-start" />Add time off</Button></div>{memberTimeOff.map((range, index) => <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={`${member.id}-time-off-${index}`}><div className="space-y-1"><Label htmlFor={`${member.id}-start-${index}`} className="text-xs">Start</Label><Input id={`${member.id}-start-${index}`} type="date" min={sprint.start_date} max={sprint.end_date} value={range.start_date} onChange={(event) => updateTimeOff(member.id, index, "start_date", event.target.value)} /></div><div className="space-y-1"><Label htmlFor={`${member.id}-end-${index}`} className="text-xs">End</Label><Input id={`${member.id}-end-${index}`} type="date" min={sprint.start_date} max={sprint.end_date} value={range.end_date} onChange={(event) => updateTimeOff(member.id, index, "end_date", event.target.value)} /></div><Button type="button" variant="ghost" size="icon-sm" className="self-end" onClick={() => removeTimeOff(member.id, index)}><Trash2Icon /><span className="sr-only">Remove time off</span></Button></div>)}</div></CardContent></Card>;
  })}{state && !state.ok ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose><Button type="submit" disabled={pending || members.length === 0}>{pending ? "Saving…" : "Save capacity plan"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
