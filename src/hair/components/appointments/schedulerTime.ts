import { zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import { SLOT_MIN, snapMinutes } from './schedulerConstants';

export function minutesInSalonTz(date: Date, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour ?? 0);
  const minute = Number(parts.minute ?? 0);
  return hour * 60 + minute;
}

export function formatHmInSalonTz(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function salonDayKeyFromUtc(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Build UTC instant from calendar day + minutes from midnight in salon TZ. */
export function utcFromDayAndMinutes(
  dayIso: string,
  minutesFromMidnight: number,
  timezone: string,
): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const local = `${dayIso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  return zonedLocalToUtc(local, timezone);
}

export function clampAndSnapStartMinutes(
  minutes: number,
  dayStartHour: number,
  dayEndHour: number,
): number {
  const min = dayStartHour * 60;
  const max = dayEndHour * 60 - SLOT_MIN;
  return snapMinutes(Math.max(min, Math.min(max, minutes)));
}

export function addDaysIso(dayIso: string, n: number): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function weekDayKeys(dayIso: string): string[] {
  const [y, m, d] = dayIso.split('-').map(Number);
  const anchor = new Date(y!, m! - 1, d!);
  const dow = anchor.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    const yy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  });
}
