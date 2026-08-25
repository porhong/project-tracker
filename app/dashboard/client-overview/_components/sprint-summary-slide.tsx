"use client";

import { forwardRef } from "react";
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  Clock4Icon,
  FlagIcon,
  HourglassIcon,
  MilestoneIcon,
  UsersIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  computeEffortBreakdown,
  computeMilestoneMetrics,
  computeMilestones,
  computeTimelineData,
  formatDateFull,
  parseUtcDate,
} from "../_lib/summary-data";
import type { ClientSprint, ClientSprintMilestone, ClientSprintProgress } from "../types";

type SprintSummarySlideProps = {
  projectName: string;
  projectDescription?: string | null;
  sprint: ClientSprint;
  progressRows: ClientSprintProgress[];
  totalPlannedHours: number;
  milestones?: ClientSprintMilestone[];
  activityScope?: "own" | "team";
  className?: string;
};

const hours = (value: number) =>
  value.toLocaleString("en", { maximumFractionDigits: 1 });

const monthDayFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

function statusLabel(status: "upcoming" | "in_progress" | "completed" | "delayed") {
  switch (status) {
    case "completed":
      return "Delivered";
    case "in_progress":
      return "In Progress";
    case "delayed":
      return "Delayed";
    default:
      return "Upcoming";
  }
}

