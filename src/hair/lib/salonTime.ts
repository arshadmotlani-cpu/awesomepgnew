/**
 * Salon-local day bounds using IANA timezone (default Asia/Kolkata).
 */

/** 0 = Sunday … 6 = Saturday, in the salon IANA timezone. */
export function salonDayOfWeek(timezone = 'Asia/Kolkata', now = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? now.getDay();
}

/** YYYY-MM-DD calendar day in salon TZ, offset by whole days from `anchorDayKey`. */
export function salonDayKeyOffset(anchorDayKey: string, dayDelta: number): string {
  const [y, m, d] = anchorDayKey.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + dayDelta);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Monday 00:00 salon-local → UTC instant (week starts Monday). */
export function salonWeekStartUtc(timezone = 'Asia/Kolkata', now = new Date()): Date {
  const { dayKey } = salonDayBounds(timezone, now);
  const dow = salonDayOfWeek(timezone, now);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekKey = salonDayKeyOffset(dayKey, mondayOffset);
  return zonedLocalToUtc(`${weekKey}T00:00:00`, timezone);
}

/** First day of calendar month in salon TZ → UTC instant. */
export function salonMonthStartUtc(timezone = 'Asia/Kolkata', now = new Date()): Date {
  const { dayKey } = salonDayBounds(timezone, now);
  const [y, m] = dayKey.split('-');
  return zonedLocalToUtc(`${y}-${m}-01T00:00:00`, timezone);
}

export function salonDayBounds(timezone = 'Asia/Kolkata', now = new Date()) {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  // Interpret midnight of that calendar day in the salon TZ as Instant via offset probe.
  const start = zonedLocalToUtc(`${dayKey}T00:00:00`, timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, dayKey };
}

/** Convert a local wall time in `timezone` to a UTC Date. */
export function zonedLocalToUtc(localIso: string, timezone: string): Date {
  // localIso like 2026-07-29T10:00:00 (no Z)
  const asUtc = new Date(`${localIso}Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(asUtc).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  const asTz = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = asTz - asUtc.getTime();
  return new Date(asUtc.getTime() - offset);
}

export function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map(Number);
  return { hour: h ?? 10, minute: m ?? 0 };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
