"use client";

import { useMemo, useState } from "react";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CheckIcon,
  Clock4Icon,
  Code2Icon,
  CompassIcon,
  FlagIcon,
  HourglassIcon,
  MilestoneIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getMemberColorVariant, initialsFor } from "@/lib/profile/avatar";
import { workingDaysLabel } from "@/lib/sprint-config";
import { cn } from "@/lib/utils";
import { ActivityContributorsGroup } from "./activity-contributors-group";
import {
  MemberProfilePopover,
  type MemberProfileData,
} from "./member-profile-popover";
import type {
  ActivityNote,
  ClientSprint,
  ClientSprintMilestone,
  ClientSprintProgress,
  PlannedAllocation,
} from "../types";

type SprintTimelineProps = {
  sprint: ClientSprint;
  progressRows: ClientSprintProgress[];
  totalPlannedHours: number;
  milestones?: ClientSprintMilestone[];
};

const fullDateFormat = new Intl.DateTimeFormat("en", {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const monthDayFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

function parseUtcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateFull(dateStr: string) {
  try {
    return fullDateFormat.format(parseUtcDate(dateStr));
  } catch {
    return dateStr;
  }
}

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 1 });

const ICON_MAP = {
  compass: CompassIcon,
  sparkles: SparklesIcon,
  code: Code2Icon,
  shield: ShieldCheckIcon,
  rocket: RocketIcon,
  flag: FlagIcon,
  check: CheckIcon,
  users: UsersIcon,
} as const;

function isPlannedAllocation(value: unknown): value is PlannedAllocation {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "hours" in value &&
    typeof value.activity === "string" &&
    typeof value.hours === "number"
  );
}

function isActivityNote(value: unknown): value is ActivityNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "note" in value &&
    "updated_at" in value &&
    typeof value.activity === "string" &&
    (typeof value.note === "string" || value.note === null) &&
    typeof value.updated_at === "string"
  );
}

const SEGMENT_BG_COLORS = [
  "bg-primary",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-accent-foreground/70",
];

const SEGMENT_TEXT_COLORS = [
  "text-primary",
  "text-chart-2",
  "text-chart-3",
  "text-chart-4",
  "text-chart-5",
  "text-foreground",
];

