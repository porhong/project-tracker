"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_RELEASE_NOTES } from "@/lib/release-notes";
import type { Json } from "@/lib/supabase/database.types";
import { updateSprintReleaseNotes, type ActionResult } from "../actions";
import type { SprintRow } from "../types";
import { ReleaseNotesEditor } from "./release-notes-editor";

type ReleaseNotesDialogProps = {
  sprint: SprintRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReleaseNotesDialog({ sprint, open, onOpenChange }: ReleaseNotesDialogProps) {
  const readonly = sprint.status === "completed";
  const [content, setContent] = useState<Json>(sprint.release_notes ?? EMPTY_RELEASE_NOTES);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(updateSprintReleaseNotes, null);

  useEffect(() => { if (state?.ok) onOpenChange(false); }, [state, onOpenChange]);

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Release notes · {sprint.name}</DialogTitle><DialogDescription>{readonly ? "Completed sprint release notes are preserved as read-only." : "Summarize changes, highlights, and known limitations for this sprint."}</DialogDescription></DialogHeader>{readonly ? <ReleaseNotesEditor content={content} /> : <form action={formAction} className="space-y-4"><input type="hidden" name="id" value={sprint.id} /><input type="hidden" name="release_notes" value={JSON.stringify(content)} /><ReleaseNotesEditor content={content} editable onChange={setContent} />{state && !state.ok ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save release notes"}</Button></DialogFooter></form>}</DialogContent></Dialog>;
}
