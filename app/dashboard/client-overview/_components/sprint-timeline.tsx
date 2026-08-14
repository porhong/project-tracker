"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CheckCircle2Icon,
  Clock4Icon,
  CompassIcon,
  FileTextIcon,
  FlagIcon,
  HourglassIcon,
  MilestoneIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { workingDaysLabel } from "@/lib/sprint-config";
import type { ClientSprint, ClientSprintProgress } from "../types";

type SprintTimelineProps = {
  sprint: ClientSprint;
  progressRows: ClientSprintProgress[];
  totalPlannedHours: number;
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

const weekdayShortFormat = new Intl.DateTimeFormat("en", {
  weekday: "short",
});

const dayNumFormat = new Intl.DateTimeFormat("en", {
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
  value.toLocaleString("en", { maximumFractionDigits: 2 });

export function SprintTimeline({
  sprint,
  progressRows,
  totalPlannedHours,
}: SprintTimelineProps) {
  const router = useRouter();

  // Current date in UTC representation for consistent comparison
  const now = new Date();
  const todayIso = formatIsoDate(now);

  // Calculate day-by-day calendar schedule and progress
  const timelineData = useMemo(() => {
    const start = parseUtcDate(sprint.start_date);
    const end = parseUtcDate(sprint.end_date);
    const workingDaysSet = new Set(sprint.working_days);

    const days: Array<{
      iso: string;
      date: Date;
      dayOfWeek: number; // 1=Mon, 7=Sun
      dayName: string;
      dayNum: string;
      monthDay: string;
      isWorkingDay: boolean;
      isPast: boolean;
      isToday: boolean;
      isFuture: boolean;
      workingDayIndex: number | null; // 1-based index among working days
    }> = [];

    let totalWorkingDays = 0;
    let elapsedWorkingDays = 0;
    const cursor = new Date(start);

    while (cursor <= end) {
      const iso = formatIsoDate(cursor);
      const isoDayOfWeek = ((cursor.getUTCDay() + 6) % 7) + 1; // 1 (Mon) to 7 (Sun)
      const isWorkingDay = workingDaysSet.has(isoDayOfWeek);
      const isPast = iso < todayIso;
      const isToday = iso === todayIso;
      const isFuture = iso > todayIso;

      let workingDayIndex: number | null = null;
      if (isWorkingDay) {
        totalWorkingDays += 1;
        workingDayIndex = totalWorkingDays;

        if (sprint.status === "completed" || isPast || isToday) {
          elapsedWorkingDays += 1;
        }
      }

      days.push({
        iso,
        date: new Date(cursor),
        dayOfWeek: isoDayOfWeek,
        dayName: weekdayShortFormat.format(cursor),
        dayNum: dayNumFormat.format(cursor),
        monthDay: monthDayFormat.format(cursor),
        isWorkingDay,
        isPast,
        isToday,
        isFuture,
        workingDayIndex,
      });

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
    const isOngoing = !isUpcoming && !isEnded && sprint.status === "active";
    const workingDayItems = days.filter((d) => d.isWorkingDay);

    return {
      days,
      workingDayItems,
      totalCalendarDays: days.length,
      totalWorkingDays,
      elapsedWorkingDays,
      remainingWorkingDays,
      progressPercent,
      isUpcoming,
      isEnded,
      isOngoing,
    };
  }, [sprint, todayIso]);

  // Milestones lifecycle phases calculated relative to sprint dates
  const milestones = useMemo(() => {
    const { totalWorkingDays, elapsedWorkingDays, isEnded, isUpcoming, days } = timelineData;
    const startStr = monthDayFormat.format(parseUtcDate(sprint.start_date));
    const endStr = monthDayFormat.format(parseUtcDate(sprint.end_date));

    // Midpoint date
    const midIndex = Math.floor(days.length / 2);
    const midDateStr = days[midIndex]?.monthDay ?? "Mid-Sprint";

    // QA phase date (~75% mark)
    const qaIndex = Math.min(days.length - 1, Math.max(0, Math.floor(days.length * 0.75)));
    const qaDateStr = days[qaIndex]?.monthDay ?? "Sprint Final Days";

    const percent = totalWorkingDays > 0 ? (elapsedWorkingDays / totalWorkingDays) * 100 : 0;

    return [
      {
        id: "phase-1",
        title: "Sprint Kickoff & Scope Alignment",
        timeframe: startStr,
        description:
          "Sprint goals finalized, technical requirements reviewed, and initial capacity allocated.",
        icon: CompassIcon,
        status: isEnded || percent >= 20 ? ("completed" as const) : isUpcoming ? ("upcoming" as const) : ("current" as const),
      },
      {
        id: "phase-2",
        title: "Core Build & Feature Development",
        timeframe: `${startStr} – ${midDateStr}`,
        description:
          "Active engineering of user stories, frontend interfaces, APIs, and feature integration.",
        icon: SparklesIcon,
        status: isEnded || percent >= 70 ? ("completed" as const) : percent >= 20 ? ("current" as const) : ("upcoming" as const),
      },
      {
        id: "phase-3",
        title: "Quality Assurance & Staging Review",
        timeframe: `${qaDateStr} – ${endStr}`,
        description:
          "Internal functional testing, performance checks, bug fixes, and staging readiness validation.",
        icon: ShieldCheckIcon,
        status: isEnded || percent >= 95 ? ("completed" as const) : percent >= 70 ? ("current" as const) : ("upcoming" as const),
      },
      {
        id: "phase-4",
        title: "Sprint Release & Demo Handover",
        timeframe: endStr,
        description:
          "Final deployment, release notes publication, version release, and sprint review demo.",
        icon: RocketIcon,
        status: isEnded ? ("completed" as const) : percent >= 95 ? ("current" as const) : ("upcoming" as const),
      },
    ];
  }, [sprint, timelineData]);

  const navigateToTab = (tab: "activity" | "release-notes") => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  return (
    <div className="space-y-6">
      {/* Hero Sprint Summary Card */}
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
                  <Badge
                    variant="default"
                    className="gap-1.5 font-medium shadow-xs"
                  >
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75"></span>
                      <span className="relative inline-flex size-2 rounded-full bg-primary-foreground"></span>
                    </span>
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
                <span className="text-muted-foreground/50">•</span>
                <span className="font-medium text-foreground/80">
                  {timelineData.totalCalendarDays} calendar days ({timelineData.totalWorkingDays} working days)
                </span>
              </CardDescription>
            </div>

            {/* Status callout pill */}
            <div className="flex items-center gap-2 self-start rounded-2xl border bg-muted/30 px-3.5 py-1.5 text-xs">
              <Clock4Icon className="size-4 text-primary shrink-0" />
              {sprint.status === "completed" ? (
                <span className="font-medium text-foreground">
                  Sprint finalized on schedule
                </span>
              ) : timelineData.isUpcoming ? (
                <span className="font-medium text-foreground">
                  Starts in {timelineData.days.filter((d) => d.isPast).length === 0 ? "upcoming days" : "soon"}
                </span>
              ) : (
                <span className="font-medium text-foreground">
                  {timelineData.remainingWorkingDays === 0
                    ? "Final sprint day in progress"
                    : `${timelineData.remainingWorkingDays} working day${timelineData.remainingWorkingDays === 1 ? "" : "s"} remaining`}
                </span>
              )}
            </div>
          </div>

          {/* Sprint Goal / Scope Description if present */}
          {sprint.description ? (
            <div className="mt-4 rounded-2xl border bg-primary/5 p-3.5 text-sm text-foreground/90">
              <div className="flex items-start gap-2.5">
                <SparklesIcon className="size-4 shrink-0 text-primary mt-0.5" />
                <div>
                  <p className="font-semibold text-xs text-primary uppercase tracking-wider mb-0.5">
                    Sprint Objective &amp; Focus
                  </p>
                  <p className="text-sm leading-relaxed">{sprint.description}</p>
                </div>
              </div>
            </div>
          ) : null}
        </CardHeader>

        {/* 4 Metric Highlights */}
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-0">
          {/* Progress % */}
          <div className="rounded-2xl border bg-muted/20 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <FlagIcon className="size-3.5 text-primary" />
                Sprint Progress
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {timelineData.progressPercent === 100 ? (
                  <>
                    <CheckCircle2Icon className="size-3" data-icon="inline-start" />
                    100%
                  </>
                ) : (
                  `${timelineData.progressPercent}%`
                )}
              </span>
            </div>

            <p className="text-2xl font-bold tabular-nums text-foreground">
              {timelineData.elapsedWorkingDays}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {timelineData.totalWorkingDays} work days
              </span>
            </p>

            {/* Modern Segmented Progress Track */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 w-full">
                {timelineData.workingDayItems.map((day) => {
                  const isPastOrCompleted =
                    sprint.status === "completed" ||
                    day.isPast ||
                    (day.isToday && timelineData.progressPercent === 100);
                  const isCurrentToday =
                    day.isToday &&
                    sprint.status === "active" &&
                    timelineData.progressPercent < 100;

                  return (
                    <div
                      key={day.iso}
                      title={`${day.monthDay}: Day ${day.workingDayIndex} (${isPastOrCompleted ? "Completed" : isCurrentToday ? "Today" : "Scheduled"})`}
                      className={`h-2.5 rounded-full flex-1 transition-all ${
                        isCurrentToday
                          ? "bg-primary ring-2 ring-primary/40 shadow-xs"
                          : isPastOrCompleted
                            ? "bg-primary"
                            : "bg-muted"
                      }`}
                    />
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {sprint.status === "completed"
                  ? "Full sprint duration completed"
                  : timelineData.isUpcoming
                    ? `Starts on ${monthDayFormat.format(parseUtcDate(sprint.start_date))}`
                    : `${timelineData.remainingWorkingDays} working day${timelineData.remainingWorkingDays === 1 ? "" : "s"} remaining`}
              </p>
            </div>
          </div>

          {/* Time Remaining */}
          <div className="rounded-2xl border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <HourglassIcon className="size-3.5 text-primary" />
              <span>Sprint Pace</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {sprint.status === "completed"
                ? "Completed"
                : `${timelineData.remainingWorkingDays} ${timelineData.remainingWorkingDays === 1 ? "Day" : "Days"}`}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {sprint.status === "completed"
                ? "All planned days delivered"
                : `Ends on ${monthDayFormat.format(parseUtcDate(sprint.end_date))}`}
            </p>
          </div>

          {/* Planned Effort */}
          <div className="rounded-2xl border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <ActivityIcon className="size-3.5 text-primary" />
              <span>Planned Capacity</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {hours(totalPlannedHours)}h
            </p>
            <p className="text-[11px] text-muted-foreground">
              Across {progressRows.length} team member{progressRows.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Working Schedule */}
          <div className="rounded-2xl border bg-muted/20 p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <CalendarDaysIcon className="size-3.5 text-primary" />
              <span>Sprint Schedule</span>
            </div>
            <p className="text-sm font-semibold text-foreground pt-1 truncate">
              {workingDaysLabel(sprint.working_days)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {hours(sprint.daily_work_hours)}h standard daily capacity
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Day-by-Day Timeline Visualizer */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDaysIcon className="size-4 text-primary" />
                Sprint Day-by-Day Schedule
              </CardTitle>
              <CardDescription className="text-xs">
                Visual timeline of all calendar days in this sprint period. Working days and rest days are clearly designated.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-primary inline-block"></span>
                <span>Work day</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border border-primary bg-primary/20 inline-block"></span>
                <span>Today</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-muted border inline-block"></span>
                <span>Rest day</span>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto pb-3 pt-1">
            <div className="flex items-stretch gap-2 min-w-max">
              {timelineData.days.map((day) => {
                const isSprintCompleted = sprint.status === "completed";
                const isPastWorkingDay =
                  (isSprintCompleted || day.isPast) && day.isWorkingDay;
                const isTodayWorkingDay = day.isToday && day.isWorkingDay;

                return (
                  <div
                    key={day.iso}
                    className={`relative flex flex-col items-center justify-between rounded-2xl p-2.5 w-20 transition-all border ${
                      isTodayWorkingDay
                        ? "border-primary bg-primary/10 shadow-xs ring-2 ring-primary/30"
                        : isPastWorkingDay
                          ? "border-primary/30 bg-primary/5 text-foreground"
                          : day.isWorkingDay
                            ? "border-border bg-card text-foreground"
                            : "border-dashed border-border/60 bg-muted/30 text-muted-foreground/70"
                    }`}
                  >
                    {/* Today marker badge */}
                    {day.isToday ? (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-bold text-primary-foreground uppercase tracking-wider shadow-xs">
                        Today
                      </span>
                    ) : null}

                    {/* Day name (Mon, Tue) */}
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {day.dayName}
                    </span>

                    {/* Day number (27, 28) */}
                    <span
                      className={`text-lg font-bold tabular-nums my-1 ${
                        isTodayWorkingDay
                          ? "text-primary"
                          : isPastWorkingDay
                            ? "text-foreground"
                            : day.isWorkingDay
                              ? "text-foreground/90"
                              : "text-muted-foreground/60"
                      }`}
                    >
                      {day.dayNum}
                    </span>

                    {/* Status badge */}
                    <div className="w-full text-center mt-1">
                      {day.isWorkingDay ? (
                        <div className="space-y-0.5">
                          <span
                            className={`inline-flex items-center justify-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-full truncate ${
                              isPastWorkingDay
                                ? "bg-primary/20 text-primary"
                                : isTodayWorkingDay
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isPastWorkingDay ? (
                              <CheckCircle2Icon className="size-2.5 mr-0.5 inline" />
                            ) : null}
                            Day {day.workingDayIndex}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/60 font-medium block">
                          Rest
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sprint Lifecycle Milestones Roadmap */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MilestoneIcon className="size-4 text-primary" />
              Sprint Delivery Milestones
            </CardTitle>
            <CardDescription className="text-xs">
              Clear progression of key phases that occur during every sprint from kickoff to release.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {milestones.map((milestone, index) => {
              const Icon = milestone.icon;
              const isCompleted = milestone.status === "completed";
              const isCurrent = milestone.status === "current";

              return (
                <div
                  key={milestone.id}
                  className={`relative flex flex-col justify-between rounded-2xl border p-4 space-y-3 transition-all ${
                    isCurrent
                      ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/20"
                      : isCompleted
                        ? "border-border bg-card"
                        : "border-border/70 bg-muted/10 opacity-80"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`flex size-8 items-center justify-center rounded-2xl ${
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : isCompleted
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="size-4" />
                      </div>
                      <Badge
                        variant={
                          isCurrent
                            ? "default"
                            : isCompleted
                              ? "secondary"
                              : "outline"
                        }
                        className="text-[10px] font-semibold uppercase tracking-wider"
                      >
                        {isCurrent ? "In Progress" : isCompleted ? "Completed" : "Upcoming"}
                      </Badge>
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-[11px] font-semibold text-primary">
                          Phase 0{index + 1}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {milestone.timeframe}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm text-foreground mt-0.5">
                        {milestone.title}
                      </h3>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {milestone.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>
                      {isCompleted
                        ? "Milestone completed"
                        : isCurrent
                          ? "Current active stage"
                          : "Scheduled stage"}
                    </span>
                    {isCompleted ? (
                      <CheckCircle2Icon className="size-3.5 text-primary" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation Bridge to Activity and Release Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-dashed bg-muted/10">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <ActivityIcon className="size-4 text-primary" />
                Project Member Activity
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Detailed breakdowns of daily work allocations, activity notes, and individual contributor updates.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateToTab("activity")}
              className="w-full justify-between"
            >
              <span>Explore Member Activity</span>
              <ArrowRightIcon className="size-3.5" data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-dashed bg-muted/10">
          <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <FileTextIcon className="size-4 text-primary" />
                Release Notes &amp; Deliverables
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Published release notes summarizing features, fixes, and improvements delivered in this version.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateToTab("release-notes")}
              className="w-full justify-between"
            >
              <span>View Release Notes</span>
              <ArrowRightIcon className="size-3.5" data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
