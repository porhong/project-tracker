"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAYS } from "@/lib/sprint-config";
import { updateWorkspaceSettings, type ActionResult } from "../actions";

type Settings = { working_days: number[]; daily_work_hours: number };

export function WorkspaceScheduleForm({ settings }: { settings: Settings }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(updateWorkspaceSettings, null);
  const [workingDays, setWorkingDays] = useState(settings.working_days);
  const toggleDay = (day: number, checked: boolean) => setWorkingDays((current) => checked ? [...new Set([...current, day])].sort((a, b) => a - b) : current.filter((value) => value !== day));
  return <Card className="max-w-2xl"><CardHeader><CardTitle>Default work calendar</CardTitle><CardDescription>These values prefill future sprints. Existing sprint capacity stays based on the saved schedule snapshot.</CardDescription></CardHeader><CardContent><form action={formAction} className="space-y-6"><input type="hidden" name="working_days" value={workingDays.join(",")} /><fieldset className="space-y-3"><legend className="text-sm font-medium">Working days</legend><div className="flex flex-wrap gap-x-5 gap-y-3">{WEEKDAYS.map((day) => <label className="flex items-center gap-2 text-sm" key={day.value}><Checkbox checked={workingDays.includes(day.value)} onCheckedChange={(checked) => toggleDay(day.value, checked)} /><span>{day.label}</span></label>)}</div></fieldset><div className="max-w-xs space-y-2"><Label htmlFor="default-daily-hours">Hours per working day</Label><Input id="default-daily-hours" name="daily_work_hours" type="number" min="0.25" max="24" step="0.25" required defaultValue={settings.daily_work_hours} /></div>{state && !state.ok ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}{state?.ok ? <Alert><AlertDescription>Defaults saved. They apply to new sprints only.</AlertDescription></Alert> : null}<Button type="submit" disabled={pending || workingDays.length === 0}>{pending ? "Saving…" : "Save defaults"}</Button></form></CardContent></Card>;
}
