import { salonDayBounds } from '@/src/hair/lib/salonTime';

const DAY_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidAppointmentDayIso(raw: string | undefined | null): boolean {
  return Boolean(raw && DAY_ISO_RE.test(raw));
}

/** Current salon-local calendar day (YYYY-MM-DD). Safe on server and client — no UTC slice. */
export function salonTodayKey(timezone = 'Asia/Kolkata', now = new Date()): string {
  return salonDayBounds(timezone, now).dayKey;
}

/**
 * Authoritative appointment calendar day resolution.
 * Explicit URL date wins; otherwise salon-local today.
 */
export function resolveAppointmentDate(input: {
  explicitUrlDate?: string | null;
  now?: Date;
  timezone?: string;
}): string {
  const timezone = input.timezone || 'Asia/Kolkata';
  const now = input.now ?? new Date();
  const raw = input.explicitUrlDate?.trim();
  if (isValidAppointmentDayIso(raw)) return raw!;
  return salonTodayKey(timezone, now);
}

/** Calendar day for an instant in salon timezone (YYYY-MM-DD). */
export function salonDayKeyFromInstant(date: Date, timezone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function buildAppointmentsHref(
  dayIso: string,
  extra?: { customerId?: string | null },
): string {
  const params = new URLSearchParams();
  params.set('date', dayIso);
  if (extra?.customerId) params.set('customerId', extra.customerId);
  const qs = params.toString();
  return qs ? `/appointments?${qs}` : '/appointments';
}