export function SprintTimeline({
  sprint,
  progressRows,
  totalPlannedHours,
  milestones: customMilestones,
}: SprintTimelineProps) {
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  // Current date in UTC representation for consistent comparison
  const now = new Date();
  const todayIso = formatIsoDate(now);

  // Calculate high-level calendar schedule and progress
  const timelineData = useMemo(() => {
    const start = parseUtcDate(sprint.start_date);
    const end = parseUtcDate(sprint.end_date);
    const workingDaysSet = new Set(sprint.working_days);

    let totalCalendarDays = 0;
    let totalWorkingDays = 0;
    let elapsedWorkingDays = 0;
    const cursor = new Date(start);

    while (cursor <= end) {
      totalCalendarDays += 1;
      const iso = formatIsoDate(cursor);
      const isoDayOfWeek = ((cursor.getUTCDay() + 6) % 7) + 1; // 1 (Mon) to 7 (Sun)
      const isWorkingDay = workingDaysSet.has(isoDayOfWeek);
      const isPast = iso < todayIso;
      const isToday = iso === todayIso;

      if (isWorkingDay) {
        totalWorkingDays += 1;
        if (sprint.status === "completed" || isPast || isToday) {
          elapsedWorkingDays += 1;
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (sprint.status === "completed") {
      elapsedWorkingDays = totalWorkingDays;
    } else if (todayIso < sprint.start_date) {
      elapsedWorkingDays = 0;
    }

    const remainingWorkingDays = Math.max(0, totalWorkingDays - elapsedWorkingDays);
    const progressPercent =
      totalWorkingDays > 0
        ? Math.min(100, Math.max(0, Math.round((elapsedWorkingDays / totalWorkingDays) * 100)))
        : 0;

    const isUpcoming = todayIso < sprint.start_date;
    const isEnded = todayIso > sprint.end_date || sprint.status === "completed";

    return {
      totalCalendarDays,
      totalWorkingDays,
      elapsedWorkingDays,
      remainingWorkingDays,
      progressPercent,
      isUpcoming,
      isEnded,
    };
  }, [sprint, todayIso]);

  // Delivery milestones: uses live custom milestones if configured, or falls back to standard lifecycle phases
  const milestones = useMemo(() => {
    if (customMilestones && customMilestones.length > 0) {
      return customMilestones
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((m, idx) => {
          const Icon = ICON_MAP[m.icon as keyof typeof ICON_MAP] ?? FlagIcon;
          const timeframe = monthDayFormat.format(parseUtcDate(m.target_date));
          const targetIso = m.target_date;

          let relativeLabel = "Upcoming";
          let isDueToday = false;
          let isOverdue = false;

          if (m.status === "completed") {
            relativeLabel = "Delivered";
          } else if (targetIso === todayIso) {
            relativeLabel = "Due today";
            isDueToday = true;
          } else if (targetIso < todayIso) {
            relativeLabel = "Past target";
            isOverdue = true;
          } else {
            const target = parseUtcDate(targetIso);
            const today = parseUtcDate(todayIso);
            const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            relativeLabel = `In ${diffDays} day${diffDays === 1 ? "" : "s"}`;
          }

          return {
            id: m.id,
            phaseNumber: `Phase 0${idx + 1}`,
            title: m.title,
            targetDate: m.target_date,
            timeframe,
            relativeLabel,
            isDueToday,
            isOverdue,
            description: m.description || "Sprint delivery milestone deliverable.",
            icon: Icon,
            status: m.status,
          };
        });
    }

    const { totalWorkingDays, elapsedWorkingDays, isEnded, isUpcoming } = timelineData;
    const startStr = monthDayFormat.format(parseUtcDate(sprint.start_date));
    const endStr = monthDayFormat.format(parseUtcDate(sprint.end_date));
    const percent = totalWorkingDays > 0 ? (elapsedWorkingDays / totalWorkingDays) * 100 : 0;

    return [
      {
        id: "phase-1",
        phaseNumber: "Phase 01",
        title: "Kickoff & Scope",
        targetDate: sprint.start_date,
        timeframe: startStr,
        relativeLabel: isEnded || percent >= 20 ? "Completed" : isUpcoming ? "Upcoming" : "In Progress",
        isDueToday: false,
        isOverdue: false,
        description: "Align sprint objectives, review technical requirements, and assign team priorities.",
        icon: CompassIcon,
        status: isEnded || percent >= 20 ? ("completed" as const) : isUpcoming ? ("upcoming" as const) : ("in_progress" as const),
      },
      {
        id: "phase-2",
        phaseNumber: "Phase 02",
        title: "Core Development",
        targetDate: sprint.start_date,
        timeframe: `${startStr} – Mid Sprint`,
        relativeLabel: isEnded || percent >= 70 ? "Completed" : percent >= 20 ? "In Progress" : "Upcoming",
        isDueToday: false,
        isOverdue: false,
        description: "Develop core feature capabilities, user interface enhancements, and service integrations.",
        icon: SparklesIcon,
        status: isEnded || percent >= 70 ? ("completed" as const) : percent >= 20 ? ("in_progress" as const) : ("upcoming" as const),
      },
      {
        id: "phase-3",
        phaseNumber: "Phase 03",
        title: "QA & Verification",
        targetDate: sprint.end_date,
        timeframe: `Late Sprint – ${endStr}`,
        relativeLabel: isEnded || percent >= 95 ? "Completed" : percent >= 70 ? "In Verification" : "Upcoming",
        isDueToday: false,
        isOverdue: false,
        description: "End-to-end quality assurance, issue resolution, staging tests, and sign-off.",
        icon: ShieldCheckIcon,
        status: isEnded || percent >= 95 ? ("completed" as const) : percent >= 70 ? ("in_progress" as const) : ("upcoming" as const),
      },
      {
        id: "phase-4",
        phaseNumber: "Phase 04",
        title: "Release & Handover",
        targetDate: sprint.end_date,
        timeframe: endStr,
        relativeLabel: isEnded ? "Delivered" : percent >= 95 ? "Release Ready" : "Target Release",
        isDueToday: false,
        isOverdue: false,
        description: "Production deployment, release documentation publication, and sprint delivery review.",
        icon: RocketIcon,
        status: isEnded ? ("completed" as const) : percent >= 95 ? ("in_progress" as const) : ("upcoming" as const),
      },
    ];
  }, [customMilestones, sprint, timelineData, todayIso]);

  // Milestone Completion Metrics
  const milestoneMetrics = useMemo(() => {
    const total = milestones.length;
    const completed = milestones.filter((m) => m.status === "completed").length;
    const delayed = milestones.filter((m) => m.status === "delayed" || m.isOverdue).length;
    const inProgress = milestones.filter((m) => m.status === "in_progress").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, delayed, inProgress, percent };
  }, [milestones]);

  // Aggregated Sprint Effort Distribution by Activity
  const effortBreakdown = useMemo(() => {
    const activityMap = new Map<
      string,
      {
        activity: string;
        hours: number;
        contributors: Set<string>;
      }
    >();

    progressRows.forEach((row) => {
      const rowAllocations = Array.isArray(row.planned_allocations)
        ? row.planned_allocations.filter(isPlannedAllocation)
        : [];

      rowAllocations.forEach((alloc) => {
        const existing = activityMap.get(alloc.activity) ?? {
          activity: alloc.activity,
          hours: 0,
          contributors: new Set<string>(),
        };
        existing.hours += alloc.hours;
        if (row.member_name) {
          existing.contributors.add(row.member_name);
        }
        activityMap.set(alloc.activity, existing);
      });
    });

    return Array.from(activityMap.values())
      .sort((a, b) => b.hours - a.hours)
      .map((item, index) => {
        const percentage =
          totalPlannedHours > 0
            ? Math.round((item.hours / totalPlannedHours) * 100)
            : 0;
        return {
          ...item,
          percentage,
          contributors: Array.from(item.contributors),
          bgColor: SEGMENT_BG_COLORS[index % SEGMENT_BG_COLORS.length] ?? "bg-primary",
          textColor: SEGMENT_TEXT_COLORS[index % SEGMENT_TEXT_COLORS.length] ?? "text-primary",
        };
      });
  }, [progressRows, totalPlannedHours]);

  // Map of member name to full profile details for rich popovers
  const memberProfilesMap = useMemo(() => {
    const map = new Map<string, MemberProfileData>();
    progressRows.forEach((row) => {
      const name = row.member_name || "Project member";
      const rowAllocations = Array.isArray(row.planned_allocations)
        ? row.planned_allocations.filter(isPlannedAllocation)
        : [];
      const notes = Array.isArray(row.activity_notes)
        ? row.activity_notes.filter(isActivityNote)
        : [];
      const totalSprintHours = rowAllocations.reduce((sum, a) => sum + a.hours, 0);
      const latestNote = notes.length > 0 ? notes[0] : null;

      map.set(name, {
        name,
        competency: row.competency || "Team member",
        totalSprintHours,
        allocations: rowAllocations,
        notes,
        latestNote,
      });
    });
    return map;
  }, [progressRows]);

  const activeMilestone =
    milestones.find((m) => m.id === selectedMilestoneId) ??
    milestones.find((m) => m.status === "in_progress") ??
    milestones[0];

  return (
    <div className="space-y-6">
      {/* 1. Executive Sprint Hero & Overview */}
      <Card className="overflow-hidden border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                  Sprint #{sprint.sprint_number}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs font-semibold">
                  {sprint.version}
                </Badge>
                {sprint.status === "active" ? (
                  <Badge variant="default" className="font-medium">
                    Active Sprint
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1 font-medium">
                    <CheckCircle2Icon className="size-3.5 text-primary" data-icon="inline-start" />
                    Completed Sprint
                  </Badge>
                )}
              </div>
              <CardDescription className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <CalendarIcon className="size-3.5 shrink-0 text-primary" />
                <span>
                  {formatDateFull(sprint.start_date)} — {formatDateFull(sprint.end_date)}
                </span>
                <span className="text-muted-foreground/40">•</span>
                <span className="font-medium text-foreground/80">
                  {timelineData.totalWorkingDays} working days ({workingDaysLabel(sprint.working_days)})
                </span>
              </CardDescription>
            </div>

            {/* Executive Status Badge */}
            <div className="flex items-center gap-2 self-start rounded-2xl border bg-muted/30 px-3.5 py-1.5 text-xs">
              <Clock4Icon className="size-4 text-primary shrink-0" />
              {sprint.status === "completed" ? (
                <span className="font-medium text-foreground">Delivered on schedule</span>
              ) : timelineData.isUpcoming ? (
                <span className="font-medium text-foreground">
                  Starts on {monthDayFormat.format(parseUtcDate(sprint.start_date))}
                </span>
              ) : (
                <span className="font-medium text-foreground">
                  {timelineData.remainingWorkingDays === 0
                    ? "Final sprint day in progress"
                    : `${timelineData.remainingWorkingDays} working day${
                        timelineData.remainingWorkingDays === 1 ? "" : "s"
                      } remaining`}
                </span>
              )}
            </div>
          </div>

          {/* Sprint Objective Banner */}
          {sprint.description ? (
            <div className="mt-3.5 rounded-2xl border bg-primary/5 p-3.5 text-sm text-foreground/90">
              <div className="flex items-start gap-2.5">
                <SparklesIcon className="size-4 shrink-0 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold text-xs text-primary uppercase tracking-wider mb-0.5">
                    Sprint Goal &amp; Scope
                  </p>
                  <p className="text-sm leading-relaxed">{sprint.description}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Unified Timeline Progress Track */}
          <div className="mt-4 pt-4 border-t border-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <FlagIcon className="size-3.5 text-primary" />
                <span>Sprint Progress</span>
              </div>
              <span className="font-semibold tabular-nums text-foreground">
                {timelineData.progressPercent}%
                <span className="font-normal text-muted-foreground ml-1">
                  ({timelineData.elapsedWorkingDays} of {timelineData.totalWorkingDays} work days)
                </span>
              </span>
            </div>
            <Progress value={timelineData.progressPercent} className="h-2 w-full" />
          </div>
        </CardHeader>

        {/* 3 Clear Executive KPI Metric Highlights */}
        <CardContent className="grid gap-3 sm:grid-cols-3 pt-0">
          {/* 1. Schedule & Progress */}
          <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <HourglassIcon className="size-3.5 text-primary" />
                Delivery Pace
              </span>
              <span className="text-primary font-semibold">{timelineData.progressPercent}%</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {timelineData.elapsedWorkingDays}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {timelineData.totalWorkingDays} days
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {sprint.status === "completed"
                ? "Delivered on schedule"
                : `${timelineData.remainingWorkingDays} work days left · Target: ${monthDayFormat.format(
                    parseUtcDate(sprint.end_date),
                  )}`}
            </p>
          </div>

          {/* 2. Deliverables Health */}
          <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5">
                <MilestoneIcon className="size-3.5 text-primary" />
                Deliverables
              </span>
              {milestoneMetrics.delayed > 0 ? (
                <span className="text-destructive font-semibold flex items-center gap-1 text-[11px]">
                  <AlertTriangleIcon className="size-3" />
                  {milestoneMetrics.delayed} delayed
                </span>
              ) : (
                <span className="text-primary font-semibold text-[11px]">
                  {milestoneMetrics.percent}% on track
                </span>
              )}
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {milestoneMetrics.completed}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                / {milestoneMetrics.total} delivered
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {milestoneMetrics.inProgress > 0
                ? `${milestoneMetrics.inProgress} currently in progress`
                : "All delivery phases mapped"}
            </p>
          </div>

          {/* 3. Team Capacity */}
          <div className="rounded-2xl border bg-muted/20 p-3.5 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <UsersIcon className="size-3.5 text-primary" />
                <span>Team &amp; Effort</span>
              </div>
              {/* Sprint Team Avatars Preview */}
              {progressRows.length > 0 ? (
                <AvatarGroup className="-space-x-1.5">
                  {progressRows.slice(0, 3).map((row) => {
                    const name = row.member_name || "Member";
                    const profile = memberProfilesMap.get(name);
                    if (!profile) return null;
                    const variant = getMemberColorVariant(name);
                    return (
                      <MemberProfilePopover
                        key={name}
                        member={profile}
                        showTooltip
                        tooltipText={`${name} (${profile.competency}) · ${hours(profile.totalSprintHours)}h`}
                      >
                        <Avatar size="sm" className="border-2 border-background bg-background ring-1 ring-border/50">
                          <AvatarFallback
                            className={cn(
                              "text-[9px] font-semibold select-none",
                              variant.avatarBg,
                            )}
                          >
                            {initialsFor(name)}
                          </AvatarFallback>
                        </Avatar>
                      </MemberProfilePopover>
                    );
                  })}
                  {progressRows.length > 3 ? (
                    <AvatarGroupCount className="text-[9px] font-semibold bg-muted text-muted-foreground border-2 border-background">
                      +{progressRows.length - 3}
                    </AvatarGroupCount>
                  ) : null}
                </AvatarGroup>
              ) : null}
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {hours(totalPlannedHours)}h
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {progressRows.length} team member{progressRows.length === 1 ? "" : "s"} assigned
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Key Deliverables & Milestones Pipeline */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="pb-3">
          <div className="space-y-0.5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MilestoneIcon className="size-4 text-primary" />
              Key Deliverables &amp; Milestones
            </CardTitle>
            <CardDescription className="text-xs">
              Sequential delivery phases and target deliverables for this sprint.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-3">
            {/* Stepper Pipeline */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {milestones.map((milestone, index) => {
                const Icon = milestone.icon;
                const isCompleted = milestone.status === "completed";
                const isCurrent = milestone.status === "in_progress";
                const isDelayed = milestone.status === "delayed" || milestone.isOverdue;
                const isSelected = activeMilestone?.id === milestone.id;

                return (
                  <button
                    key={milestone.id}
                    type="button"
                    onClick={() => setSelectedMilestoneId(milestone.id)}
                    className={`group relative text-left flex flex-col justify-between rounded-2xl border p-3.5 space-y-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? "ring-2 ring-primary border-primary bg-primary/5 shadow-xs"
                        : isCurrent
                          ? "border-primary/50 bg-primary/5 hover:border-primary"
                          : isDelayed
                            ? "border-destructive/40 bg-destructive/5 hover:border-destructive"
                            : isCompleted
                              ? "border-border bg-card hover:border-border/80 hover:bg-muted/20"
                              : "border-border/60 bg-muted/10 hover:border-border"
                    }`}
                  >
                    {/* Top row: Phase + Status Badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`flex size-6 shrink-0 items-center justify-center rounded-xl ${
                            isCompleted
                              ? "bg-primary text-primary-foreground"
                              : isCurrent
                                ? "bg-primary/15 text-primary"
                                : isDelayed
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckIcon className="size-3.5 stroke-[2.5]" />
                          ) : (
                            <Icon className="size-3.5" />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-foreground/80 truncate">
                          {milestone.phaseNumber || `Phase 0${index + 1}`}
                        </span>
                      </div>

                      <Badge
                        variant={
                          isCompleted
                            ? "secondary"
                            : isCurrent
                              ? "default"
                              : isDelayed
                                ? "destructive"
                                : "outline"
                        }
                        className="text-[10px] font-medium h-5 px-1.5"
                      >
                        {isCompleted
                          ? "Delivered"
                          : isDelayed
                            ? "Delayed"
                            : isCurrent
                              ? "In Progress"
                              : "Upcoming"}
                      </Badge>
                    </div>

                    {/* Middle: Title */}
                    <p className="font-semibold text-sm text-foreground leading-snug truncate">
                      {milestone.title}
                    </p>

                    {/* Bottom: Date */}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <CalendarIcon className="size-3 shrink-0" />
                      <span className="truncate">{milestone.timeframe}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Milestone Detail Banner */}
            {activeMilestone ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-muted/20 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    {(() => {
                      const Icon = activeMilestone.icon;
                      return <Icon className="size-3" />;
                    })()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate">
                        {activeMilestone.phaseNumber}: {activeMilestone.title}
                      </span>
                      <span className="text-muted-foreground shrink-0">•</span>
                      <span className="text-muted-foreground shrink-0 font-medium">
                        Target: {activeMilestone.timeframe}
                      </span>
                    </div>
                    <p className="text-muted-foreground truncate leading-relaxed">
                      {activeMilestone.description}
                    </p>
                  </div>
                </div>

                <Badge
                  variant={
                    activeMilestone.status === "completed"
                      ? "secondary"
                      : activeMilestone.status === "delayed" || activeMilestone.isOverdue
                        ? "destructive"
                        : activeMilestone.status === "in_progress"
                          ? "default"
                          : "outline"
                  }
                  className="self-start sm:self-auto shrink-0 text-[10px] h-5 px-2 font-medium"
                >
                  {activeMilestone.status === "completed"
                    ? "Delivered"
                    : activeMilestone.status === "delayed" || activeMilestone.isOverdue
                      ? "Delayed"
                      : activeMilestone.status === "in_progress"
                        ? "In Progress"
                        : "Upcoming"}
                </Badge>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* 3. Sprint Focus Areas & Effort Distribution */}
      {effortBreakdown.length > 0 ? (
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ActivityIcon className="size-4 text-primary" />
                  Sprint Focus Areas
                </CardTitle>
                <CardDescription className="text-xs">
                  Planned effort breakdown across core deliverables and disciplines.
                </CardDescription>
              </div>
              <span className="text-xs text-muted-foreground self-start sm:self-auto font-medium">
                Total Planned:{" "}
                <strong className="text-foreground">{hours(totalPlannedHours)} hours</strong>
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Multi-segment distribution bar */}
            <div className="space-y-1.5">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted p-0.5 gap-0.5">
                {effortBreakdown.map((item) => (
                  <div
                    key={item.activity}
                    title={`${item.activity}: ${hours(item.hours)}h (${item.percentage}%)`}
                    style={{ width: `${Math.max(item.percentage, 3)}%` }}
                    className={`h-full rounded-full transition-all ${item.bgColor}`}
                  />
                ))}
              </div>
            </div>

            {/* Activity breakdown cards */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pt-1">
              {effortBreakdown.map((item) => (
                <div
                  key={item.activity}
                  className="flex items-center justify-between rounded-2xl border bg-muted/20 p-3 space-x-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full shrink-0 ${item.bgColor}`} />
                      <span className="text-xs font-semibold text-foreground truncate">
                        {item.activity}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="tabular-nums font-semibold text-foreground">{hours(item.hours)}h</span>
                      <span>•</span>
                      <span className="tabular-nums font-medium">{item.percentage}%</span>
                      <span>•</span>
                      <span>
                        {item.contributors.length} member{item.contributors.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Contributor Avatars with Profile Popovers */}
                  <ActivityContributorsGroup
                    contributors={item.contributors}
                    activityName={item.activity}
                    activityTotalHours={item.hours}
                    memberProfilesMap={memberProfilesMap}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
