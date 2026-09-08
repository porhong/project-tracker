"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MessageSquareTextIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSprintRetrospectiveQuestions, type ActionResult } from "../actions";
import type { SprintRetrospectiveQuestionRow, SprintRow } from "../types";

export type RetrospectiveQuestionDraft = {
  id?: string;
  question: string;
  description: string;
};

export const STANDARD_RETROSPECTIVE_QUESTIONS: RetrospectiveQuestionDraft[] = [
  {
    question: "What went well during this sprint?",
    description:
      "Highlight successes, team wins, smooth deliveries, and positive collaboration.",
  },
  {
    question: "What could have gone better or caused friction?",
    description:
      "Identify bottlenecks, blockers, tech debt, scope creep, or communication gaps.",
  },
  {
    question: "What concrete commitments will we make for the next sprint?",
    description:
      "Actionable takeaways, process adjustments, or experiments to adopt next sprint.",
  },
];

export function SprintRetrospectiveQuestionsDialog({
  sprint,
  questions,
  open,
  onOpenChange,
}: {
  sprint: SprintRow;
  questions: SprintRetrospectiveQuestionRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const readonly = sprint.status === "completed" || sprint.status === "archived";
  const [items, setItems] = useState<RetrospectiveQuestionDraft[]>(() => {
    if (questions.length > 0) {
      return questions
        .sort((a, b) => a.order_index - b.order_index)
        .map((q) => ({
          id: q.id,
          question: q.question,
          description: q.description ?? "",
        }));
    }
    return STANDARD_RETROSPECTIVE_QUESTIONS;
  });

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveSprintRetrospectiveQuestions,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Retrospective questions saved successfully.");
      onOpenChange(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onOpenChange]);

  const updateItem = (index: number, patch: Partial<RetrospectiveQuestionDraft>) => {

    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        question: "",
        description: "",
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    setItems((current) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const loadStandardTemplate = () => {
    setItems(STANDARD_RETROSPECTIVE_QUESTIONS);
    toast.info("Standard retrospective questions loaded.");
  };

  const payload = useMemo(
    () =>
      JSON.stringify(
        items.map((item) => ({
          question: item.question.trim(),
          description: item.description.trim() || null,
        })),
      ),
    [items],
  );

  const isValid =
    items.length > 0 &&
    items.every(
      (item) => item.question.trim().length > 0 && item.question.length <= 300,
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100%-2rem)] sm:max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <MessageSquareTextIcon className="size-5 text-primary" />
            <DialogTitle>
              Retrospective Questions · Sprint #{sprint.sprint_number}
            </DialogTitle>
          </div>
          <DialogDescription>
            {readonly
              ? "This sprint is closed. Retrospective questions are read-only."
              : "Configure the prompt questions team members will answer for this sprint's retrospective."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={sprint.id} />
          <input type="hidden" name="questions" value={payload} />

          {!readonly ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <p className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "question" : "questions"} configured
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={loadStandardTemplate}
                >
                  <SparklesIcon data-icon="inline-start" />
                  Load standard template
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={addItem}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add question
                </Button>
              </div>
            </div>
          ) : null}

          {items.length === 0 ? (
            <Alert>
              <AlertDescription>
                No retrospective questions have been set for this sprint.
                {!readonly && " Click 'Add question' or 'Load standard template' to get started."}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <Card key={index} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Question #{index + 1}
                      </CardTitle>
                      {!readonly ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={index === 0}
                            onClick={() => moveItem(index, "up")}
                            aria-label={`Move question ${index + 1} up`}
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={index === items.length - 1}
                            onClick={() => moveItem(index, "down")}
                            aria-label={`Move question ${index + 1} down`}
                          >
                            <ArrowDownIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => removeItem(index)}
                            aria-label={`Delete question ${index + 1}`}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="space-y-1">
                      <Label htmlFor={`question-text-${index}`}>
                        Question prompt <span className="text-destructive">*</span>
                      </Label>
                      {readonly ? (
                        <p className="text-sm font-medium py-1">{item.question}</p>
                      ) : (
                        <Input
                          id={`question-text-${index}`}
                          value={item.question}
                          maxLength={300}
                          placeholder="e.g. What went well during this sprint?"
                          onChange={(e) =>
                            updateItem(index, { question: e.target.value })
                          }
                          required
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`question-desc-${index}`}>
                        Guidance note <span className="text-xs text-muted-foreground">(optional)</span>
                      </Label>
                      {readonly ? (
                        item.description ? (
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        ) : null
                      ) : (
                        <Textarea
                          id={`question-desc-${index}`}
                          rows={2}
                          maxLength={1000}
                          value={item.description}
                          placeholder="Tips or examples to guide member reflections..."
                          onChange={(e) =>
                            updateItem(index, { description: e.target.value })
                          }
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose render={<Button type="button" variant="outline" />}>
              {readonly ? "Close" : "Cancel"}
            </DialogClose>
            {!readonly ? (
              <Button type="submit" disabled={pending || !isValid}>
                {pending ? "Saving…" : "Save questions"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
