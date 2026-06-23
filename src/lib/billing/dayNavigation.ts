import { addDays, formatDate, isAfter, parseDate, todayString } from '@/src/lib/dates';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize ?date= query param — defaults to today, caps at today. */
export function resolveSelectedDay(input?: string | null): string {
  const today = todayString();
  if (!input?.trim()) return today;
  const trimmed = input.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(trimmed)) return today;
  try {
    parseDate(trimmed);
  } catch {
    return today;
  }
  return isAfter(trimmed, today) ? today : trimmed;
}

export function shiftSelectedDay(selectedDay: string, deltaDays: number): string {
  return formatDate(addDays(resolveSelectedDay(selectedDay), deltaDays));
}

export function isTodaySelected(selectedDay: string): boolean {
  return resolveSelectedDay(selectedDay) === todayString();
}

export function canNavigateNextDay(selectedDay: string): boolean {
  return !isTodaySelected(selectedDay);
}

export function formatSelectedDayLabel(selectedDay: string): string {
  const day = resolveSelectedDay(selectedDay);
  const today = todayString();
  const formatted = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00.000Z`));
  return day === today ? `Today · ${formatted}` : formatted;
}

export function selectedDayQueryParam(selectedDay: string): string {
  return resolveSelectedDay(selectedDay);
}
