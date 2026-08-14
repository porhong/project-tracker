"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { memberAvailableHours } from "@/lib/sprint-capacity";
import { saveMyActiveSprintPlan, type ActionResult } from "../actions";

type Allocation = { activity_id: string; hours: number };
type TimeOff = { start_date: string; end_date: string };
type Note = { activity: string; note: string | null };

type Props = {
  sprintId: string;
  startDate: string;
  endDate: string;
  workingDays: number[];
  dailyWorkHours: number;
  activities: { id: string; name: string }[];
  allocations: Allocation[];
  timeOff: TimeOff[];
  notes: Note[];
};

export function MySprintActivityEditor({
  sprintId,
  startDate,
  endDate,
  workingDays,
  dailyWorkHours,
  activities,
  allocations,
  timeOff,
  notes,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveMyActiveSprintPlan,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Sprint activity saved.");
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state]);
  const [allocationValues, setAllocationValues] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        allocations.map((allocation) => [
          allocation.activity_id,
          String(allocation.hours),
        ]),
      ),
  );
  const [timeOffValues, setTimeOffValues] = useState<TimeOff[]>(timeOff);
  const [notesValues, setNotesValues] = useState<Note[]>(notes);

  const payload = useMemo(
    () => ({
      allocations: Object.entries(allocationValues).flatMap(
        ([activity_id, value]) => {
          const hours = Number(value);
          return Number.isFinite(hours) && hours > 0
            ? [{ activity_id, hours }]
            : [];
        },
      ),
      timeOff: timeOffValues.filter(
        (range) => range.start_date && range.end_date,
      ),
      notes: notesValues.filter((note) => note.activity.trim()),
    }),
    [allocationValues, notesValues, timeOffValues],
  );
  const availableHours = memberAvailableHours(
    {
      start_date: startDate,
      end_date: endDate,
      working_days: workingDays,
      daily_work_hours: dailyWorkHours,
    },
    payload.timeOff,
  );
  const allocatedHours = payload.allocations.reduce(
    (total, allocation) => total + allocation.hours,
    0,
  );
  const remainingHours = Math.round((availableHours - allocatedHours) * 100) / 100;
  const matchesAvailableHours = remainingHours === 0;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="sprint_id" value={sprintId} />
      <input type="hidden" name="allocations" value={JSON.stringify(payload.allocations)} />
      <input type="hidden" name="time_off" value={JSON.stringify(payload.timeOff)} />
      <input type="hidden" name="activity_notes" value={JSON.stringify(payload.notes)} />

      <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="text-sm font-medium">Total hours for this sprint</legend>
        {activities.map((activity) => (
          <div key={activity.id} className="space-y-2">
            <Label htmlFor={`${sprintId}-${activity.id}`}>{activity.name}</Label>
            <Input
              id={`${sprintId}-${activity.id}`}
              type="number"
              min="0"
              step="0.25"
              value={allocationValues[activity.id] ?? ""}
              onChange={(event) =>
                setAllocationValues((current) => ({
                  ...current,
                  [activity.id]: event.target.value,
                }))
              }
              placeholder="0"
            />
          </div>
        ))}
      </fieldset>
      <Alert variant={remainingHours < 0 ? "destructive" : "default"}>
        <AlertDescription>
          Available: {availableHours}h · Allocated: {allocatedHours}h
          {matchesAvailableHours
            ? " · Your allocation matches available hours."
            : remainingHours < 0
              ? ` · This exceeds availability by ${Math.abs(remainingHours)}h, but you can still save it.`
              : ` · ${remainingHours}h remains unallocated; you can still save your activity.`}
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Activity notes</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setNotesValues((current) => [
                ...current,
                { activity: "", note: "" },
              ])
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add activity note
          </Button>
        </div>
        {notesValues.map((note, index) => (
          <div
            key={`${note.activity}-${index}`}
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="grid gap-2">
              <Input
                aria-label="Activity"
                maxLength={160}
                value={note.activity}
                onChange={(event) =>
                  setNotesValues((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, activity: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Activity"
              />
              <Textarea
                aria-label="Activity details"
                maxLength={2000}
                value={note.note ?? ""}
                onChange={(event) =>
                  setNotesValues((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, note: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Details (optional)"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="self-start"
              onClick={() =>
                setNotesValues((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              <Trash2Icon />
              <span className="sr-only">Remove activity note</span>
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Time off</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setTimeOffValues((current) => [
                ...current,
                { start_date: "", end_date: "" },
              ])
            }
          >
            <PlusIcon data-icon="inline-start" />
            Add time off
          </Button>
        </div>
        {timeOffValues.map((range, index) => (
          <div
            key={`${range.start_date}-${range.end_date}-${index}`}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <Input
              aria-label="Time-off start date"
              type="date"
              min={startDate}
              max={endDate}
              value={range.start_date}
              onChange={(event) =>
                setTimeOffValues((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, start_date: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <Input
              aria-label="Time-off end date"
              type="date"
              min={startDate}
              max={endDate}
              value={range.end_date}
              onChange={(event) =>
                setTimeOffValues((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, end_date: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                setTimeOffValues((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              <Trash2Icon />
              <span className="sr-only">Remove time off</span>
            </Button>
          </div>
        ))}
      </div>

      {state && !state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert>
          <AlertDescription>Your sprint activity has been saved.</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save my sprint activity"}
      </Button>
    </form>
  );
}
