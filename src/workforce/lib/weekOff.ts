import { WORKFORCE_WEEKDAY_LABELS, WORKFORCE_WEEKDAY_ORDER } from '@/src/workforce/types/hr';

export type DayScheduleInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  isOff?: boolean;
};

export const DEFAULT_WEEK_SCHEDULE: DayScheduleInput[] = [
  { dayOfWeek: 0, startTime: '11:00', endTime: '20:00', isOff: true },
  { dayOfWeek: 1, startTime: '11:00', endTime: '20:00', isOff: false },
  { dayOfWeek: 2, startTime: '11:00', endTime: '20:00', isOff: false },
  { dayOfWeek: 3, startTime: '11:00', endTime: '20:00', isOff: false },
  { dayOfWeek: 4, startTime: '11:00', endTime: '20:00', isOff: false },
  { dayOfWeek: 5, startTime: '11:00', endTime: '20:00', isOff: false },
  { dayOfWeek: 6, startTime: '11:00', endTime: '20:00', isOff: false },
];

export function parseWeekOffDays(formData: FormData): number[] {
  return formData
    .getAll('weekOff')
    .map((v) => Number(v))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

export function scheduleFromWeekOffDays(offDays: number[]): DayScheduleInput[] {
  const offSet = new Set(offDays);
  const base = DEFAULT_WEEK_SCHEDULE.map((d) => ({ ...d }));
  if (offSet.size === 0) {
    return base;
  }
  return base.map((day) => ({
    ...day,
    isOff: offSet.has(day.dayOfWeek),
  }));
}

export function weekOffDaysFromSchedule(
  schedule: Array<{ dayOfWeek: number; isOff: boolean }>,
): number[] {
  const byDay = new Map(schedule.map((s) => [s.dayOfWeek, s.isOff]));
  return WORKFORCE_WEEKDAY_ORDER.filter((d) => byDay.get(d) === true);
}

export function formatWeekOffDays(days: number[]): string {
  if (days.length === 0) return 'None';
  return days.map((d) => WORKFORCE_WEEKDAY_LABELS[d]).join(', ');
}
