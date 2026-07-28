/**
 * Collections Dashboard — bucket queries over RFE-projected invoice rows.
 * Never recomputes late fees or outstanding; uses AdminRentInvoiceRow projections.
 */

import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';
import {
  listAdminOpenRentInvoices,
  listAdminRentInvoices,
} from '@/src/db/queries/admin';
import { formatDate } from '@/src/lib/dates';
import {
  invoiceLifecycleLabel,
  type CollectionsBucket,
  type CollectionsLifecycleLabel,
} from '@/src/lib/collections/invoiceLifecycleLabel';
import { adminCanAccessPg, type AdminRole } from '@/src/lib/auth/roles';
import {
  filterUpcomingWithinDays,
  listCollectionsUpcoming,
  type CollectionsUpcomingRow,
} from '@/src/services/collectionsUpcoming';
import { resolveFinancialInvoiceIdMap } from '@/src/services/adminCashSettlement';
import { listUpcomingRentDueDates } from '@/src/services/upcomingRentDue';

export type CollectionsQueueRow = {
  id: string;
  bucket: CollectionsBucket;
  lifecycleLabel: CollectionsLifecycleLabel;
  kind: 'rent' | 'upcoming';
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode?: string;
  bookingId: string;
  sourceTable: 'rent_invoices' | null;
  sourceId: string | null;
  financialInvoiceId: string | null;
  invoiceNumber: string | null;
  amountPaise: number;
  dueDate: string;
  billingMonth: string | null;
  effectiveStatus: string;
  paidAt: Date | null;
};

export type CollectionsDashboardKpis = {
  expectedPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  overduePaise: number;
  efficiencyPct: number | null;
  upcomingCount: number;
  dueTodayCount: number;
  overdueCount: number;
  awaitingCount: number;
  paidTodayCount: number;
};

export type CollectionsDashboardSnapshot = {
  kpis: CollectionsDashboardKpis;
  buckets: Record<CollectionsBucket, CollectionsQueueRow[]>;
  todayIso: string;
};

export function classifyOpenRentRow(
  row: AdminRentInvoiceRow,
  todayIso: string,
): { bucket: CollectionsBucket; label: CollectionsLifecycleLabel } | null {
  if (row.effectiveStatus === 'cancelled' || row.effectiveStatus === 'expired') return null;
  if (row.outstandingPaise <= 0 && row.effectiveStatus !== 'payment_in_progress') return null;

  const label = invoiceLifecycleLabel({
    status: row.status,
    effectiveStatus: row.effectiveStatus,
    inProofQueue: true,
  });

  if (label === 'Under Verification' || label === 'Payment Submitted') {
    return { bucket: 'awaiting', label };
  }
  if (label === 'Overdue' || row.dueDate < todayIso) {
    return { bucket: 'overdue', label: label === 'Overdue' ? label : 'Overdue' };
  }
  if (row.dueDate === todayIso) {
    return { bucket: 'due_today', label };
  }
  return null;
}

export function rentRowToCollectionsQueueRow(
  row: AdminRentInvoiceRow,
  bucket: CollectionsBucket,
  label: CollectionsLifecycleLabel,
  financialInvoiceId: string | null,
): CollectionsQueueRow {
  return {
    id: `rent-${row.id}`,
    bucket,
    lifecycleLabel: label,
    kind: 'rent',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    bookingId: row.bookingId,
    sourceTable: 'rent_invoices',
    sourceId: row.id,
    financialInvoiceId,
    invoiceNumber: row.invoiceNumber,
    amountPaise: row.outstandingPaise > 0 ? row.outstandingPaise : row.rentPaise - row.discountPaise,
    dueDate: row.dueDate,
    billingMonth: row.billingMonth,
    effectiveStatus: row.effectiveStatus,
    paidAt: row.paidAt,
  };
}

export function upcomingToCollectionsQueueRow(row: CollectionsUpcomingRow): CollectionsQueueRow {
  return {
    id: `upcoming-${row.bookingId}-${row.nextDueDate}`,
    bucket: 'upcoming',
    lifecycleLabel: 'Upcoming',
    kind: 'upcoming',
    customerId: row.customerId,
    customerFullName: row.customerName,
    customerPhone: row.phone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    bookingId: row.bookingId,
    sourceTable: null,
    sourceId: null,
    financialInvoiceId: null,
    invoiceNumber: null,
    amountPaise: row.expectedRentPaise,
    dueDate: row.nextDueDate,
    billingMonth: null,
    effectiveStatus: 'upcoming',
    paidAt: null,
  };
}

export function paidTodayToCollectionsQueueRow(
  row: AdminRentInvoiceRow,
  financialInvoiceId: string | null,
): CollectionsQueueRow {
  return {
    id: `paid-${row.id}`,
    bucket: 'paid_today',
    lifecycleLabel: 'Paid',
    kind: 'rent',
    customerId: row.customerId,
    customerFullName: row.customerFullName,
    customerPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    bookingId: row.bookingId,
    sourceTable: 'rent_invoices',
    sourceId: row.id,
    financialInvoiceId,
    invoiceNumber: row.invoiceNumber,
    amountPaise: row.rentPaise - row.discountPaise,
    dueDate: row.dueDate,
    billingMonth: row.billingMonth,
    effectiveStatus: 'paid',
    paidAt: row.paidAt,
  };
}

