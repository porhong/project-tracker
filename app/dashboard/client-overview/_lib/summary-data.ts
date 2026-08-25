import {
  CheckIcon,
  Code2Icon,
  CompassIcon,
  FlagIcon,
  RocketIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { workingDaysLabel } from "@/lib/sprint-config";
import type {
  ActivityNote,
  ClientSprint,
  ClientSprintMilestone,
  ClientSprintProgress,
  PlannedAllocation,
} from "../types";

export const monthDayFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

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

export type ComputedMilestone = {
  id: string;
  phaseNumber: string;
  title: string;
  targetDate: string;
  timeframe: string;
  relativeLabel: string;
  isDueToday: boolean;
  isOverdue: boolean;
  description: string;
  icon: LucideIcon;
  status: "upcoming" | "in_progress" | "completed" | "delayed";
};

export type TimelineData = {
  totalCalendarDays: number;
  totalWorkingDays: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  progressPercent: number;
  isUpcoming: boolean;
  isEnded: boolean;
};

export type MilestoneMetrics = {
  total: number;
  completed: number;
  delayed: number;
  inProgress: number;
  percent: number;
};

export type EffortBreakdownItem = {
  activity: string;
  hours: number;
  percentage: number;
  contributors: string[];
  bgColor: string;
  fillStyle: { fill: string; fillOpacity?: number };
  textColor: string;
};

const SEGMENT_BG_COLORS = [
  "bg-primary",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-accent-foreground/70",
];

const SEGMENT_FILL_STYLES: Array<{ fill: string; fillOpacity?: number }> = [
  { fill: "var(--primary)" },
  { fill: "var(--chart-2)" },
  { fill: "var(--chart-3)" },
  { fill: "var(--chart-4)" },
  { fill: "var(--chart-5)" },
  { fill: "var(--accent-foreground)", fillOpacity: 0.7 },
];

const SEGMENT_TEXT_COLORS = [
  "text-primary",
  "text-chart-2",
  "text-chart-3",
  "text-chart-4",
  "text-chart-5",
  "text-foreground",
];

export function parseUtcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateFull(dateStr: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(parseUtcDate(dateStr));
  } catch {
    return dateStr;
  }
}

export function isPlannedAllocation(value: unknown): value is PlannedAllocation {
  return (
    typeof value === "object" &&
    value !== null &&
    "activity" in value &&
    "hours" in value &&
    typeof value.activity === "string" &&
    typeof value.hours === "number"
  );
}

export function isActivityNote(value: unknown): value is ActivityNote {
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

export function computeTimelineData(
  sprint: ClientSprint,
  referenceDate: Date = new Date(),
): TimelineData {
  const todayIso = formatIsoDate(referenceDate);
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
    const isoDayOfWeek = ((cursor.getUTCDay() + 6) % 7) + 1;
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
}

export function computeMilestones(
  sprint: ClientSprint,
  timelineData: TimelineData,
  customMilestones: ClientSprintMilestone[] | undefined,
  referenceDate: Date = new Date(),
): ComputedMilestone[] {
  const todayIso = formatIsoDate(referenceDate);

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
          const diffDays = Math.round(
            (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          );
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
      relativeLabel:
        isEnded || percent >= 20 ? "Completed" : isUpcoming ? "Upcoming" : "In Progress",
      isDueToday: false,
      isOverdue: false,
      description: "Align sprint objectives, review technical requirements, and assign team priorities.",
      icon: CompassIcon,
      status:
        isEnded || percent >= 20
          ? "completed"
          : isUpcoming
            ? "upcoming"
            : "in_progress",
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
      status:
        isEnded || percent >= 70
          ? "completed"
          : percent >= 20
            ? "in_progress"
            : "upcoming",
    },
    {
      id: "phase-3",
      phaseNumber: "Phase 03",
      title: "QA & Verification",
      targetDate: sprint.end_date,
      timeframe: `Late Sprint – ${endStr}`,
      relativeLabel:
        isEnded || percent >= 95 ? "Completed" : percent >= 70 ? "In Verification" : "Upcoming",
      isDueToday: false,
      isOverdue: false,
      description: "End-to-end quality assurance, issue resolution, staging tests, and sign-off.",
      icon: ShieldCheckIcon,
      status:
        isEnded || percent >= 95
          ? "completed"
          : percent >= 70
            ? "in_progress"
            : "upcoming",
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
      status: isEnded ? "completed" : percent >= 95 ? "in_progress" : "upcoming",
    },
  ];
}

export function computeMilestoneMetrics(milestones: ComputedMilestone[]): MilestoneMetrics {
  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === "completed").length;
  const delayed = milestones.filter((m) => m.status === "delayed" || m.isOverdue).length;
  const inProgress = milestones.filter((m) => m.status === "in_progress").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, delayed, inProgress, percent };
}

export function computeEffortBreakdown(
  progressRows: ClientSprintProgress[],
  totalPlannedHours: number,
): EffortBreakdownItem[] {
  const activityMap = new Map<
    string,
    {
      activity: string;
      hours: number;
      contributors: Set<string>;
    }
  >();

  for (const row of progressRows) {
    const rowAllocations = Array.isArray(row.planned_allocations)
      ? row.planned_allocations.filter(isPlannedAllocation)
      : [];

    for (const alloc of rowAllocations) {
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
    }
  }

  return Array.from(activityMap.values())
    .sort((a, b) => b.hours - a.hours)
    .map((item, index) => {
      const percentage = totalPlannedHours > 0 ? Math.round((item.hours / totalPlannedHours) * 100) : 0;
      return {
        ...item,
        percentage,
        contributors: Array.from(item.contributors),
        bgColor: SEGMENT_BG_COLORS[index % SEGMENT_BG_COLORS.length] ?? "bg-primary",
        fillStyle: SEGMENT_FILL_STYLES[index % SEGMENT_FILL_STYLES.length] ?? { fill: "var(--primary)" },
        textColor: SEGMENT_TEXT_COLORS[index % SEGMENT_TEXT_COLORS.length] ?? "text-primary",
      };
    });
}

export function computeMemberProfiles(progressRows: ClientSprintProgress[]) {
  const map = new Map<
    string,
    {
      name: string;
      competency: string;
      totalSprintHours: number;
      allocations: PlannedAllocation[];
      notes: ActivityNote[];
      latestNote: ActivityNote | null;
    }
  >();

  for (const row of progressRows) {
    const name = row.member_name || "Project member";
    const rowAllocations = Array.isArray(row.planned_allocations)
      ? row.planned_allocations.filter(isPlannedAllocation)
      : [];
    const notes = Array.isArray(row.activity_notes) ? row.activity_notes.filter(isActivityNote) : [];
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
  }

  return map;
}

export { workingDaysLabel };
