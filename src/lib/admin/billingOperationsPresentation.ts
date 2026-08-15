import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';
import type { BillingRecentCollectionRow } from '@/src/lib/admin/billingCollectionsFilter';
import { filterBillingCollectionsByDate } from '@/src/lib/admin/billingCollectionsFilter';
import { addDays, diffDays, formatDate } from '@/src/lib/dates';
import type { UpcomingRentResidentRow } from '@/src/services/billingUpcomingSchedule';

export type BillingOpsStatusFilter =
  | 'all'
  | 'upcoming'
  | 'generated'
  | 'pending'
  | 'paid'
  | 'overdue';

export type UpcomingGenerationBucket = 'today' | 'next_3' | 'next_7';

export type UpcomingGenerationHighlight = 'red' | 'orange' | 'yellow' | 'blue' | null;

export type UpcomingStatusTone = 'red' | 'orange' | 'yellow' | 'blue';

export type UpcomingGenerationSummaryKpis = {
  billsToday: number;
  tomorrow: number;
  next7Days: number;
  expectedCollectionPaise: number;
};

export type OverdueBucket = '1-3' | '4-7' | '8-15' | '15+';

export type BillingUpcomingGenerationRow = UpcomingRentResidentRow & {
  depositHeldPaise: number;
  currentOutstandingPaise: number;
  bucket: UpcomingGenerationBucket;
  highlight: UpcomingGenerationHighlight;
  billingCycleLabel: string;
};

export type BillingGeneratedTodayRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  bookingId: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  rentPaise: number;
  electricityPaise: number | null;
  totalPaise: number;
  paymentStatus: string;
  financialInvoiceId: string | null;
};

export type BillingPendingPaymentRow = {
  id: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode?: string;
  bookingId: string;
  invoiceNumber: string;
  generatedDate: string;
  dueDate: string | null;
  daysOutstanding: number;
  amountDuePaise: number;
  lastReminderSentAt: Date | null;
  reminderCount: number;
  paymentStatus: string;
  financialInvoiceId: string | null;
};

export type BillingOverdueRow = BillingPendingPaymentRow & {
  overdueBucket: OverdueBucket;
};

export type BillingOperationsKpis = {
  billsGeneratingToday: number;
  billsGeneratingThisWeek: number;
  pendingCollectionsPaise: number;
  pendingCollectionsCount: number;
  overdueCollectionsPaise: number;
  overdueCollectionsCount: number;
  collectedTodayPaise: number;
  collectedTodayCount: number;
  collectedThisMonthPaise: number;
  collectedThisMonthCount: number;
};

export type BillingOperationsFilters = {
  pgId?: string;
  roomQuery?: string;
  residentQuery?: string;
  status?: BillingOpsStatusFilter;
};

export type BillingOperationsSnapshot = {
  todayIso: string;
  kpis: BillingOperationsKpis;
  upcomingGeneration: BillingUpcomingGenerationRow[];
  generatedToday: BillingGeneratedTodayRow[];
  pendingPayments: BillingPendingPaymentRow[];
  recentlyPaid: BillingRecentCollectionRow[];
  overdueByBucket: Record<OverdueBucket, BillingOverdueRow[]>;
  pgs: Array<{ id: string; name: string }>;
};

export function billingCycleLabel(billingDay: number): string {
  return `Day ${billingDay} of month`;
}

export function classifyUpcomingGenerationBucket(
  issueDate: string,
  todayIso: string,
): UpcomingGenerationBucket | null {
  const delta = diffDays(todayIso, issueDate);
  if (delta < 0) return null;
  if (delta === 0) return 'today';
  if (delta <= 3) return 'next_3';
  if (delta <= 7) return 'next_7';
  return null;
}

export function upcomingGenerationHighlight(
  issueDate: string,
  todayIso: string,
): UpcomingGenerationHighlight {
  const delta = diffDays(todayIso, issueDate);
  if (delta === 0) return 'red';
  if (delta === 1) return 'orange';
  if (delta >= 2 && delta <= 3) return 'yellow';
  if (delta >= 4 && delta <= 7) return 'blue';
  return null;
}