/** Pure builder for tests — no DB. */
export function buildCollectionsBuckets(input: {
  openRent: AdminRentInvoiceRow[];
  paidRent: AdminRentInvoiceRow[];
  upcoming: CollectionsUpcomingRow[];
  todayIso: string;
  financialIdMap?: Map<string, string | null>;
}): Record<CollectionsBucket, CollectionsQueueRow[]> {
  const map = input.financialIdMap ?? new Map<string, string | null>();
  const buckets: Record<CollectionsBucket, CollectionsQueueRow[]> = {
    upcoming: [],
    due_today: [],
    overdue: [],
    awaiting: [],
    paid_today: [],
  };

  for (const u of input.upcoming) {
    buckets.upcoming.push(upcomingToCollectionsQueueRow(u));
  }

  for (const row of input.openRent) {
    const classified = classifyOpenRentRow(row, input.todayIso);
    if (!classified) continue;
    const finId = map.get(`rent_invoices:${row.id}`) ?? null;
    buckets[classified.bucket].push(
      rentRowToCollectionsQueueRow(row, classified.bucket, classified.label, finId),
    );
  }

  for (const row of input.paidRent) {
    if (!row.paidAt) continue;
    if (formatDate(row.paidAt) !== input.todayIso) continue;
    const finId = map.get(`rent_invoices:${row.id}`) ?? null;
    buckets.paid_today.push(paidTodayToCollectionsQueueRow(row, finId));
  }

  return buckets;
}

export function buildCollectionsKpis(
  buckets: Record<CollectionsBucket, CollectionsQueueRow[]>,
): CollectionsDashboardKpis {
  const sum = (rows: CollectionsQueueRow[]) => rows.reduce((a, r) => a + r.amountPaise, 0);

  const overduePaise = sum(buckets.overdue);
  const dueTodayPaise = sum(buckets.due_today);
  const awaitingPaise = sum(buckets.awaiting);
  const upcomingPaise = sum(buckets.upcoming);
  const collectedPaise = sum(buckets.paid_today);
  const outstandingPaise = overduePaise + dueTodayPaise + awaitingPaise;
  const expectedPaise = outstandingPaise + collectedPaise + upcomingPaise;
  const efficiencyPct =
    expectedPaise > 0 ? Math.round((collectedPaise / (outstandingPaise + collectedPaise)) * 1000) / 10 : null;

  return {
    expectedPaise,
    collectedPaise,
    outstandingPaise,
    overduePaise,
    efficiencyPct,
    upcomingCount: buckets.upcoming.length,
    dueTodayCount: buckets.due_today.length,
    overdueCount: buckets.overdue.length,
    awaitingCount: buckets.awaiting.length,
    paidTodayCount: buckets.paid_today.length,
  };
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

export async function loadCollectionsDashboard(opts?: {
  pgId?: string;
  bucket?: CollectionsBucket;
  session?: { role: AdminRole; pgScope: string[] | null } | null;
  todayIso?: string;
}): Promise<CollectionsDashboardSnapshot> {
  const todayIso = opts?.todayIso ?? formatDate(new Date());

  const [openRentResult, paidRentResult, upcomingRaw] = await Promise.all([
    listAdminOpenRentInvoices(opts?.pgId ? { pgId: opts.pgId } : undefined),
    listAdminRentInvoices({ status: 'paid', ...(opts?.pgId ? { pgId: opts.pgId } : {}) }),
    opts?.pgId
      ? listCollectionsUpcoming({ pgId: opts.pgId, withinDays: 7, today: todayIso })
      : listUpcomingRentDueDates({ limit: 500 }).then((rows) =>
          filterUpcomingWithinDays(rows, { today: todayIso, withinDays: 7 }),
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

  const sources = [
    ...openRent.map((r) => ({ sourceTable: 'rent_invoices' as const, sourceId: r.id })),
    ...paidRent
      .filter((r) => r.paidAt && formatDate(r.paidAt) === todayIso)
      .map((r) => ({ sourceTable: 'rent_invoices' as const, sourceId: r.id })),
  ];
  const financialIdMap = await resolveFinancialInvoiceIdMap(sources);

  const buckets = buildCollectionsBuckets({
    openRent,
    paidRent,
    upcoming,
    todayIso,
    financialIdMap,
  });

  return {
    kpis: buildCollectionsKpis(buckets),
    buckets,
    todayIso,
  };
}

export async function loadCollectionsQueueBucket(
  bucket: CollectionsBucket,
  opts?: {
    pgId?: string;
    session?: { role: AdminRole; pgScope: string[] | null } | null;
    todayIso?: string;
  },
): Promise<CollectionsQueueRow[]> {
  const snap = await loadCollectionsDashboard(opts);
  return snap.buckets[bucket];
}
