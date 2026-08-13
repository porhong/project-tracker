"use client";

import { useActionState, useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/lib/supabase/database.types";
import { createActivity, setActivityActive, type ActionResult } from "../actions";

type Activity = Pick<Tables<"activity_types">, "id" | "name" | "is_active">;

export function ActivityManager({ activities }: { activities: Activity[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(createActivity, null);
  const [error, setError] = useState<string | null>(null);
  const [changing, startTransition] = useTransition();

  const toggle = (activity: Activity) => startTransition(async () => {
    const result = await setActivityActive(activity.id, !activity.is_active);
    setError(result.ok ? null : result.error);
  });

  return <Card className="max-w-2xl"><CardHeader><CardTitle>Work activities</CardTitle><CardDescription>Use a shared activity list so sprint capacity rollups stay consistent. Deactivated activities remain visible in historical plans.</CardDescription></CardHeader><CardContent className="space-y-5"><form action={formAction} className="flex flex-col gap-3 sm:flex-row"><div className="flex-1 space-y-2"><Label htmlFor="activity-name">New activity</Label><Input id="activity-name" name="name" maxLength={80} required placeholder="e.g. Documentation" /></div><Button type="submit" className="sm:mt-7" disabled={pending}><PlusIcon data-icon="inline-start" />{pending ? "Adding…" : "Add activity"}</Button></form>{state && !state.ok ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}<div className="rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Activity</TableHead><TableHead>Status</TableHead><TableHead className="w-0" /></TableRow></TableHeader><TableBody>{activities.map((activity) => <TableRow key={activity.id}><TableCell className="font-medium">{activity.name}</TableCell><TableCell><Badge variant={activity.is_active ? "default" : "secondary"}>{activity.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><Button type="button" variant="outline" size="sm" disabled={changing} onClick={() => toggle(activity)}>{activity.is_active ? "Deactivate" : "Activate"}</Button></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>;
}
