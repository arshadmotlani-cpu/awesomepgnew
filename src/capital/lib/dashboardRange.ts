export type DashboardRange =
  | 'today'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'custom'
  | 'all';

export type DateRange = {
  from?: string;
  to?: string;
  label: string;
  key: DashboardRange;
  /** YYYY-MM when key === 'month' — supports month cursor navigation */
  month?: string;
};

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  return isoDate(d);
}

function monthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 1)).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Shift YYYY-MM by delta months. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function resolveDashboardRange(
  key: string | undefined,
  customFrom?: string,
  customTo?: string,
  monthCursor?: string,
): DateRange {
  const now = new Date();
  const today = isoDate(now);

  switch (key) {
    case 'today':
      return { from: today, to: today, label: 'Today', key: 'today' };
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      return { from: isoDate(start), to: today, label: 'This week', key: 'week' };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { from: isoDate(start), to: today, label: 'This quarter', key: 'quarter' };
    }
    case 'year':
      return {
        from: `${now.getFullYear()}-01-01`,
        to: today,
        label: 'This year',
        key: 'year',
      };
    case 'custom':
      return {
        from: customFrom || undefined,
        to: customTo || undefined,
        label: 'Custom range',
        key: 'custom',
      };
    case 'all':
      return { label: 'All time', key: 'all' };
    case 'month':
    default: {
      const ym =
        monthCursor && /^\d{4}-\d{2}$/.test(monthCursor)
          ? monthCursor
          : currentMonthKey(now);
      const [y, m] = ym.split('-').map(Number);
      const from = `${ym}-01`;
      const monthEnd = lastDayOfMonth(y, m - 1);
      const to = monthEnd > today && ym === currentMonthKey(now) ? today : monthEnd;
      const isFuture = from > today;
      return {
        from,
        to: isFuture ? from : to,
        label: monthLabel(y, m - 1),
        key: 'month',
        month: ym,
      };
    }
  }
}

export function previousPeriod(range: DateRange): DateRange {
  if (range.key === 'month' && range.month) {
    const prev = shiftMonth(range.month, -1);
    const [y, m] = prev.split('-').map(Number);
    return {
      from: `${prev}-01`,
      to: lastDayOfMonth(y, m - 1),
      label: monthLabel(y, m - 1),
      key: 'month',
      month: prev,
    };
  }
  if (!range.from || !range.to) return { label: 'Prior', key: 'all' };
  const from = new Date(`${range.from}T00:00:00Z`);
  const to = new Date(`${range.to}T00:00:00Z`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  return {
    from: isoDate(prevFrom),
    to: isoDate(prevTo),
    label: 'Previous period',
    key: 'custom',
  };
}

export function isFutureRange(range: DateRange, today = isoDate(new Date())): boolean {
  if (!range.from) return false;
  return range.from > today;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
