/**
 * Collection Calendar — day aggregates for due / paid / proofs pending.
 * Amounts come from RFE-projected rows only.
 */

import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';
import {
  listAdminOpenRentInvoices,
  listAdminRentInvoices,
} from '@/src/db/queries/admin';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';
import { adminCanAccessPg, type AdminRole } from '@/src/lib/auth/roles';
import { listUpcomingRentDueDates } from '@/src/services/upcomingRentDue';
import type { CollectionsUpcomingRow } from '@/src/services/collectionsUpcoming';
import { filterUpcomingWithinDays } from '@/src/services/collectionsUpcoming';

export type CollectionsCalendarDay = {
  date: string;
  dueCount: number;
  duePaise: number;
  paidCount: number;
  paidPaise: number;
  awaitingCount: number;
  awaitingPaise: number;
  upcomingCount: number;
  upcomingPaise: number;
};

export type CollectionsCalendarSnapshot = {
  month: string; // YYYY-MM
  days: CollectionsCalendarDay[];
};

function monthBounds(month: string): { start: string; end: string } {
  const start = `${month}-01`;
  const startDate = parseDate(start);
  const endDate = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0),
  );
  return { start, end: formatDate(endDate) };
}

function emptyDay(date: string): CollectionsCalendarDay {
  return {
    date,
    dueCount: 0,
    duePaise: 0,
    paidCount: 0,
    paidPaise: 0,
    awaitingCount: 0,
    awaitingPaise: 0,
    upcomingCount: 0,
    upcomingPaise: 0,
  };
}

/** Pure builder for tests. */
export function buildCollectionsCalendarDays(input: {
  month: string;
  openRent: AdminRentInvoiceRow[];
  paidRent: AdminRentInvoiceRow[];
  upcoming: CollectionsUpcomingRow[];
}): CollectionsCalendarDay[] {
  const { start, end } = monthBounds(input.month);
  const byDate = new Map<string, CollectionsCalendarDay>();

  for (let d = start; d <= end; d = formatDate(addDays(d, 1))) {
    byDate.set(d, emptyDay(d));
  }

  const ensure = (date: string) => {
    if (!byDate.has(date)) return null;
    return byDate.get(date)!;
  };

  for (const row of input.openRent) {
    if (!row.dueDate) continue;
    const day = ensure(row.dueDate);
    if (!day) continue;
    if (row.outstandingPaise <= 0 && row.effectiveStatus !== 'payment_in_progress') continue;
    if (row.effectiveStatus === 'cancelled' || row.effectiveStatus === 'expired') continue;
    const amount = row.outstandingPaise;
    const isAwaiting =
      row.effectiveStatus === 'payment_in_progress' || row.status === 'payment_in_progress';
    if (isAwaiting) {
      day.awaitingCount += 1;
      day.awaitingPaise += amount;
    } else {
      day.dueCount += 1;
      day.duePaise += amount;
    }
  }

  for (const row of input.paidRent) {
    if (!row.paidAt) continue;
    const paidDay = formatDate(row.paidAt);
    const day = ensure(paidDay);
    if (!day) continue;
    day.paidCount += 1;
    day.paidPaise += row.rentPaise - row.discountPaise;
  }

  for (const row of input.upcoming) {
    const day = ensure(row.nextDueDate);
    if (!day) continue;
    day.upcomingCount += 1;
    day.upcomingPaise += row.expectedRentPaise;
  }

  return [...byDate.values()];
}

function filterByPgScope<T extends { pgId: string }>(
  rows: T[],
  session: { role: AdminRole; pgScope: string[] | null } | null,
): T[] {
  if (!session || session.role === 'super_admin') return rows;
  return rows.filter((r) =>
    adminCanAccessPg({ role: session.role, pgScope: session.pgScope ?? [] }, r.pgId),
  );
}

export async function loadCollectionsCalendar(opts: {
  month: string; // YYYY-MM
  pgId?: string;
  session?: { role: AdminRole; pgScope: string[] | null } | null;
}): Promise<CollectionsCalendarSnapshot> {
  const month = opts.month.slice(0, 7);
  const { start, end } = monthBounds(month);

  const [openRentResult, paidRentResult, upcomingAll] = await Promise.all([
    listAdminOpenRentInvoices(opts.pgId ? { pgId: opts.pgId } : undefined),
    listAdminRentInvoices({ status: 'paid', ...(opts.pgId ? { pgId: opts.pgId } : {}) }),
    listUpcomingRentDueDates({ pgId: opts.pgId, limit: 1000 }),
  ]);

  let openRent = (openRentResult.ok ? openRentResult.data : []).filter(
    (r) => r.dueDate != null && r.dueDate >= start && r.dueDate <= end,
  );
  let paidRent = (paidRentResult.ok ? paidRentResult.data : []).filter((r) => {
    if (!r.paidAt) return false;
    const d = formatDate(r.paidAt);
    return d >= start && d <= end;
  });
  let upcoming = filterUpcomingWithinDays(upcomingAll, {
    today: start,
    withinDays: Math.max(1, Math.ceil((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000)),
  }).filter((r) => r.nextDueDate >= start && r.nextDueDate <= end);

  if (opts.session) {
    openRent = filterByPgScope(openRent, opts.session);
    paidRent = filterByPgScope(paidRent, opts.session);
    upcoming = filterByPgScope(upcoming, opts.session);
  }

  return {
    month,
    days: buildCollectionsCalendarDays({ month, openRent, paidRent, upcoming }),
  };
}