export const SprintSummarySlide = forwardRef<HTMLDivElement, SprintSummarySlideProps>(
  function SprintSummarySlide(
    {
      projectName,
      projectDescription,
      sprint,
      progressRows,
      totalPlannedHours,
      milestones: customMilestones,
      activityScope = "team",
      className,
    },
    ref,
  ) {
    const isOwnScope = activityScope === "own";
    const timelineData = computeTimelineData(sprint);
    const milestones = computeMilestones(sprint, timelineData, customMilestones);
    const milestoneMetrics = computeMilestoneMetrics(milestones);
    const effortBreakdown = computeEffortBreakdown(progressRows, totalPlannedHours);

    const startDate = parseUtcDate(sprint.start_date);
    const endDate = parseUtcDate(sprint.end_date);

    const topActivities = effortBreakdown.slice(0, 5);
    const otherActivities = effortBreakdown.slice(5);
    const otherHours = otherActivities.reduce((sum, item) => sum + item.hours, 0);
    const otherPercentage = otherActivities.reduce((sum, item) => sum + item.percentage, 0);
    const chartData =
      otherHours > 0
        ? [...topActivities, { activity: "Other", hours: otherHours, percentage: otherPercentage }]
        : topActivities;

    const chartTotal = chartData.reduce((sum, item) => sum + item.percentage, 0);

    let cumulativeAngle = 0;
    const segments = chartData.map((item, index) => {
      const startAngle = cumulativeAngle;
      const sweep = chartTotal > 0 ? (item.percentage / chartTotal) * 360 : 0;
      cumulativeAngle += sweep;
      const isOther = item.activity === "Other";
      const bgColor = isOther
        ? "bg-muted-foreground"
        : (effortBreakdown[index]?.bgColor ?? "bg-muted-foreground");
      const fillStyle = isOther
        ? { fill: "var(--muted-foreground)" }
        : (effortBreakdown[index]?.fillStyle ?? { fill: "var(--muted-foreground)" });
      return {
        ...item,
        startAngle,
        sweep,
        bgColor,
        fillStyle,
      };
    });

    function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
      const rad = ((angle - 90) * Math.PI) / 180;
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    }

    function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
      const start = polarToCartesian(cx, cy, r, endAngle);
      const end = polarToCartesian(cx, cy, r, startAngle);
      const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
      return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
    }

    return (
      <div
        ref={ref}
        className={cn(
          "relative box-border flex h-[1080px] w-[1920px] flex-col overflow-hidden bg-card p-[56px] font-sans text-foreground",
          className,
        )}
        data-export-slide
      >
        {/* Header */}
        <header className="flex items-start justify-between border-b border-border pb-6">
          <div className="max-w-[65%] space-y-2">
            <h1 className="text-5xl font-bold tracking-tight text-foreground">
              {projectName}
            </h1>
            {projectDescription ? (
              <p className="text-lg leading-relaxed text-muted-foreground line-clamp-2">
                {projectDescription}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="text-xl font-semibold text-foreground">
                Sprint #{sprint.sprint_number}
              </span>
              <Badge
                variant="outline"
                className="h-8 px-2.5 text-base font-semibold tracking-wide"
              >
                {sprint.version}
              </Badge>
              {sprint.status === "active" ? (
                <Badge className="h-8 px-2.5 text-base font-medium">Active Sprint</Badge>
              ) : (
                <Badge variant="secondary" className="h-8 gap-1.5 px-2.5 text-base font-medium">
                  <CheckCircle2Icon className="size-4" data-icon="inline-start" />
                  Completed Sprint
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-xl font-semibold text-foreground">
              <CalendarIcon className="size-5 text-primary" />
              <span>
                {formatDateFull(sprint.start_date)} — {formatDateFull(sprint.end_date)}
              </span>
            </div>
            <p className="mt-1 text-base text-muted-foreground">
              {timelineData.totalWorkingDays} working days ·{" "}
              {monthDayFormat.format(startDate)} – {monthDayFormat.format(endDate)}
            </p>
          </div>
        </header>

        {/* Progress */}
        <section className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <FlagIcon className="size-5 text-primary" />
              Sprint Progress
            </div>
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {timelineData.progressPercent}%
            </span>
          </div>
          <div className="h-5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${timelineData.progressPercent}%` }}
            />
          </div>
          <p className="text-base text-muted-foreground">
            {timelineData.elapsedWorkingDays} of {timelineData.totalWorkingDays} work days completed
            {timelineData.remainingWorkingDays > 0
              ? ` · ${timelineData.remainingWorkingDays} work day${
                  timelineData.remainingWorkingDays === 1 ? "" : "s"
                } remaining`
              : null}
          </p>
        </section>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-3 gap-5">
          {/* Delivery Pace */}
          <div className="flex flex-col justify-between rounded-3xl border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
              <HourglassIcon className="size-4 text-primary" />
              Delivery Pace
            </div>
            <div className="mt-2">
              <p className="text-4xl font-bold tabular-nums text-foreground">
                {timelineData.progressPercent}%
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                {timelineData.elapsedWorkingDays} / {timelineData.totalWorkingDays} work days
              </p>
            </div>
          </div>

          {/* Deliverables */}
          <div className="flex flex-col justify-between rounded-3xl border border-border bg-muted/20 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
                <MilestoneIcon className="size-4 text-primary" />
                Deliverables
              </div>
              {milestoneMetrics.delayed > 0 ? (
                <span className="text-sm font-semibold text-destructive">
                  {milestoneMetrics.delayed} delayed
                </span>
              ) : (
                <span className="text-sm font-semibold text-primary">
                  {milestoneMetrics.percent}% on track
                </span>
              )}
            </div>
            <div className="mt-2">
              <p className="text-4xl font-bold tabular-nums text-foreground">
                {milestoneMetrics.completed}
                <span className="text-xl font-medium text-muted-foreground">
                  {" "}
                  / {milestoneMetrics.total}
                </span>
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                {milestoneMetrics.inProgress > 0
                  ? `${milestoneMetrics.inProgress} currently in progress`
                  : "All delivery phases mapped"}
              </p>
            </div>
          </div>

          {/* Team & Effort */}
          <div className="flex flex-col justify-between rounded-3xl border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
              <UsersIcon className="size-4 text-primary" />
              {isOwnScope ? "My Effort" : "Team & Effort"}
            </div>
            <div className="mt-2">
              <p className="text-4xl font-bold tabular-nums text-foreground">
                {hours(totalPlannedHours)}h
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                {isOwnScope
                  ? "Planned hours"
                  : `${progressRows.length} team member${progressRows.length === 1 ? "" : "s"} assigned`}
              </p>
            </div>
          </div>
        </section>

        {/* Middle section: Focus areas + Milestones */}
        <section className="mt-6 grid min-h-0 flex-1 grid-cols-[1fr_1fr] gap-6">
          {/* Focus areas */}
          <div className="flex min-h-0 flex-col rounded-3xl border border-border bg-muted/10 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Clock4Icon className="size-4 text-primary" />
              Sprint Focus Areas
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Planned effort distribution by activity
            </p>

            <div className="mt-3 flex min-h-0 flex-1 items-center gap-6">
              {/* Donut */}
              <div className="relative shrink-0">
                <svg width="216" height="216" viewBox="0 0 216 216" className="block">
                  {segments.map((segment) => {
                    if (segment.sweep <= 0) return null;
                    const endAngle = segment.startAngle + segment.sweep;
                    const path = describeArc(108, 108, 90, segment.startAngle, endAngle);
                    return (
                      <path
                        key={segment.activity}
                        d={path}
                        className="stroke-card stroke-[3]"
                        style={segment.fillStyle}
                      />
                    );
                  })}
                  <circle cx="108" cy="108" r="58" className="fill-card" />
                  <text
                    x="108"
                    y="104"
                    textAnchor="middle"
                    className="fill-foreground text-2xl font-bold"
                  >
                    {hours(totalPlannedHours)}h
                  </text>
                  <text
                    x="108"
                    y="126"
                    textAnchor="middle"
                    className="fill-muted-foreground text-sm"
                  >
                    Total planned
                  </text>
                </svg>
              </div>

              {/* Legend */}
              <div className="grid flex-1 grid-cols-1 gap-3">
                {chartData.map((item, idx) => {
                  const colorClass = effortBreakdown[idx]?.bgColor ?? "bg-muted-foreground";
                  return (
                    <div key={item.activity} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn("size-3.5 shrink-0 rounded-full", colorClass)} />
                        <span className="truncate text-base font-medium text-foreground">
                          {item.activity}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-base text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">
                          {hours(item.hours)}h
                        </span>
                        <span className="tabular-nums">({item.percentage}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div className="flex min-h-0 flex-col rounded-3xl border border-border bg-muted/10 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <MilestoneIcon className="size-4 text-primary" />
              Key Deliverables
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sequential delivery phases and targets
            </p>

            <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center">
              <div className="relative flex items-start justify-between">
                {milestones.map((milestone, index) => {
                  const isCompleted = milestone.status === "completed";
                  const isCurrent = milestone.status === "in_progress";
                  const isDelayed = milestone.status === "delayed";
                  const isLast = index === milestones.length - 1;

                  return (
                    <div
                      key={milestone.id}
                      className="relative flex flex-1 flex-col items-center text-center"
                    >
                      {/* Connector line to next step */}
                      {!isLast ? (
                        <div
                          className={cn(
                            "absolute left-1/2 top-5 h-1 w-full -translate-y-1/2",
                            isCompleted ? "bg-primary" : "bg-muted",
                          )}
                        />
                      ) : null}

                      {/* Status circle */}
                      <div
                        className={cn(
                          "relative z-10 flex size-10 items-center justify-center rounded-full border-2 shrink-0",
                          isCompleted
                            ? "border-primary bg-primary text-primary-foreground"
                            : isCurrent
                              ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20"
                              : isDelayed
                                ? "border-destructive bg-destructive text-destructive-foreground"
                                : "border-muted bg-card text-muted-foreground",
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle2Icon className="size-5" />
                        ) : isCurrent ? (
                          <Clock4Icon className="size-5" />
                        ) : isDelayed ? (
                          <AlertTriangleIcon className="size-5" />
                        ) : (
                          <span className="size-2.5 rounded-full bg-muted-foreground" />
                        )}
                      </div>

                      {/* Phase label */}
                      <div className="mt-3 max-w-[180px]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {milestone.phaseNumber}
                        </p>
                        <p className="mt-1 text-base font-semibold leading-tight text-foreground">
                          {milestone.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {milestone.timeframe}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-xs font-semibold",
                            isCompleted
                              ? "text-primary"
                              : isCurrent
                                ? "text-primary"
                                : isDelayed
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                          )}
                        >
                          {statusLabel(milestone.status)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Executive summary */}
        <section className="mt-6 rounded-2xl border border-border bg-primary/5 p-5">
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
            <FlagIcon className="size-4 text-primary" />
            Sprint Recap
          </h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div className="flex items-start gap-2.5">
              <CalendarIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-base leading-snug text-foreground">
                <strong>Sprint #{sprint.sprint_number}</strong> ({sprint.version}){" "}
                {sprint.status === "completed"
                  ? "ran"
                  : timelineData.isUpcoming
                    ? "runs"
                    : "runs"}{" "}
                {formatDateFull(sprint.start_date)} — {formatDateFull(sprint.end_date)}
                {timelineData.totalWorkingDays > 0
                  ? ` (${timelineData.totalWorkingDays} working days)`
                  : null}
                .
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <HourglassIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-base leading-snug text-foreground">
                <strong>{timelineData.progressPercent}%</strong>{" "}
                {sprint.status === "completed"
                  ? "completed"
                  : timelineData.isUpcoming
                    ? "upcoming"
                    : "through the sprint"}
                {sprint.status === "completed"
                  ? " on schedule."
                  : timelineData.isUpcoming
                    ? "."
                    : ` — ${timelineData.elapsedWorkingDays} of ${timelineData.totalWorkingDays} work days done.`}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <MilestoneIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-base leading-snug text-foreground">
                <strong>
                  {milestoneMetrics.completed} of {milestoneMetrics.total}
                </strong>{" "}
                deliverables {milestoneMetrics.completed === milestoneMetrics.total ? "delivered" : "complete"}
                {milestoneMetrics.delayed > 0
                  ? `, ${milestoneMetrics.delayed} delayed`
                  : milestoneMetrics.inProgress > 0
                    ? `, ${milestoneMetrics.inProgress} in progress`
                    : ". All on track"}
                .
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <UsersIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-base leading-snug text-foreground">
                <strong>{hours(totalPlannedHours)} hours</strong> planned across{" "}
                {isOwnScope ? "your focus areas" : `${progressRows.length} team member${progressRows.length === 1 ? "" : "s"}`}
                {effortBreakdown.length > 0 ? ": " : "."}
                {effortBreakdown.length > 0
                  ? effortBreakdown
                      .slice(0, 3)
                      .map((item) => `${item.activity} (${item.percentage}%)`)
                      .join(", ")
                  : null}
                {effortBreakdown.length > 3 ? ", and more." : effortBreakdown.length > 0 ? "." : null}
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  },
);