export function upcomingGenerationStatusBadge(
  issueDate: string,
  todayIso: string,
): { label: string; tone: UpcomingStatusTone } {
  const delta = diffDays(todayIso, issueDate);
  if (delta === 0) return { label: 'Generates Today', tone: 'red' };
  if (delta === 1) return { label: 'Tomorrow', tone: 'orange' };
  if (delta >= 2 && delta <= 3) return { label: 'Within 3 Days', tone: 'yellow' };
  return { label: 'Within 4 Days', tone: 'blue' };
}

export function upcomingGenerationSortKey(issueDate: string, todayIso: string): number {
  const delta = diffDays(todayIso, issueDate);
  if (delta === 0) return 0;
  if (delta === 1) return 1;
  if (delta >= 2 && delta <= 3) return 2;
  if (delta >= 4 && delta <= 7) return 3;
  return 99;
}

export function sortUpcomingGenerationRows(
  rows: BillingUpcomingGenerationRow[],
  todayIso: string,
): BillingUpcomingGenerationRow[] {
  return [...rows].sort((a, b) => {
    const keyDiff =
      upcomingGenerationSortKey(a.issueDate, todayIso) -
      upcomingGenerationSortKey(b.issueDate, todayIso);
    if (keyDiff !== 0) return keyDiff;
    return (
      a.issueDate.localeCompare(b.issueDate) || a.customerName.localeCompare(b.customerName)
    );
  });
}

export function buildUpcomingGenerationSummaryKpis(
  rows: BillingUpcomingGenerationRow[],
  todayIso: string,
): UpcomingGenerationSummaryKpis {
  const tomorrowIso = formatDate(addDays(todayIso, 1));
  const weekEnd = formatDate(addDays(todayIso, 7));

  return {
    billsToday: rows.filter((r) => r.issueDate === todayIso).length,
    tomorrow: rows.filter((r) => r.issueDate === tomorrowIso).length,
    next7Days: rows.filter((r) => r.issueDate >= todayIso && r.issueDate <= weekEnd).length,
    expectedCollectionPaise: rows.reduce((sum, r) => sum + r.expectedRentPaise, 0),
  };
}

export function classifyOverdueBucket(daysOutstanding: number): OverdueBucket {
  if (daysOutstanding <= 3) return '1-3';
  if (daysOutstanding <= 7) return '4-7';
  if (daysOutstanding <= 15) return '8-15';
  return '15+';
}

export function buildUpcomingGenerationRows(input: {
  scheduleResidents: UpcomingRentResidentRow[];
  depositHeldByBooking: Map<string, number>;
  outstandingByBooking: Map<string, number>;
  todayIso: string;
}): BillingUpcomingGenerationRow[] {
  const rows: BillingUpcomingGenerationRow[] = [];

  for (const resident of input.scheduleResidents) {
    const bucket = classifyUpcomingGenerationBucket(resident.issueDate, input.todayIso);
    if (!bucket) continue;

    rows.push({
      ...resident,
      depositHeldPaise: input.depositHeldByBooking.get(resident.bookingId) ?? 0,
      currentOutstandingPaise: input.outstandingByBooking.get(resident.bookingId) ?? 0,
      bucket,
      highlight: upcomingGenerationHighlight(resident.issueDate, input.todayIso),
      billingCycleLabel: billingCycleLabel(resident.billingDay),
    });
  }

  return rows.sort(
    (a, b) =>
      a.issueDate.localeCompare(b.issueDate) ||
      a.customerName.localeCompare(b.customerName),
  );
}

export function sumOutstandingByBooking(openRent: AdminRentInvoiceRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of openRent) {
    if (row.outstandingPaise <= 0) continue;
    map.set(row.bookingId, (map.get(row.bookingId) ?? 0) + row.outstandingPaise);
  }
  return map;
}

