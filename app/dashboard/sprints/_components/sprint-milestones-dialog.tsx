"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  CheckIcon,
  Code2Icon,
  CompassIcon,
  FlagIcon,
  MilestoneIcon,
  PlusIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  UsersIcon,
  Wand2Icon,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSprintMilestones, type ActionResult } from "../actions";
import type { SprintMilestoneRow, SprintRow } from "../types";

export type MilestoneDraft = {
  id?: string;
  title: string;
  description: string;
  target_date: string;
  status: "upcoming" | "in_progress" | "completed" | "delayed";
  icon: "compass" | "sparkles" | "code" | "shield" | "rocket" | "flag" | "check" | "users";
};

const ICON_OPTIONS = [
  { value: "compass", label: "Kickoff / Strategy", icon: CompassIcon },
  { value: "sparkles", label: "Feature Build", icon: SparklesIcon },
  { value: "code", label: "Engineering / API", icon: Code2Icon },
  { value: "shield", label: "Testing / QA", icon: ShieldCheckIcon },
  { value: "rocket", label: "Release / Deployment", icon: RocketIcon },
  { value: "flag", label: "Goal / Milestone", icon: FlagIcon },
  { value: "check", label: "Signoff / Review", icon: CheckIcon },
  { value: "users", label: "Stakeholder Demo", icon: UsersIcon },
] as const;

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming", variant: "outline" as const },
  { value: "in_progress", label: "In Progress", variant: "default" as const },
  { value: "completed", label: "Completed", variant: "secondary" as const },
  { value: "delayed", label: "Delayed", variant: "destructive" as const },
] as const;

function calculateStandardMilestones(startDate: string, endDate: string): MilestoneDraft[] {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const span = Math.max(0, end - start);

  const midDate = new Date(start + span * 0.45).toISOString().slice(0, 10);
  const qaDate = new Date(start + span * 0.8).toISOString().slice(0, 10);

  return [
    {
      title: "Sprint Kickoff & Scope Alignment",
      description:
        "Sprint goals finalized, technical requirements reviewed, and initial capacity allocated.",
      target_date: startDate,
      status: "upcoming",
      icon: "compass",
    },
    {
      title: "Core Build & Feature Development",
      description:
        "Active engineering of user stories, frontend interfaces, APIs, and feature integration.",
      target_date: midDate,
      status: "upcoming",
      icon: "sparkles",
    },
    {
      title: "Quality Assurance & Staging Review",
      description:
        "Internal functional testing, performance checks, bug fixes, and staging readiness validation.",
      target_date: qaDate,
      status: "upcoming",
      icon: "shield",
    },
    {
      title: "Sprint Release & Demo Handover",
      description:
        "Final deployment, release notes publication, version release, and sprint review demo.",
      target_date: endDate,
      status: "upcoming",
      icon: "rocket",
    },
  ];
}

