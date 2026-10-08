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

/** @deprecated Legacy URL preset — mapped to from/to day keys when present without dates. */
export type StaffPerformancePeriodPreset =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom';

export type StaffRevenueCategory = 'service' | 'product' | 'package' | 'membership' | 'combined';

export type StaffPerformanceDayRange = {
  fromDayKey: string;
  toDayKey: string;
};

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDayKey(key: string): boolean {
  return DAY_KEY_RE.test(key.slice(0, 10));
}

export function staffPerformanceTodayDayKey(timezone: string, now = new Date()): string {
  return salonDayBounds(timezone, now).dayKey;
}

export function staffPerformanceDefaultDayRange(
  timezone: string,
  now = new Date(),
): StaffPerformanceDayRange {
  const dayKey = staffPerformanceTodayDayKey(timezone, now);
  return { fromDayKey: dayKey, toDayKey: dayKey };
}

function dayKeyFromUtcInstant(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Inclusive salon-local from/to day keys → exclusive UTC `to` (next midnight). */
export function staffPerformanceDayKeysToDateRange(
  timezone: string,
  fromDayKey: string,
  toDayKey: string,
): DateRange {
  let fromKey = fromDayKey.slice(0, 10);
  let toKey = toDayKey.slice(0, 10);
  if (!isValidDayKey(fromKey) || !isValidDayKey(toKey)) {
    const fallback = staffPerformanceDefaultDayRange(timezone);
    fromKey = fallback.fromDayKey;
    toKey = fallback.toDayKey;
  }
  if (fromKey > toKey) {
    const swap = fromKey;
    fromKey = toKey;
    toKey = swap;
  }
  const from = zonedLocalToUtc(`${fromKey}T00:00:00`, timezone);
  const toStart = zonedLocalToUtc(`${toKey}T00:00:00`, timezone);
  const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

export function staffPerformanceRangeLabel(fromDayKey: string, toDayKey: string): string {
  return `${fromDayKey} → ${toDayKey}`;
}

export function shiftStaffPerformanceDayRange(
  fromDayKey: string,
  toDayKey: string,
  dayDelta: number,
): StaffPerformanceDayRange {
  return {
    fromDayKey: salonDayKeyOffset(fromDayKey.slice(0, 10), dayDelta),
    toDayKey: salonDayKeyOffset(toDayKey.slice(0, 10), dayDelta),
  };
}

function legacyPresetToDayRange(
  timezone: string,
  preset: StaffPerformancePeriodPreset,
  now: Date,
): StaffPerformanceDayRange {
  const { range } = resolveStaffPerformanceRange({ timezone, preset, now });
  const fromDayKey = dayKeyFromUtcInstant(range.from, timezone);
  const toInclusive = new Date(range.to.getTime() - 86_400_000);
  const toDayKey = dayKeyFromUtcInstant(toInclusive, timezone);
  return { fromDayKey, toDayKey };
}

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

/** Same calendar day span in the immediately previous month (MTD-style). */
export function sameMtdLastMonthPreviousRange(
  range: DateRange,
  timezone: string,
): DateRange {
  const fromKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(range.from);
  const toExclusive = range.to;
  const toInclusive = new Date(toExclusive.getTime() - 86_400_000);
  const toKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(toInclusive);

  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const prevMonth = fm === 1 ? 12 : fm - 1;
  const prevYear = fm === 1 ? fy - 1 : fy;
  const lastDayPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
  const prevFromDay = Math.min(fd, lastDayPrevMonth);
  const prevToDay = Math.min(td, lastDayPrevMonth);

  const prevFrom = zonedLocalToUtc(
    `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevFromDay).padStart(2, '0')}T00:00:00`,
    timezone,
  );
  const prevTo = new Date(
    zonedLocalToUtc(
      `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevToDay).padStart(2, '0')}T00:00:00`,
      timezone,
    ).getTime() + 86_400_000,
  );
  return { from: prevFrom, to: prevTo };
}

/** @deprecated Comparison UI removed from staff performance. */
export type StaffPerformanceComparisonMode = 'previous_period' | 'same_mtd_last_month';

export function parseStaffPerformanceSearchParams(
  sp: {
    period?: string;
    from?: string;
    to?: string;
    staff?: string;
    category?: string;
    locations?: string;
    compare?: string;
  },
  timezone = 'Asia/Kolkata',
  now = new Date(),
): {
  fromDayKey: string;
  toDayKey: string;
  staffIds: string[];
  category: StaffRevenueCategory;
  locationIds: string[] | 'all';
} {
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

  const locRaw = sp.locations?.trim();
  const locationIds: string[] | 'all' =
    !locRaw || locRaw === 'all'
      ? 'all'
      : locRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  const fromRaw = sp.from?.trim().slice(0, 10);
  const toRaw = sp.to?.trim().slice(0, 10);
  const hasExplicitFrom = fromRaw && isValidDayKey(fromRaw);
  const hasExplicitTo = toRaw && isValidDayKey(toRaw);

  let fromDayKey: string;
  let toDayKey: string;

  if (hasExplicitFrom || hasExplicitTo) {
    const defaults = staffPerformanceDefaultDayRange(timezone, now);
    fromDayKey = hasExplicitFrom ? fromRaw! : hasExplicitTo ? toRaw! : defaults.fromDayKey;
    toDayKey = hasExplicitTo ? toRaw! : hasExplicitFrom ? fromRaw! : defaults.toDayKey;
    if (fromDayKey > toDayKey) {
      const swap = fromDayKey;
      fromDayKey = toDayKey;
      toDayKey = swap;
    }
  } else if (sp.period?.trim()) {
    const raw = sp.period.toLowerCase();
    const preset: StaffPerformancePeriodPreset =
      raw === 'today' ||
      raw === 'week' ||
      raw === 'month' ||
      raw === 'quarter' ||
      raw === 'year' ||
      raw === 'custom'
        ? raw
        : 'today';
    if (preset === 'custom' && (fromRaw || toRaw)) {
      const defaults = staffPerformanceDefaultDayRange(timezone, now);
      fromDayKey = hasExplicitFrom ? fromRaw! : defaults.fromDayKey;
      toDayKey = hasExplicitTo ? toRaw! : defaults.toDayKey;
    } else {
      ({ fromDayKey, toDayKey } = legacyPresetToDayRange(timezone, preset, now));
    }
  } else {
    ({ fromDayKey, toDayKey } = staffPerformanceDefaultDayRange(timezone, now));
  }

  return {
    fromDayKey,
    toDayKey,
    staffIds,
    category,
    locationIds:
      locationIds === 'all' || (Array.isArray(locationIds) && locationIds.length === 0)
        ? 'all'
        : locationIds,
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