export function buildPendingPaymentRows(input: {
  openRent: AdminRentInvoiceRow[];
  reminderStats: Map<string, { lastSentAt: Date | null; count: number }>;
  financialIdMap: Map<string, string>;
  todayIso: string;
}): BillingPendingPaymentRow[] {
  const rows: BillingPendingPaymentRow[] = [];

  for (const row of input.openRent) {
    if (row.outstandingPaise <= 0) continue;
    if (row.effectiveStatus === 'paid' || row.effectiveStatus === 'cancelled') continue;
    if (row.effectiveStatus === 'payment_in_progress') continue;
    if (!row.dueDate) continue;

    const generatedDate = row.createdAt.toISOString().slice(0, 10);
    const daysOutstanding = Math.max(0, diffDays(row.dueDate, input.todayIso));
    const reminder = input.reminderStats.get(row.id);

    rows.push({
      id: row.id,
      customerId: row.customerId,
      customerFullName: row.customerFullName,
      customerPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      bookingId: row.bookingId,
      invoiceNumber: row.invoiceNumber,
      generatedDate,
      dueDate: row.dueDate,
      daysOutstanding,
      amountDuePaise: row.outstandingPaise,
      lastReminderSentAt: reminder?.lastSentAt ?? null,
      reminderCount: reminder?.count ?? 0,
      paymentStatus: row.effectiveStatus,
      financialInvoiceId: input.financialIdMap.get(`rent_invoices:${row.id}`) ?? null,
    });
  }

  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function buildOverdueByBucket(
  pending: BillingPendingPaymentRow[],
  todayIso: string,
): Record<OverdueBucket, BillingOverdueRow[]> {
  const buckets: Record<OverdueBucket, BillingOverdueRow[]> = {
    '1-3': [],
    '4-7': [],
    '8-15': [],
    '15+': [],
  };

  for (const row of pending) {
    if (row.dueDate >= todayIso && row.paymentStatus !== 'overdue') continue;
    const days = Math.max(1, diffDays(row.dueDate, todayIso));
    const overdueBucket = classifyOverdueBucket(days);
    buckets[overdueBucket].push({ ...row, daysOutstanding: days, overdueBucket });
  }

  for (const key of Object.keys(buckets) as OverdueBucket[]) {
    buckets[key].sort((a, b) => b.daysOutstanding - a.daysOutstanding);
  }

  return buckets;
}

export function buildBillingOperationsKpis(input: {
  upcomingGeneration: BillingUpcomingGenerationRow[];
  pendingPayments: BillingPendingPaymentRow[];
  overdueByBucket: Record<OverdueBucket, BillingOverdueRow[]>;
  recentlyPaid: BillingRecentCollectionRow[];
  todayIso: string;
}): BillingOperationsKpis {
  const weekEnd = formatDate(addDays(input.todayIso, 7));
  const billsGeneratingToday = input.upcomingGeneration.filter((r) => r.bucket === 'today').length;
  const billsGeneratingThisWeek = input.upcomingGeneration.filter(
    (r) => r.issueDate >= input.todayIso && r.issueDate <= weekEnd,
  ).length;

  const pendingCollectionsPaise = input.pendingPayments.reduce((s, r) => s + r.amountDuePaise, 0);
  const overdueRows = Object.values(input.overdueByBucket).flat();
  const overdueCollectionsPaise = overdueRows.reduce((s, r) => s + r.amountDuePaise, 0);

  const paidToday = filterBillingCollectionsByDate(input.recentlyPaid, 'today');
  const paidMonth = filterBillingCollectionsByDate(input.recentlyPaid, 'month');

  return {
    billsGeneratingToday,
    billsGeneratingThisWeek,
    pendingCollectionsPaise,
    pendingCollectionsCount: input.pendingPayments.length,
    overdueCollectionsPaise,
    overdueCollectionsCount: overdueRows.length,
    collectedTodayPaise: paidToday.reduce((s, r) => s + r.amountPaise, 0),
    collectedTodayCount: paidToday.length,
    collectedThisMonthPaise: paidMonth.reduce((s, r) => s + r.amountPaise, 0),
    collectedThisMonthCount: paidMonth.length,
  };
}

function matchesQuery(haystack: string, query?: string): boolean {
  if (!query?.trim()) return true;
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

export function applyBillingOperationsFilters(
  snapshot: BillingOperationsSnapshot,
  filters: BillingOperationsFilters,
): BillingOperationsSnapshot {
  const pgId = filters.pgId;
  const roomQuery = filters.roomQuery;
  const residentQuery = filters.residentQuery;
  const status = filters.status ?? 'all';

  const pgMatch = <T extends { pgId: string }>(row: T) => !pgId || row.pgId === pgId;
  const roomMatch = (roomNumber: string) => matchesQuery(roomNumber, roomQuery);
  const residentMatch = (name: string, phone?: string) =>
    matchesQuery(name, residentQuery) || matchesQuery(phone ?? '', residentQuery);

  const upcomingGeneration =
    status === 'all' || status === 'upcoming'
      ? snapshot.upcomingGeneration.filter(
          (r) => pgMatch(r) && roomMatch(r.roomNumber) && residentMatch(r.customerName, r.customerPhone),
        )
      : [];

  const generatedToday =
    status === 'all' || status === 'generated'
      ? snapshot.generatedToday.filter(
          (r) =>
            pgMatch(r) && roomMatch(r.roomNumber) && residentMatch(r.customerName, r.customerPhone),
        )
      : [];

  const pendingPayments =
    status === 'all' || status === 'pending'
      ? snapshot.pendingPayments.filter(
          (r) =>
            pgMatch(r) &&
            roomMatch(r.roomNumber) &&
            residentMatch(r.customerFullName, r.customerPhone),
        )
      : [];

  const pgNameById = new Map(snapshot.pgs.map((p) => [p.id, p.name]));

  const filterRecentlyPaid = (rows: BillingRecentCollectionRow[]) => {
    if (!pgId) return rows;
    const pgName = pgNameById.get(pgId);
    if (!pgName) return rows;
    return rows.filter((r) => r.pgName === pgName);
  };

  const recentlyPaid =
    status === 'all' || status === 'paid'
      ? filterRecentlyPaid(
          snapshot.recentlyPaid.filter(
            (r) => roomMatch(r.roomNumber) && residentMatch(r.customerFullName, r.customerPhone),
          ),
        )
      : [];

  const overdueFiltered: Record<OverdueBucket, BillingOverdueRow[]> = {
    '1-3': [],
    '4-7': [],
    '8-15': [],
    '15+': [],
  };

  if (status === 'all' || status === 'overdue') {
    for (const bucket of Object.keys(snapshot.overdueByBucket) as OverdueBucket[]) {
      overdueFiltered[bucket] = snapshot.overdueByBucket[bucket].filter(
        (r) =>
          pgMatch(r) &&
          roomMatch(r.roomNumber) &&
          residentMatch(r.customerFullName, r.customerPhone),
      );
    }
  }

  const filteredRecentlyPaid = recentlyPaid;

  const kpis = buildBillingOperationsKpis({
    upcomingGeneration,
    pendingPayments,
    overdueByBucket: overdueFiltered,
    recentlyPaid: filteredRecentlyPaid,
    todayIso: snapshot.todayIso,
  });

  return {
    ...snapshot,
    kpis,
    upcomingGeneration,
    generatedToday,
    pendingPayments,
    recentlyPaid: filteredRecentlyPaid,
    overdueByBucket: overdueFiltered,
  };
}

export function groupUpcomingByBucket(rows: BillingUpcomingGenerationRow[]) {
  return {
    today: rows.filter((r) => r.bucket === 'today'),
    next3: rows.filter((r) => r.bucket === 'next_3'),
    next7: rows.filter((r) => r.bucket === 'next_7'),
  };
}
