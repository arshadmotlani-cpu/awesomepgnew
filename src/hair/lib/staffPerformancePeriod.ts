/**
 * Staff performance date-range presets and MoM delta helpers (pure).
 */

import {
  salonDayBounds,
  salonDayKeyOffset,
  salonMonthStartUtc,
  salonWeekStartUtc,
  zonedLocalToUtc,
} from '@/src/hair/lib/salonTime';
import type { DateRange } from '@/src/hair/services/staffPerformance';

export type StaffPerformancePeriodPreset =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom';

export type StaffRevenueCategory = 'service' | 'product' | 'package' | 'membership' | 'combined';

export function momDeltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function momDeltaDirection(deltaPct: number | null): 'up' | 'down' | 'flat' | 'na' {
  if (deltaPct == null) return 'na';
  if (deltaPct > 0) return 'up';
  if (deltaPct < 0) return 'down';
  return 'flat';
}

function salonYearStartUtc(timezone: string, now = new Date()): Date {
  const { dayKey } = salonDayBounds(timezone, now);
  const [y] = dayKey.split('-');
  return zonedLocalToUtc(`${y}-01-01T00:00:00`, timezone);
}

function salonQuarterStartUtc(timezone: string, now = new Date()): Date {
  const { dayKey } = salonDayBounds(timezone, now);
  const [y, m] = dayKey.split('-').map(Number);
  const qStartMonth = Math.floor(((m ?? 1) - 1) / 3) * 3 + 1;
  return zonedLocalToUtc(
    `${y}-${String(qStartMonth).padStart(2, '0')}-01T00:00:00`,
    timezone,
  );
}

/** Equal-length previous period immediately before `range.from`. */
export function previousEqualRange(range: DateRange): DateRange {
  const ms = Math.max(0, range.to.getTime() - range.from.getTime());
  return {
    from: new Date(range.from.getTime() - ms),
    to: new Date(range.from.getTime()),
  };
}

export function resolveStaffPerformanceRange(input: {
  timezone: string;
  preset: StaffPerformancePeriodPreset;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { range: DateRange; previousRange: DateRange; label: string } {
  const tz = input.timezone;
  const now = input.now ?? new Date();
  const { end: todayEnd, dayKey } = salonDayBounds(tz, now);

  let from: Date;
  let to: Date = todayEnd;
  let label: string;

  switch (input.preset) {
    case 'today': {
      const bounds = salonDayBounds(tz, now);
      from = bounds.start;
      to = bounds.end;
      label = 'Today';
      break;
    }
    case 'week': {
      from = salonWeekStartUtc(tz, now);
      label = 'This week';
      break;
    }
    case 'month': {
      from = salonMonthStartUtc(tz, now);
      label = 'This month';
      break;
    }
    case 'quarter': {
      from = salonQuarterStartUtc(tz, now);
      label = 'This quarter';
      break;
    }
    case 'year': {
      from = salonYearStartUtc(tz, now);
      label = 'This year';
      break;
    }
    case 'custom': {
      const fromKey = (input.from ?? dayKey).slice(0, 10);
      const toKey = (input.to ?? dayKey).slice(0, 10);
      from = zonedLocalToUtc(`${fromKey}T00:00:00`, tz);
      const toStart = zonedLocalToUtc(`${toKey}T00:00:00`, tz);
      to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
      label = `${fromKey} → ${toKey}`;
      break;
    }
    default: {
      from = salonMonthStartUtc(tz, now);
      label = 'This month';
    }
  }

  if (from.getTime() > to.getTime()) {
    const swap = from;
    from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    to = new Date(swap.getTime() + 24 * 60 * 60 * 1000);
  }

  const range = { from, to };
  return { range, previousRange: previousEqualRange(range), label };
}

export function parseStaffPerformanceSearchParams(sp: {
  period?: string;
  from?: string;
  to?: string;
  staff?: string;
  category?: string;
}): {
  preset: StaffPerformancePeriodPreset;
  from: string | null;
  to: string | null;
  staffIds: string[];
  category: StaffRevenueCategory;
} {
  const raw = (sp.period ?? 'month').toLowerCase();
  const preset: StaffPerformancePeriodPreset =
    raw === 'today' ||
    raw === 'week' ||
    raw === 'month' ||
    raw === 'quarter' ||
    raw === 'year' ||
    raw === 'custom'
      ? raw
      : 'month';

  const cat = (sp.category ?? 'combined').toLowerCase();
  const category: StaffRevenueCategory =
    cat === 'service' ||
    cat === 'product' ||
    cat === 'package' ||
    cat === 'membership' ||
    cat === 'combined'
      ? cat
      : 'combined';

  const staffIds = (sp.staff ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    preset,
    from: sp.from?.slice(0, 10) ?? null,
    to: sp.to?.slice(0, 10) ?? null,
    staffIds,
    category,
  };
}

/** Sort leaderboard rows by revenue descending (stable for ties by name). */
export function sortStaffByRevenue<T extends { revenuePaise: number; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (b.revenuePaise !== a.revenuePaise) return b.revenuePaise - a.revenuePaise;
    return a.name.localeCompare(b.name);
  });
}

export function chartHasData(values: number[]): boolean {
  return values.some((v) => Number.isFinite(v) && v > 0);
}

/** Exported for tests — day key helper used by custom ranges. */
export { salonDayKeyOffset };
