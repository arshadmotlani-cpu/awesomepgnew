/**
 * Collections reports — aggregates from RFE / projected invoice rows only.
 * Do NOT invent a second money calculator; reuse dashboard projection shapes.
 */

import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';
import {
  listAdminOpenRentInvoices,
  listAdminRentInvoices,
} from '@/src/db/queries/admin';
import { formatDate, parseDate, type DateLike } from '@/src/lib/dates';
import { adminCanAccessPg, type AdminRole } from '@/src/lib/auth/roles';
import {
  buildCollectionsBuckets,
  buildCollectionsKpis,
  type CollectionsDashboardKpis,
} from '@/src/services/collectionsDashboard';
import {
  filterUpcomingWithinDays,
  listCollectionsUpcoming,
} from '@/src/services/collectionsUpcoming';
import { listUpcomingRentDueDates } from '@/src/services/upcomingRentDue';

function asOfIso(value?: DateLike): string {
  return formatDate(parseDate(value ?? new Date()));
}
export type CollectionsReportKpis = CollectionsDashboardKpis & {
  windowLabel: string;
  asOf: string;
};

export type CollectionsReportProjectedRow = {
  outstandingPaise: number;
  collectedPaise: number;
  overduePaise: number;
  expectedPaise: number;
};

/**
 * Pure KPI aggregation from already-projected money fields.
 * Expected = outstanding + collected (window); efficiency = collected / (outstanding + collected).
 */
export function aggregateCollectionsReportKpis(
  rows: CollectionsReportProjectedRow[],
): Pick<
  CollectionsReportKpis,
  'expectedPaise' | 'collectedPaise' | 'outstandingPaise' | 'overduePaise' | 'efficiencyPct'
> {
  let expectedPaise = 0;
  let collectedPaise = 0;
  let outstandingPaise = 0;
  let overduePaise = 0;

  for (const row of rows) {
    expectedPaise += row.expectedPaise;
    collectedPaise += row.collectedPaise;
    outstandingPaise += row.outstandingPaise;
    overduePaise += row.overduePaise;
  }

  const denom = outstandingPaise + collectedPaise;
  const efficiencyPct =
    denom > 0 ? Math.round((collectedPaise / denom) * 1000) / 10 : null;

  return {
    expectedPaise,
    collectedPaise,
    outstandingPaise,
    overduePaise,
    efficiencyPct,
  };
}

/** Map open + paid projections into report row shape for pure tests. */
export function projectedRowsFromAdminInvoices(input: {
  open: AdminRentInvoiceRow[];
  paid: AdminRentInvoiceRow[];
  todayIso: string;
}): CollectionsReportProjectedRow[] {
  const rows: CollectionsReportProjectedRow[] = [];

  for (const inv of input.open) {
    if (inv.outstandingPaise <= 0) continue;
    const overduePaise = inv.dueDate < input.todayIso ? inv.outstandingPaise : 0;
    rows.push({
      outstandingPaise: inv.outstandingPaise,
      collectedPaise: 0,
      overduePaise,
      expectedPaise: inv.outstandingPaise,
    });
  }

  for (const inv of input.paid) {
    if (!inv.paidAt) continue;
    if (formatDate(inv.paidAt) !== input.todayIso) continue;
    const collected = Math.max(0, inv.rentPaise - inv.discountPaise);
    rows.push({
      outstandingPaise: 0,
      collectedPaise: collected,
      overduePaise: 0,
      expectedPaise: collected,
    });
  }

  return rows;
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

/**
 * Load report KPIs for a day window using the same RFE-backed admin queries
 * as the Collections dashboard (no alternate money math).
 */
export async function loadCollectionsReport(opts?: {
  pgId?: string;
  asOf?: DateLike;
  session?: { role: AdminRole; pgScope: string[] | null } | null;
}): Promise<CollectionsReportKpis> {
  const asOf = asOfIso(opts?.asOf);

  const [openRentResult, paidRentResult, upcomingRaw] = await Promise.all([
    listAdminOpenRentInvoices(opts?.pgId ? { pgId: opts.pgId } : undefined),
    listAdminRentInvoices({ status: 'paid', ...(opts?.pgId ? { pgId: opts.pgId } : {}) }),
    opts?.pgId
      ? listCollectionsUpcoming({ pgId: opts.pgId, withinDays: 7, today: asOf })
      : listUpcomingRentDueDates({ limit: 500 }).then((rows) =>
          filterUpcomingWithinDays(rows, { today: asOf, withinDays: 7 }),
        ),
  ]);

  let openRent = openRentResult.ok ? openRentResult.data : [];
  let paidRent = paidRentResult.ok ? paidRentResult.data : [];
  let upcoming = upcomingRaw;

  if (opts?.session) {
    openRent = filterByPgScope(openRent, opts.session);
    paidRent = filterByPgScope(paidRent, opts.session);
    upcoming = filterByPgScope(upcoming, opts.session);
  }

  const buckets = buildCollectionsBuckets({
    openRent,
    paidRent,
    upcoming,
    todayIso: asOf,
  });
  const kpis = buildCollectionsKpis(buckets);

  return {
    ...kpis,
    windowLabel: 'today',
    asOf,
  };
}
