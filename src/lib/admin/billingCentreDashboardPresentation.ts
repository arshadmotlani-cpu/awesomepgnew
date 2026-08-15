/**
 * Billing Centre command dashboard — pure presentation transforms (no DB).
 */
import { diffDays } from '@/src/lib/dates';
import type { BillingRecentCollectionRow } from '@/src/lib/admin/billingCollectionsFilter';
import {
  filterBillingCollectionsByDate,
  sortBillingCollections,
  type BillingCollectionDateFilter,
} from '@/src/lib/admin/billingCollectionsFilter';
import type { CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';
import type {
  BillingGeneratedTodayRow,
  BillingOperationsSnapshot,
  BillingUpcomingGenerationRow,
} from '@/src/lib/admin/billingOperationsPresentation';
import { buildUpcomingGenerationSummaryKpis } from '@/src/lib/admin/billingOperationsPresentation';
import type { BillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import type { OutstandingDepositRow } from '@/src/services/depositCollection';
import type { UnifiedOpsItem } from '@/src/services/unifiedOperationsQueue';

export type BillingCentreDashboardFilters = {
  pgId?: string;
  roomQuery?: string;
  residentQuery?: string;
  paidPeriod?: BillingCollectionDateFilter;
};

export type BillingCentreGeneratedTodayRow = {
  kind: 'rent' | 'electricity' | 'deposit';
  id: string;
  label: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  amountPaise: number;
  paymentStatus: string;
  financialInvoiceId: string | null;
  openHref: string | null;
};

export type BillingCentrePendingRow = {
  kind: 'rent' | 'electricity' | 'deposit';
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode?: string;
  bookingId: string;
  invoiceNumber: string;
  amountPaise: number;
  dueDate: string | null;
  daysOverdue: number;
  priority: string;
  paymentStatus: string;
  financialInvoiceId: string | null;
  lastReminderSentAt: Date | null;
  reminderCount: number;
};

export type BillingCentreApprovalRow = {
  id: string;
  queue: string;
  queueLabel: string;
  residentName: string;
  residentPhone: string | null;
  pgId: string | null;
  pgName: string | null;
  roomNumber: string | null;
  amountPaise: number | null;
  reason: string;
  openHref: string;
  openLabel: string;
};

export type BillingCentreSummaryCards = {
  collectedTodayPaise: number;
  collectedTodayCount: number;
  outstandingPaise: number;
  upcomingBills7d: number;
  residentsToRemind: number;
  pendingApprovals: number;
  vacatingThisWeek: number;
};

export type BillingCentreDashboardView = {
  todayIso: string;
  summary: BillingCentreSummaryCards;
  commandCards: BillingCommandCenterSnapshot['cards'];
  opsKpis: BillingOperationsSnapshot['kpis'];
  upcomingGeneration: BillingUpcomingGenerationRow[];
  generatedToday: BillingCentreGeneratedTodayRow[];
  generatedTodayTotalPaise: number;
  pendingCollections: BillingCentrePendingRow[];
  recentlyPaid: BillingRecentCollectionRow[];
  pendingApprovals: BillingCentreApprovalRow[];
  pgs: Array<{ id: string; name: string }>;
};

const APPROVAL_QUEUES = new Set([
  'waiting_for_approval',
  'kyc_review',
  'vacating_requests',
  'refund_due',
]);

const APPROVAL_LABELS: Record<string, string> = {
  waiting_for_approval: 'Payment proof',
  kyc_review: 'KYC',
  vacating_requests: 'Vacating',
  refund_due: 'Deposit refund',
};

function matchesText(haystack: string, query?: string): boolean {
  if (!query?.trim()) return true;
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

function matchesResident(name: string, phone: string, query?: string): boolean {
  if (!query?.trim()) return true;
  const q = query.trim().toLowerCase();
  return name.toLowerCase().includes(q) || phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''));
}

function filterByPgRoomResident<
  T extends { pgId?: string; roomNumber?: string; customerName?: string; customerPhone?: string },
>(rows: T[], filters: BillingCentreDashboardFilters): T[] {
  return rows.filter(
    (r) =>
      (!filters.pgId || r.pgId === filters.pgId) &&
      matchesText(r.roomNumber ?? '', filters.roomQuery) &&
      matchesResident(r.customerName ?? '', r.customerPhone ?? '', filters.residentQuery),
  );
}

export function parseBillingCentreFilters(searchParams: {
  pg?: string;
  room?: string;
  resident?: string;
  paidPeriod?: string;
}): BillingCentreDashboardFilters {
  const paid =
    searchParams.paidPeriod === 'today' ||
    searchParams.paidPeriod === 'yesterday' ||
    searchParams.paidPeriod === 'week'
      ? searchParams.paidPeriod
      : 'today';
  return {
    pgId: searchParams.pg?.trim() || undefined,
    roomQuery: searchParams.room?.trim() || undefined,
    residentQuery: searchParams.resident?.trim() || undefined,
    paidPeriod: paid,
  };
}

export function buildGeneratedTodayRows(input: {
  rentRows: BillingGeneratedTodayRow[];
  electricityRows: Array<{
    id: string;
    pgId: string;
    pgName: string;
    roomNumber: string;
    billingMonth: string;
    totalPaise: number;
  }>;
  depositRows: Array<{
    id: string;
    bookingId: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    pgId: string;
    pgName: string;
    roomNumber: string;
    amountPaise: number;
  }>;
}): BillingCentreGeneratedTodayRow[] {
  const rows: BillingCentreGeneratedTodayRow[] = [];

  for (const r of input.rentRows) {
    rows.push({
      kind: 'rent',
      id: r.invoiceId,
      label: r.invoiceNumber,
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      pgId: r.pgId,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      amountPaise: r.totalPaise,
      paymentStatus: r.paymentStatus,
      financialInvoiceId: r.financialInvoiceId,
      openHref: r.financialInvoiceId ? `/admin/invoices/${r.financialInvoiceId}` : null,
    });
  }

  for (const e of input.electricityRows) {
    rows.push({
      kind: 'electricity',
      id: e.id,
      label: `Room ${e.roomNumber} · ${e.billingMonth.slice(0, 7)}`,
      customerId: null,
      customerName: 'Room bill',
      customerPhone: '',
      pgId: e.pgId,
      pgName: e.pgName,
      roomNumber: e.roomNumber,
      amountPaise: e.totalPaise,
      paymentStatus: 'generated',
      financialInvoiceId: null,
      openHref: `/admin/electricity/bills/${e.id}`,
    });
  }

  for (const d of input.depositRows) {
    rows.push({
      kind: 'deposit',
      id: d.id,
      label: `Deposit · ${d.bookingId.slice(0, 8)}`,
      customerId: d.customerId,
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      pgId: d.pgId,
      pgName: d.pgName,
      roomNumber: d.roomNumber,
      amountPaise: d.amountPaise,
      paymentStatus: 'collected',
      financialInvoiceId: null,
      openHref: `/admin/deposits/${d.bookingId}`,
    });
  }

  return rows.sort((a, b) => b.amountPaise - a.amountPaise);
}

export function buildPendingCollectionRows(input: {
  queueItems: CollectionQueueItem[];
  depositRows: OutstandingDepositRow[];
  reminderStats: Map<string, { lastSentAt: Date | null; count: number }>;
  todayIso: string;
}): BillingCentrePendingRow[] {
  const rows: BillingCentrePendingRow[] = [];

  for (const item of input.queueItems) {
    if (item.amountPaise <= 0) continue;
    const stats =
      item.kind === 'rent' ? input.reminderStats.get(item.sourceId) : undefined;
    rows.push({
      kind: item.kind,
      id: item.id,
      customerId: item.customerId,
      customerName: item.customerFullName,
      customerPhone: item.customerPhone,
      pgId: item.pgId,
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      bookingId: item.bookingId ?? item.customerId,
      invoiceNumber: item.invoiceNumber,
      amountPaise: item.amountPaise,
      dueDate: item.dueDate,
      daysOverdue: item.daysOverdue,
      priority: item.priority,
      paymentStatus: item.effectiveStatus,
      financialInvoiceId: item.financialInvoiceId ?? null,
      lastReminderSentAt: stats?.lastSentAt ?? null,
      reminderCount: stats?.count ?? 0,
    });
  }

  for (const d of input.depositRows) {
    if (d.depositDuePaise <= 0) continue;
    const daysOverdue =
      d.depositDueDate && d.depositDueDate < input.todayIso
        ? diffDays(d.depositDueDate, input.todayIso)
        : 0;
    rows.push({
      kind: 'deposit',
      id: `deposit-${d.bookingId}`,
      customerId: d.customerId,
      customerName: d.customerFullName,
      customerPhone: d.customerPhone,
      pgId: d.pgId,
      pgName: d.pgName,
      roomNumber: d.roomNumber,
      bedCode: d.bedCode,
      bookingId: d.bookingId,
      invoiceNumber: `DEP-${d.bookingCode}`,
      amountPaise: d.depositDuePaise,
      dueDate: d.depositDueDate ?? input.todayIso,
      daysOverdue: Math.max(0, daysOverdue),
      priority: daysOverdue > 0 ? 'overdue' : 'pending',
      paymentStatus: d.depositCollectionStatus,
      financialInvoiceId: null,
      lastReminderSentAt: null,
      reminderCount: 0,
    });
  }

  const order = { overdue: 0, due_today: 1, due_soon: 2, pending: 3 };
  return rows.sort(
    (a, b) =>
      (order[a.priority as keyof typeof order] ?? 9) -
        (order[b.priority as keyof typeof order] ?? 9) ||
      b.daysOverdue - a.daysOverdue,
  );
}

export function buildApprovalRows(items: UnifiedOpsItem[]): BillingCentreApprovalRow[] {
  return items
    .filter((item) => APPROVAL_QUEUES.has(item.queue))
    .map((item) => ({
      id: item.id,
      queue: item.queue,
      queueLabel: APPROVAL_LABELS[item.queue] ?? item.queue,
      residentName: item.residentName,
      residentPhone: item.residentPhone ?? null,
      pgId: item.pgId ?? null,
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      amountPaise: item.amountPaise ?? null,
      reason: item.reason,
      openHref: item.openHref,
      openLabel: item.openLabel,
    }));
}

export function buildSummaryCards(input: {
  commandSnapshot: BillingCommandCenterSnapshot;
  operations: BillingOperationsSnapshot;
  pendingCollections: BillingCentrePendingRow[];
  approvalCount: number;
  vacatingThisWeek: number;
}): BillingCentreSummaryCards {
  const upcoming = buildUpcomingGenerationSummaryKpis(
    input.operations.upcomingGeneration,
    input.operations.todayIso,
  );

  const residentsToRemind = input.pendingCollections.filter(
    (r) => r.daysOverdue > 0 || r.reminderCount === 0,
  ).length;

  return {
    collectedTodayPaise: input.operations.kpis.collectedTodayPaise,
    collectedTodayCount: input.operations.kpis.collectedTodayCount,
    outstandingPaise: input.commandSnapshot.totalOutstandingPaise,
    upcomingBills7d: upcoming.next7Days,
    residentsToRemind,
    pendingApprovals: input.approvalCount,
    vacatingThisWeek: input.vacatingThisWeek,
  };
}

export function applyBillingCentreDashboardFilters(
  view: BillingCentreDashboardView,
  filters: BillingCentreDashboardFilters,
): BillingCentreDashboardView {
  const paidPeriod = filters.paidPeriod ?? 'today';
  const filteredPaid = sortBillingCollections(
    filterBillingCollectionsByDate(view.recentlyPaid, paidPeriod),
  );

  return {
    ...view,
    upcomingGeneration: filterByPgRoomResident(
      view.upcomingGeneration.map((r) => ({
        ...r,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
      })),
      filters,
    ),
    generatedToday: filterByPgRoomResident(view.generatedToday, filters),
    generatedTodayTotalPaise: filterByPgRoomResident(view.generatedToday, filters).reduce(
      (s, r) => s + r.amountPaise,
      0,
    ),
    pendingCollections: filterByPgRoomResident(view.pendingCollections, filters),
    recentlyPaid: filteredPaid,
    pendingApprovals: view.pendingApprovals.filter(
      (r) =>
        matchesResident(r.residentName, r.residentPhone ?? '', filters.residentQuery) &&
        (!filters.pgId || r.pgId === filters.pgId),
    ),
  };
}

export function groupUpcomingByDate(
  rows: BillingUpcomingGenerationRow[],
): Array<{ date: string; rows: BillingUpcomingGenerationRow[] }> {
  const map = new Map<string, BillingUpcomingGenerationRow[]>();
  for (const row of rows) {
    const list = map.get(row.issueDate) ?? [];
    list.push(row);
    map.set(row.issueDate, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, groupRows]) => ({ date, rows: groupRows }));
}
