import { salonDayBounds } from '@/src/hair/lib/salonTime';

/** Canonical salon business date (YYYY-MM-DD) — never trust client-supplied dates for writes. */
export function canonicalBusinessDate(timezone = 'Asia/Kolkata', now = new Date()): string {
  return salonDayBounds(timezone, now).dayKey;
}

export function assertSameBusinessDate(
  requestedDate: string,
  timezone = 'Asia/Kolkata',
  now = new Date(),
): void {
  const canonical = canonicalBusinessDate(timezone, now);
  if (requestedDate !== canonical) {
    throw new Error('Attendance can only be marked for today.');
  }
}

export function monthBoundsFromDayKey(dayKey: string): { monthStart: string; monthEnd: string } {
  const [y, m] = dayKey.split('-');
  const monthStart = `${y}-${m}-01`;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  return { monthStart, monthEnd };
}

export function enumerateDatesInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  }
  return out;
}