export function SprintMilestonesDialog({
  sprint,
  milestones,
  open,
  onOpenChange,
}: {
  sprint: SprintRow;
  milestones: SprintMilestoneRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const readonly = sprint.status === "completed" || sprint.status === "archived";
  const [items, setItems] = useState<MilestoneDraft[]>(() => {
    if (milestones.length > 0) {
      return milestones
        .sort((a, b) => a.order_index - b.order_index)
        .map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description ?? "",
          target_date: m.target_date,
          status: m.status as MilestoneDraft["status"],
          icon: m.icon as MilestoneDraft["icon"],
        }));
    }
    return calculateStandardMilestones(sprint.start_date, sprint.end_date);
  });

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveSprintMilestones,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("Sprint delivery milestones saved.");
      onOpenChange(false);
    } else if (state && !state.ok) {
      toast.error(state.error);
    }
  }, [state, onOpenChange]);

  const loadStandardTemplate = () => {
    setItems(calculateStandardMilestones(sprint.start_date, sprint.end_date));
    toast.info("Standard 4-phase delivery roadmap loaded.");
  };

  const addMilestone = () => {
    setItems((current) => [
      ...current,
      {
        title: "",
        description: "",
        target_date: sprint.start_date,
        status: "upcoming",
        icon: "flag",
      },
    ]);
  };

  const removeMilestone = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setItems((current) => {
      const next = [...current];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveDown = (index: number) => {
    setItems((current) => {
      if (index >= current.length - 1) return current;
      const next = [...current];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const updateItem = <K extends keyof MilestoneDraft>(
    index: number,
    field: K,
    value: MilestoneDraft[K],
  ) => {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const payload = useMemo(
    () =>
      items.map((m, index) => ({
        title: m.title.trim(),
        description: m.description.trim() || null,
        target_date: m.target_date,
        status: m.status,
        icon: m.icon,
        order_index: index,
      })),
    [items],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <MilestoneIcon className="size-5 text-primary" />
                Delivery Milestones · Sprint #{sprint.sprint_number}
              </DialogTitle>
              <DialogDescription>
                {readonly
                  ? "Completed and archived sprint delivery milestones are preserved as read-only."
                  : "Define key milestones, target dates, and progress stages displayed on the client roadmap."}
              </DialogDescription>
            </div>
            {!readonly ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadStandardTemplate}
              >
                <Wand2Icon data-icon="inline-start" />
                Reset to Standard Template
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {readonly ? (
          <div className="space-y-4 py-2">
            {items.length === 0 ? (
              <Alert>
                <AlertDescription>No delivery milestones recorded for this sprint.</AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((milestone, index) => {
                  const iconConfig =
                    ICON_OPTIONS.find((opt) => opt.value === milestone.icon) ?? ICON_OPTIONS[0];
                  const Icon = iconConfig.icon;
                  const statusConfig =
                    STATUS_OPTIONS.find((s) => s.value === milestone.status) ?? STATUS_OPTIONS[0];

                  return (
                    <Card key={milestone.id ?? `readonly-${index}`} size="sm" className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex size-7 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              <Icon className="size-3.5" />
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                Phase 0{index + 1}
                              </span>
                              <CardTitle className="text-sm font-semibold">{milestone.title}</CardTitle>
                            </div>
                          </div>
                          <Badge variant={statusConfig.variant} className="text-[10px] uppercase font-semibold">
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs font-medium">
                          Target: {milestone.target_date}
                        </CardDescription>
                      </CardHeader>
                      {milestone.description ? (
                        <CardContent className="pt-0 text-xs text-muted-foreground leading-relaxed">
                          {milestone.description}
                        </CardContent>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}
            <DialogFooter className="pt-4">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Close
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-5">
            <input type="hidden" name="id" value={sprint.id} />
            <input type="hidden" name="milestones" value={JSON.stringify(payload)} />

            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <p className="text-sm font-medium text-foreground">
                {items.length} {items.length === 1 ? "Milestone" : "Milestones"} defined
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
                <PlusIcon data-icon="inline-start" />
                Add Milestone
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
                <MilestoneIcon className="mx-auto size-8 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">No milestones configured yet</p>
                  <p className="text-xs text-muted-foreground">
                    Load the standard 4-phase delivery template or add custom milestones to track sprint progress.
                  </p>
                </div>
                <div className="flex justify-center gap-2 pt-2">
                  <Button type="button" size="sm" onClick={loadStandardTemplate}>
                    <Wand2Icon data-icon="inline-start" />
                    Load 4-Phase Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
                    <PlusIcon data-icon="inline-start" />
                    Add Custom Milestone
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => {
                  const selectedIconConfig =
                    ICON_OPTIONS.find((opt) => opt.value === item.icon) ?? ICON_OPTIONS[0];
                  const Icon = selectedIconConfig.icon;

                  return (
                    <Card key={`milestone-${index}`} size="sm" className="relative border-border shadow-xs">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {index + 1}
                            </span>
                            <div className="flex size-6 items-center justify-center rounded-xl bg-muted text-foreground">
                              <Icon className="size-3.5" />
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              Phase 0{index + 1}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={index === 0}
                              onClick={() => moveUp(index)}
                              title="Move milestone up"
                            >
                              <ArrowUpIcon className="size-3.5" />
                              <span className="sr-only">Move up</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              disabled={index === items.length - 1}
                              onClick={() => moveDown(index)}
                              title="Move milestone down"
                            >
                              <ArrowDownIcon className="size-3.5" />
                              <span className="sr-only">Move down</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="text-destructive hover:text-destructive"
                              onClick={() => removeMilestone(index)}
                              title="Remove milestone"
                            >
                              <Trash2Icon className="size-3.5" />
                              <span className="sr-only">Remove milestone</span>
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 pt-0">
                        <div className="grid gap-3 sm:grid-cols-12">
                          <div className="space-y-1.5 sm:col-span-8">
                            <Label htmlFor={`milestone-title-${index}`} className="text-xs font-medium">
                              Milestone Title <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id={`milestone-title-${index}`}
                              maxLength={120}
                              required
                              value={item.title}
                              onChange={(e) => updateItem(index, "title", e.target.value)}
                              placeholder="e.g. Core Build & Feature Development"
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-4">
                            <Label htmlFor={`milestone-date-${index}`} className="text-xs font-medium">
                              Target Date <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id={`milestone-date-${index}`}
                              type="date"
                              required
                              min={sprint.start_date}
                              max={sprint.end_date}
                              value={item.target_date}
                              onChange={(e) => updateItem(index, "target_date", e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-12">
                          <div className="space-y-1.5 sm:col-span-6">
                            <Label className="text-xs font-medium">Lifecycle Status</Label>
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {STATUS_OPTIONS.map((status) => {
                                const isSelected = item.status === status.value;
                                return (
                                  <Button
                                    key={status.value}
                                    type="button"
                                    size="xs"
                                    variant={isSelected ? status.variant : "ghost"}
                                    className={`text-[11px] font-medium transition-all ${
                                      isSelected
                                        ? ""
                                        : "border border-border/60 hover:border-border text-muted-foreground"
                                    }`}
                                    onClick={() => updateItem(index, "status", status.value)}
                                  >
                                    {isSelected ? <CheckCircle2Icon data-icon="inline-start" className="size-3" /> : null}
                                    {status.label}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-1.5 sm:col-span-6">
                            <Label className="text-xs font-medium">Category Icon</Label>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {ICON_OPTIONS.map((opt) => {
                                const OptionIcon = opt.icon;
                                const isSelected = item.icon === opt.value;
                                return (
                                  <Button
                                    key={opt.value}
                                    type="button"
                                    size="icon-xs"
                                    variant={isSelected ? "default" : "outline"}
                                    className={isSelected ? "ring-1 ring-primary" : "text-muted-foreground"}
                                    onClick={() => updateItem(index, "icon", opt.value)}
                                    title={opt.label}
                                  >
                                    <OptionIcon className="size-3.5" />
                                    <span className="sr-only">{opt.label}</span>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`milestone-desc-${index}`} className="text-xs font-medium">
                            Description &amp; Deliverables (Optional)
                          </Label>
                          <Textarea
                            id={`milestone-desc-${index}`}
                            maxLength={1000}
                            rows={2}
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                            placeholder="Key goals, deliverables, or testing scope for this milestone phase..."
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {state && !state.ok ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="pt-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save milestones"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
