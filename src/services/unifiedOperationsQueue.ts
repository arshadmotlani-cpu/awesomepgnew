/**
 * Unified Operations master queue — single command center for admin actions.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { formatDate } from '@/src/lib/format';
import type { ResidentsCommandFilter } from '@/src/lib/residents/residentOperationsResidentsView';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listOutstandingDeposits } from '@/src/services/depositCollection';

export type UnifiedOpsOutstandingLine = {
  categoryLabel: string;
  periodLabel: string;
  amountPaise: number;
  financialInvoiceId?: string | null;
  kind: 'rent' | 'electricity' | 'deposit';
  billingMonth?: string | null;
  bookingId?: string | null;
  label?: string;
};

export type UnifiedOpsFilter =
  | 'all'
  | ResidentsCommandFilter
  | 'waiting_for_payment'
  | 'waiting_for_admin_review'
  | 'rent_due'
  | 'electricity_due'
  | 'booking_approval'
  | 'checkout';

export type UnifiedOpsItem = {
  id: string;
  customerId?: string;
  residentName: string;
  residentPhone?: string | null;
  pgId?: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  status: string;
  nextAction: string;
  openHref: string;
  openLabel: string;
  filterTags: UnifiedOpsFilter[];
  sortRank: number;
  outstandingLines?: UnifiedOpsOutstandingLine[];
  totalOutstandingPaise?: number;
};

export type UnifiedOperationsQueue = {
  items: UnifiedOpsItem[];
  filter: UnifiedOpsFilter | null;
  filterCounts: Array<{ id: UnifiedOpsFilter; label: string; count: number }>;
  paymentReviews: PendingPaymentReviewItem[];
  totalCount: number;
};

const FILTER_LABELS: Record<UnifiedOpsFilter, string> = {
  all: 'All',
  waiting_for_payment: 'Waiting for payment',
  waiting_for_admin_review: 'Waiting for admin review',
  bed_assignment: 'Bed assignment',
  kyc: 'KYC',
  payment_proof: 'Payment review',
  move_out: 'Move-out',
  overdue: 'Overdue',
  blocked: 'Blocked',
  rent_due: 'Rent due',
  electricity_due: 'Electricity due',
  booking_approval: 'Booking approval',
  checkout: 'Checkout',
};

const EXCLUDED_CATEGORIES = new Set(['resident_request']);

function workflowStatus(row: ResidentsQueueRow): string {
  switch (row.category) {
    case 'payment_proof':
      return 'Waiting for Admin Approval';
    case 'rent_due':
    case 'electricity_due':
    case 'rent_overdue':
      return 'Waiting for Resident Payment';
    case 'kyc':
      return 'Waiting for KYC Review';
    case 'bed_assignment':
      return 'Waiting for Bed Assignment';
    case 'move_out':
      return 'Waiting for Checkout';
    case 'refund':
      return 'Waiting for Refund';
    case 'booking_approval':
      return 'Waiting for Booking Approval';
    default:
      return row.currentState;
  }
}

function categorySortRank(category: string): number {
  if (category === 'payment_proof' || category === 'rent_overdue') return 0;
  if (category === 'rent_due' || category === 'electricity_due' || category === 'move_out') return 1;
  if (category === 'refund') return 2;
  return 3;
}

function rowToFilterTags(row: ResidentsQueueRow): UnifiedOpsFilter[] {
  const tags: UnifiedOpsFilter[] = [...row.filterTags];
  if (row.category === 'rent_due' || row.category === 'rent_overdue') {
    tags.push('rent_due', 'waiting_for_payment');
  }
  if (row.category === 'electricity_due') {
    tags.push('electricity_due', 'waiting_for_payment');
  }
  if (row.category === 'payment_proof') {
    tags.push('payment_proof', 'waiting_for_admin_review');
  }
  if (row.category === 'move_out') tags.push('move_out', 'checkout');
  if (row.category === 'refund') tags.push('checkout');
  return [...new Set(tags)];
}

function outstandingLineFromRow(row: ResidentsQueueRow): UnifiedOpsOutstandingLine | null {
  if (row.outstandingAmountPaise == null || row.outstandingAmountPaise <= 0) return null;
  return {
    categoryLabel: row.outstandingCategory ?? (row.outstandingKind === 'rent' ? 'Rent' : 'Electricity'),
    periodLabel: row.outstandingPeriod ?? billingMonthLabel(row.billingMonth),
    amountPaise: row.outstandingAmountPaise,
    financialInvoiceId: row.financialInvoiceId,
    kind: row.outstandingKind ?? 'rent',
    billingMonth: row.billingMonth,
    bookingId: row.bookingId,
    label: row.outstandingLabel,
  };
}

function residentsRowToItem(row: ResidentsQueueRow): UnifiedOpsItem | null {
  if (EXCLUDED_CATEGORIES.has(row.category)) return null;

  const outstandingLine = outstandingLineFromRow(row);
  const status = workflowStatus(row);

  return {
    id: row.id,
    customerId: row.customerId,
    residentName: row.residentName,
    residentPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    status,
    nextAction: row.nextAction,
    openHref: row.primaryHref,
    openLabel: row.primaryActionLabel || 'Open',
    filterTags: rowToFilterTags(row),
    sortRank: categorySortRank(row.category),
    outstandingLines: outstandingLine ? [outstandingLine] : undefined,
    totalOutstandingPaise: outstandingLine?.amountPaise,
  };
}

function isPaymentWaitingItem(item: UnifiedOpsItem): boolean {
  return (
    item.filterTags.includes('waiting_for_payment') &&
    !item.filterTags.includes('payment_proof') &&
    Boolean(item.outstandingLines?.length)
  );
}

function sumOutstanding(lines: UnifiedOpsOutstandingLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountPaise, 0);
}

function mergePaymentWaitingByResident(items: UnifiedOpsItem[]): UnifiedOpsItem[] {
  const paymentWaiting = items.filter(isPaymentWaitingItem);
  const rest = items.filter((i) => !isPaymentWaitingItem(i));

  const byCustomer = new Map<string, UnifiedOpsItem[]>();
  const ungrouped: UnifiedOpsItem[] = [];

  for (const item of paymentWaiting) {
    if (!item.customerId) {
      ungrouped.push(item);
      continue;
    }
    const list = byCustomer.get(item.customerId) ?? [];
    list.push(item);
    byCustomer.set(item.customerId, list);
  }

  const grouped: UnifiedOpsItem[] = [...ungrouped];

  for (const [customerId, rows] of byCustomer) {
    const outstandingLines = rows.flatMap((r) => r.outstandingLines ?? []);
    const sortRank = Math.min(...rows.map((r) => r.sortRank));
    const filterTags = [...new Set(rows.flatMap((r) => r.filterTags))] as UnifiedOpsFilter[];
    const anchor = rows[0]!;
    const totalOutstandingPaise = sumOutstanding(outstandingLines);

    grouped.push({
      id: rows.length === 1 ? rows[0]!.id : `resident-outstanding-${customerId}`,
      customerId,
      residentName: anchor.residentName,
      residentPhone: anchor.residentPhone,
      pgId: anchor.pgId,
      pgName: anchor.pgName,
      roomNumber: anchor.roomNumber,
      bedCode: anchor.bedCode,
      status: 'Waiting for Resident Payment',
      nextAction: 'Collect each invoice separately — rent, electricity, and deposit stay independent',
      openHref: `/admin/residents/${customerId}#open-bills`,
      openLabel: 'Open bills',
      filterTags,
      sortRank,
      outstandingLines,
      totalOutstandingPaise,
    });
  }

  return [...rest, ...grouped];
}

async function listPendingBookingApprovals(session: AdminSession) {
  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.status, 'pending_approval'));

  const byBooking = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.pgId && !byBooking.has(row.id)) byBooking.set(row.id, row);
  }

  return [...byBooking.values()].filter((r) =>
    r.pgId ? adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.pgId) : false,
  );
}

function depositRowsToItems(
  session: AdminSession,
  deposits: Awaited<ReturnType<typeof listOutstandingDeposits>>,
): UnifiedOpsItem[] {
  const items: UnifiedOpsItem[] = [];
  for (const d of deposits) {
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, d.pgId)) continue;
    if (d.depositDuePaise <= 0) continue;

    const periodLabel = d.depositDueDate ? formatDate(d.depositDueDate) : 'Due now';
    items.push({
      id: `deposit-${d.bookingId}`,
      customerId: d.customerId,
      residentName: d.customerFullName,
      residentPhone: d.customerPhone,
      pgId: d.pgId,
      pgName: d.pgName,
      roomNumber: d.roomNumber,
      bedCode: d.bedCode,
      status: 'Waiting for Resident Payment',
      nextAction: 'Collect remaining security deposit',
      openHref: `/admin/residents/${d.customerId}#open-bills`,
      openLabel: 'Open bills',
      filterTags: ['waiting_for_payment'],
      sortRank: 1,
      outstandingLines: [
        {
          categoryLabel: 'Deposit',
          periodLabel,
          amountPaise: d.depositDuePaise,
          kind: 'deposit',
          bookingId: d.bookingId,
        },
      ],
      totalOutstandingPaise: d.depositDuePaise,
    });
  }
  return items;
}

function mapFilterToResidents(filter: UnifiedOpsFilter | null): ResidentsCommandFilter | null {
  if (!filter || filter === 'all') return null;
  if (
    filter === 'waiting_for_payment' ||
    filter === 'waiting_for_admin_review' ||
    filter === 'rent_due' ||
    filter === 'electricity_due' ||
    filter === 'booking_approval' ||
    filter === 'checkout'
  ) {
    return null;
  }
  return filter as ResidentsCommandFilter;
}

function matchesFilter(item: UnifiedOpsItem, filter: UnifiedOpsFilter | null): boolean {
  if (!filter || filter === 'all') return true;
  if (filter === 'waiting_for_payment') {
    return item.filterTags.includes('waiting_for_payment');
  }
  if (filter === 'waiting_for_admin_review') {
    return item.filterTags.includes('payment_proof');
  }
  return item.filterTags.includes(filter);
}

export function parseUnifiedOpsFilter(value: string | undefined): UnifiedOpsFilter | null {
  if (!value || value === 'all') return null;
  const valid: UnifiedOpsFilter[] = [
    'waiting_for_payment',
    'waiting_for_admin_review',
    'bed_assignment',
    'kyc',
    'payment_proof',
    'move_out',
    'overdue',
    'blocked',
    'rent_due',
    'electricity_due',
    'booking_approval',
    'checkout',
  ];
  return valid.includes(value as UnifiedOpsFilter) ? (value as UnifiedOpsFilter) : null;
}

export async function loadUnifiedOperationsQueue(
  session: AdminSession,
  filterInput?: UnifiedOpsFilter | null,
): Promise<UnifiedOperationsQueue> {
  const filter = filterInput ?? null;
  const residentsFilter = mapFilterToResidents(filter);

  const [residentsPage, bookingApprovals, paymentReviews, outstandingDeposits] = await Promise.all([
    loadResidentOperationsResidentsPage(session, residentsFilter),
    listPendingBookingApprovals(session),
    listPendingPaymentReviews(session),
    listOutstandingDeposits(),
  ]);

  const byId = new Map<string, UnifiedOpsItem>();

  for (const row of residentsPage.queue) {
    const item = residentsRowToItem(row);
    if (item) byId.set(item.id, item);
  }

  for (const depositItem of depositRowsToItems(session, outstandingDeposits)) {
    byId.set(depositItem.id, depositItem);
  }

  for (const b of bookingApprovals) {
    byId.set(`booking-${b.id}`, {
      id: `booking-${b.id}`,
      residentName: b.customerName,
      pgName: b.pgName,
      roomNumber: null,
      bedCode: null,
      status: 'Waiting for Booking Approval',
      nextAction: 'Review payment and approve booking',
      openHref: `/admin/bookings/${b.id}`,
      openLabel: 'Review booking',
      filterTags: ['booking_approval'],
      sortRank: 0,
    });
  }

  let items = mergePaymentWaitingByResident([...byId.values()]).sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return a.residentName.localeCompare(b.residentName);
  });

  if (filter) {
    items = items.filter((item) => matchesFilter(item, filter));
  }

  const allItems = mergePaymentWaitingByResident([...byId.values()]);
  const filterCounts: UnifiedOperationsQueue['filterCounts'] = [
    { id: 'all', label: FILTER_LABELS.all, count: allItems.length },
    {
      id: 'waiting_for_payment',
      label: FILTER_LABELS.waiting_for_payment,
      count: allItems.filter((i) => i.filterTags.includes('waiting_for_payment')).length,
    },
    {
      id: 'waiting_for_admin_review',
      label: FILTER_LABELS.waiting_for_admin_review,
      count: allItems.filter((i) => i.filterTags.includes('payment_proof')).length,
    },
    { id: 'payment_proof', label: FILTER_LABELS.payment_proof, count: paymentReviews.length },
    {
      id: 'rent_due',
      label: FILTER_LABELS.rent_due,
      count: allItems.filter((i) => i.filterTags.includes('rent_due')).length,
    },
    {
      id: 'electricity_due',
      label: FILTER_LABELS.electricity_due,
      count: allItems.filter((i) => i.filterTags.includes('electricity_due')).length,
    },
    { id: 'kyc', label: FILTER_LABELS.kyc, count: allItems.filter((i) => i.filterTags.includes('kyc')).length },
    {
      id: 'booking_approval',
      label: FILTER_LABELS.booking_approval,
      count: allItems.filter((i) => i.filterTags.includes('booking_approval')).length,
    },
    { id: 'move_out', label: FILTER_LABELS.move_out, count: allItems.filter((i) => i.filterTags.includes('move_out')).length },
    { id: 'checkout', label: FILTER_LABELS.checkout, count: allItems.filter((i) => i.filterTags.includes('checkout')).length },
    {
      id: 'bed_assignment',
      label: FILTER_LABELS.bed_assignment,
      count: allItems.filter((i) => i.filterTags.includes('bed_assignment')).length,
    },
    { id: 'overdue', label: FILTER_LABELS.overdue, count: allItems.filter((i) => i.filterTags.includes('overdue')).length },
  ].filter((f) => f.id === 'all' || f.count > 0) as UnifiedOperationsQueue['filterCounts'];

  return {
    items,
    filter,
    filterCounts,
    paymentReviews,
    totalCount: allItems.length,
  };
}
