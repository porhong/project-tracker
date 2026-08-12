export const WEEKDAYS = [
  { value: 1, label: "Monday", shortLabel: "Mon" },
  { value: 2, label: "Tuesday", shortLabel: "Tue" },
  { value: 3, label: "Wednesday", shortLabel: "Wed" },
  { value: 4, label: "Thursday", shortLabel: "Thu" },
  { value: 5, label: "Friday", shortLabel: "Fri" },
  { value: 6, label: "Saturday", shortLabel: "Sat" },
  { value: 7, label: "Sunday", shortLabel: "Sun" },
] as const;

export const SPRINT_STATUSES = ["draft", "active", "completed"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

export function isSprintStatus(value: unknown): value is SprintStatus {
  return typeof value === "string" && SPRINT_STATUSES.includes(value as SprintStatus);
}

export function workingDaysLabel(days: readonly number[]) {
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.shortLabel)
    .join(", ");
}

export function calculateCapacityHours(
  startDate: string,
  endDate: string,
  workingDays: readonly number[],
  dailyHours: number,
) {
  if (!startDate || !endDate || !Number.isFinite(dailyHours) || dailyHours <= 0) {
    return 0;
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end < start) {
    return 0;
  }

  let workdays = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const isoDay = ((cursor.getUTCDay() + 6) % 7) + 1;
    if (workingDays.includes(isoDay)) workdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return workdays * dailyHours;
}
