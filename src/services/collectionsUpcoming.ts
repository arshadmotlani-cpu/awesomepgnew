/**
 * Upcoming collections window — residents whose next billing/due date falls
 * within N days and who do not yet have an open invoice for that cycle.
 * Money amounts come from billing profiles; dates from billing cycle helpers.
 */

import { addDays, formatDate } from '@/src/lib/dates';
import {
  listUpcomingRentDueDates,
  type UpcomingRentDueRow,
} from '@/src/services/upcomingRentDue';

export type CollectionsUpcomingRow = UpcomingRentDueRow & {
  /** Always true for rows from this service. */
  isUpcoming: true;
  expectedRentPaise: number;
};

export async function listCollectionsUpcoming(opts?: {
  pgId?: string;
  /** Inclusive horizon in days (default 7). */
  withinDays?: number;
  today?: string;
  limit?: number;
}): Promise<CollectionsUpcomingRow[]> {
  const today = opts?.today ?? formatDate(new Date());
  const withinDays = opts?.withinDays ?? 7;
  const horizonEnd = formatDate(addDays(today, withinDays));

  const rows = await listUpcomingRentDueDates({
    pgId: opts?.pgId,
    limit: opts?.limit ?? 500,
  });

  return rows
    .filter((row) => {
      // Only virtual upcoming: no open invoice yet, due within window (not past).
      if (row.openInvoiceId) return false;
      if (row.nextDueDate < today) return false;
      if (row.nextDueDate > horizonEnd) return false;
      return true;
    })
    .map((row) => ({
      ...row,
      isUpcoming: true as const,
      expectedRentPaise: row.monthlyRentPaise,
    }));
}

export function filterUpcomingWithinDays(
  rows: UpcomingRentDueRow[],
  opts: { today: string; withinDays?: number },
): CollectionsUpcomingRow[] {
  const withinDays = opts.withinDays ?? 7;
  const horizonEnd = formatDate(addDays(opts.today, withinDays));
  return rows
    .filter((row) => {
      if (row.openInvoiceId) return false;
      if (row.nextDueDate < opts.today) return false;
      if (row.nextDueDate > horizonEnd) return false;
      return true;
    })
    .map((row) => ({
      ...row,
      isUpcoming: true as const,
      expectedRentPaise: row.monthlyRentPaise,
    }));
}
