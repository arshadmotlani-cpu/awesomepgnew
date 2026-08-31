import { DEFAULT_WEEK_SCHEDULE, type DayScheduleInput } from '@/src/workforce/lib/weekOff';

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type ScheduleFieldKind = 'start' | 'end';

export type ScheduleDayState = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isOff: boolean;
};

/** Alias used by employee profile / schedule editors. */
export type ScheduleDayValue = ScheduleDayState;

export function normalizeScheduleDays(initial?: Array<ScheduleDayState | DayScheduleInput>): ScheduleDayState[] {
  const byDay = new Map((initial ?? DEFAULT_WEEK_SCHEDULE).map((d) => [d.dayOfWeek, d]));
  return DAY_LABELS.map((_, dayOfWeek) => {
    const hit = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      startTime: hit?.startTime ?? '11:00',
      endTime: hit?.endTime ?? '20:00',
      isOff: hit ? Boolean(hit.isOff) : dayOfWeek === 0,
    };
  });
}

export function validateScheduleDays(days: DayScheduleInput[]): void {
  for (const day of days) {
    if (day.isOff) continue;
    const label = DAY_LABELS[day.dayOfWeek] ?? `Day ${day.dayOfWeek}`;
    if (!day.startTime || !day.endTime) {
      throw new Error(`${label}: start and end times are required on working days.`);
    }
    if (day.startTime >= day.endTime) {
      throw new Error(`${label}: end time must be after start time.`);
    }
  }
}

export function resolveAdjacentScheduleField(
  dayOfWeek: number,
  field: ScheduleFieldKind,
  direction: 'next' | 'prev',
): { dayOfWeek: number; field: ScheduleFieldKind } {
  if (direction === 'next') {
    if (field === 'start') return { dayOfWeek, field: 'end' };
    if (dayOfWeek >= 6) return { dayOfWeek: 6, field: 'end' };
    return { dayOfWeek: dayOfWeek + 1, field: 'start' };
  }
  if (field === 'end') return { dayOfWeek, field: 'start' };
  if (dayOfWeek <= 0) return { dayOfWeek: 0, field: 'start' };
  return { dayOfWeek: dayOfWeek - 1, field: 'end' };
}

export function resolveVerticalScheduleField(
  dayOfWeek: number,
  field: ScheduleFieldKind,
  direction: 'up' | 'down',
): { dayOfWeek: number; field: ScheduleFieldKind } {
  const nextDay = direction === 'down' ? Math.min(6, dayOfWeek + 1) : Math.max(0, dayOfWeek - 1);
  return { dayOfWeek: nextDay, field };
}

export function applyScheduleDayToTargets(
  days: ScheduleDayState[],
  sourceDayOfWeek: number,
  targetDayOfWeeks: number[],
  options?: { skipOffDays?: boolean },
): ScheduleDayState[] {
  const source = days.find((d) => d.dayOfWeek === sourceDayOfWeek);
  if (!source) return days;
  const targets = new Set(targetDayOfWeeks.filter((d) => d !== sourceDayOfWeek));
  return days.map((day) => {
    if (!targets.has(day.dayOfWeek)) return day;
    if (options?.skipOffDays && day.isOff) return day;
    return {
      ...day,
      startTime: source.startTime,
      endTime: source.endTime,
    };
  });
}

export function workingDayTargets(days: ScheduleDayState[]): number[] {
  return days.filter((d) => !d.isOff).map((d) => d.dayOfWeek);
}

/** Apply weekly-off selection to a schedule while preserving per-day times. */
export function syncScheduleWithWeekOff(
  days: ScheduleDayState[],
  offDays: number[],
): ScheduleDayState[] {
  const offSet = new Set(offDays);
  return days.map((day) => ({
    ...day,
    isOff: offSet.has(day.dayOfWeek),
  }));
}

/** Weekly off is authoritative — off-day flags always win on persist. */
export function reconcileScheduleWithWeekOff(
  scheduleDays: DayScheduleInput[],
  weekOffDays: number[],
): ScheduleDayState[] {
  const offSet = new Set(weekOffDays);
  return normalizeScheduleDays(scheduleDays).map((day) => ({
    ...day,
    isOff: offSet.has(day.dayOfWeek) ? true : day.isOff,
  }));
}

/** Update off flags on an existing schedule without resetting working times. */
export function applyWeekOffToExistingSchedule(
  existing: DayScheduleInput[],
  weekOffDays: number[],
): ScheduleDayState[] {
  const offSet = new Set(weekOffDays);
  return normalizeScheduleDays(existing).map((day) => ({
    ...day,
    isOff: offSet.has(day.dayOfWeek),
  }));
}

export function scheduleDaysToInput(days: ScheduleDayState[]): DayScheduleInput[] {
  return days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    startTime: day.startTime,
    endTime: day.endTime,
    isOff: day.isOff,
  }));
}
