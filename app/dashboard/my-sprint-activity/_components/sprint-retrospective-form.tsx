"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { MessageSquareTextIcon, PencilIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveMySprintRetrospective, type ActionResult } from "../actions";

export type RetrospectiveQuestionItem = {
  id: string;
  question: string;
  description: string | null;
  order_index: number;
};

export type RetrospectiveAnswerItem = {
  question_id: string;
  content: string;
};

type Props = {
  sprintId: string;
  sprintStatus: string;
  canEdit: boolean;
  questions: RetrospectiveQuestionItem[];
  initialAnswers: RetrospectiveAnswerItem[];
  title?: string;
  description?: string;
};

type DialogProps = {
  sprintId: string;
  sprintStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: RetrospectiveQuestionItem[];
  initialAnswers: RetrospectiveAnswerItem[];
  title?: string;
  description?: string;
};

function SprintRetrospectiveDialog({
  sprintId,
  sprintStatus,
  open,
  onOpenChange,
  questions,
  initialAnswers,
  title,
  description,
}: DialogProps) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveMySprintRetrospective,
    null,
  );

  const [answersMap, setAnswersMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      map[a.question_id] = a.content;
    }
    return map;
  });

  const resetToSaved = () => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      map[a.question_id] = a.content;
    }
    setAnswersMap(map);
  };

  useEffect(() => {
    if (state?.ok) {
      toast.success("Sprint retrospective saved.");
      onOpenChange(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onOpenChange]);

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.order_index - b.order_index),
    [questions],
  );

  const payload = useMemo(
    () =>
      JSON.stringify(
        sortedQuestions
          .map((q) => ({
            question_id: q.id,
            content: (answersMap[q.id] ?? "").trim(),
          }))
          .filter((item) => item.content.length > 0),
      ),
    [sortedQuestions, answersMap],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && eventDetails?.reason === "outside-press") {
          return;
        }
        if (!nextOpen) {
          resetToSaved();
        }
        onOpenChange(nextOpen);
      }}
      disablePointerDismissal={true}
    >
      <DialogContent className="max-h-[calc(100%-2rem)] sm:max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <MessageSquareTextIcon className="size-5 text-primary" />
            <DialogTitle>{title ?? "Sprint Retrospective"}</DialogTitle>
          </div>
          <DialogDescription>
            {description ??
              (sprintStatus === "completed"
                ? "Review and update your retrospective reflections for this completed sprint."
                : "Share your reflections and feedback on how the team delivered this sprint.")}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="sprint_id" value={sprintId} />
          <input type="hidden" name="answers" value={payload} />

          <div className="space-y-4">
            {sortedQuestions.map((q, index) => {
              const value = answersMap[q.id] ?? "";
              return (
                <div key={q.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label
                      htmlFor={`dialog-retro-answer-${q.id}`}
                      className="font-medium text-sm"
                    >
                      {index + 1}. {q.question}
                    </Label>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {value.length}/3000
                    </span>
                  </div>
                  {q.description ? (
                    <p className="text-xs text-muted-foreground">{q.description}</p>
                  ) : null}
                  <Textarea
                    id={`dialog-retro-answer-${q.id}`}
                    rows={3}
                    maxLength={3000}
                    placeholder="Write your response here..."
                    value={value}
                    onChange={(e) =>
                      setAnswersMap((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    className="resize-y"
                  />
                </div>
              );
            })}
          </div>

          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="flex-wrap items-center justify-between gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Your answers are visible to all project members and viewers in the overview tab.
            </p>
            <div className="flex items-center gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={pending}>
                <SaveIcon data-icon="inline-start" />
                {pending ? "Saving…" : "Save retrospective"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SprintRetrospectiveForm({
  sprintId,
  sprintStatus,
  canEdit,
  questions,
  initialAnswers,
  title,
  description,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.order_index - b.order_index),
    [questions],
  );

  const initialAnswersMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of initialAnswers) {
      map[a.question_id] = a.content;
    }
    return map;
  }, [initialAnswers]);

  const answeredCount = sortedQuestions.filter(
    (q) => (initialAnswersMap[q.id] ?? "").trim().length > 0,
  ).length;

  if (sortedQuestions.length === 0) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquareTextIcon className="size-4" />
          <span>No retrospective questions configured for this sprint yet.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquareTextIcon className="size-4 text-primary" />
              <CardTitle className="text-base">{title ?? "Sprint Retrospective"}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  answeredCount === sortedQuestions.length
                    ? "secondary"
                    : answeredCount > 0
                      ? "outline"
                      : "outline"
                }
              >
                {answeredCount} of {sortedQuestions.length} answered
              </Badge>
              {canEdit && answeredCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setDialogOpen(true)}
                >
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
              ) : null}
            </div>
          </div>
          <CardDescription>
            {description ??
              (canEdit
                ? "Share your reflections and feedback on how the team delivered this sprint."
                : "Retrospective reflections for this sprint (read-only).")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {answeredCount > 0 ? (
            <div className="space-y-3">
              {sortedQuestions.map((q, index) => {
                const value = initialAnswersMap[q.id]?.trim();
                if (!value) return null;
                return (
                  <div key={q.id} className="space-y-1 rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {index + 1}. {q.question}
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                      {value}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">No reflections submitted yet</p>
                <p className="text-xs text-muted-foreground">
                  {canEdit
                    ? "Share what went well, bottlenecks, and commitments for this sprint."
                    : "No reflections were submitted for this sprint."}
                </p>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDialogOpen(true)}
                >
                  <MessageSquareTextIcon data-icon="inline-start" />
                  Apply retrospective
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <SprintRetrospectiveDialog
          key={`${sprintId}-${dialogOpen}`}
          sprintId={sprintId}
          sprintStatus={sprintStatus}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          questions={sortedQuestions}
          initialAnswers={initialAnswers}
          title={title}
          description={description}
        />
      ) : null}
    </>
  );
}
