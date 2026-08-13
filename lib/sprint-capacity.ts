type SprintCalendar = {
  start_date: string;
  end_date: string;
  working_days: number[];
  daily_work_hours: number;
};

type TimeOffRange = { start_date: string; end_date: string };

function toUtcDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function isoWeekday(date: Date) {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

/** Counts scheduled work days, optionally excluding inclusive leave ranges. */
export function countAvailableSprintDays(
  sprint: SprintCalendar,
  timeOff: readonly TimeOffRange[] = [],
) {
  const start = toUtcDate(sprint.start_date);
  const end = toUtcDate(sprint.end_date);
  if (!start || !end || end < start) return 0;

  const daysOff = new Set<string>();
  for (const range of timeOff) {
    const rangeStart = toUtcDate(range.start_date);
    const rangeEnd = toUtcDate(range.end_date);
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) continue;
    const cursor = new Date(Math.max(start.valueOf(), rangeStart.valueOf()));
    const last = Math.min(end.valueOf(), rangeEnd.valueOf());
    while (cursor.valueOf() <= last) {
      daysOff.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  let days = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (
      sprint.working_days.includes(isoWeekday(cursor)) &&
      !daysOff.has(cursor.toISOString().slice(0, 10))
    ) {
      days += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function memberAvailableHours(
  sprint: SprintCalendar,
  timeOff: readonly TimeOffRange[] = [],
) {
  return countAvailableSprintDays(sprint, timeOff) * Number(sprint.daily_work_hours);
}
