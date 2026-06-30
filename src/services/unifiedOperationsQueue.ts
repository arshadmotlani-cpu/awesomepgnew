/**
 * Unified Operations master queue — single command center for all admin actions.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { ResidentsCommandFilter } from '@/src/lib/residents/residentOperationsResidentsView';
import type { OpsPriority } from '@/src/lib/operationsCenterRules';
import { listBillingGenerationFailures } from '@/src/services/billingScheduler';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { listOpenActionItems } from '@/src/services/actionItems';
import { buildActionDeepLink } from '@/src/lib/admin/actionDeepLinks';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export type UnifiedOpsFilter =
  | 'all'
  | ResidentsCommandFilter
  | 'waiting_for_payment'
  | 'waiting_for_admin_review'
  | 'rent_due'
  | 'electricity_due'
  | 'booking_approval'
  | 'billing_failure'
  | 'checkout'
  | 'maintenance'
  | 'manual_review';

export type UnifiedOpsPriority = 'urgent' | 'high' | 'normal' | 'waiting';

export type UnifiedOpsItem = {
  id: string;
  residentName: string;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  priority: UnifiedOpsPriority;
  status: string;
  nextAction: string;
  openHref: string;
  openLabel: string;
  filterTags: UnifiedOpsFilter[];
  sortRank: number;
  cashSettlement?: {
    financialInvoiceId: string;
    invoiceNumber: string;
    balanceDuePaise: number;
  } | null;
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
  billing_failure: 'Billing failure',
  checkout: 'Checkout',
  maintenance: 'Maintenance',
  manual_review: 'Manual review',
};

function opsPriorityToUnified(p: OpsPriority): UnifiedOpsPriority {
  if (p === 'red') return 'urgent';
  if (p === 'orange') return 'high';
  return 'normal';
}

function categoryPriority(category: string, waitingOnResident: boolean): UnifiedOpsPriority {
  if (waitingOnResident) return 'waiting';
  if (category === 'payment_proof' || category === 'rent_overdue') return 'urgent';
  if (category === 'rent_due' || category === 'electricity_due' || category === 'move_out') {
    return 'high';
  }
  return 'normal';
}

function categorySortRank(priority: UnifiedOpsPriority): number {
  if (priority === 'urgent') return 0;
  if (priority === 'high') return 1;
  if (priority === 'normal') return 2;
  return 3;
}

function rowToFilterTags(row: ResidentsQueueRow): UnifiedOpsFilter[] {
  const tags: UnifiedOpsFilter[] = [...row.filterTags];
  if (row.category === 'rent_due') tags.push('rent_due', 'waiting_for_payment');
  if (row.category === 'electricity_due') tags.push('electricity_due', 'waiting_for_payment');
  if (row.category === 'rent_overdue') tags.push('overdue', 'rent_due', 'waiting_for_payment');
  if (row.category === 'payment_proof') tags.push('payment_proof', 'waiting_for_admin_review');
  if (row.category === 'move_out') tags.push('move_out', 'checkout');
  if (row.category === 'refund') tags.push('checkout');
  if (row.category === 'resident_request') tags.push('maintenance');
  return [...new Set(tags)];
}

function residentsRowToItem(row: ResidentsQueueRow): UnifiedOpsItem {
  const waitingOnResident =
    row.category === 'rent_due' ||
    row.category === 'electricity_due' ||
    row.nextAction.toLowerCase().includes('waiting for resident');
  const priority = categoryPriority(row.category, waitingOnResident);
  return {
    id: row.id,
    residentName: row.residentName,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    priority,
    status: row.currentState,
    nextAction: row.nextAction,
    openHref: row.primaryHref,
    openLabel: row.primaryActionLabel || 'Open',
    filterTags: rowToFilterTags(row),
    sortRank: categorySortRank(priority),
  };
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

function mapFilterToResidents(filter: UnifiedOpsFilter | null): ResidentsCommandFilter | null {
  if (!filter || filter === 'all') return null;
  if (
    filter === 'waiting_for_payment' ||
    filter === 'waiting_for_admin_review' ||
    filter === 'rent_due' ||
    filter === 'electricity_due' ||
    filter === 'booking_approval' ||
    filter === 'billing_failure' ||
    filter === 'checkout' ||
    filter === 'maintenance' ||
    filter === 'manual_review'
  ) {
    return null;
  }
  return filter as ResidentsCommandFilter;
}

function matchesFilter(item: UnifiedOpsItem, filter: UnifiedOpsFilter | null): boolean {
  if (!filter || filter === 'all') return true;
  if (filter === 'waiting_for_payment') {
    return item.filterTags.includes('rent_due') || item.filterTags.includes('electricity_due');
  }
  if (filter === 'waiting_for_admin_review') {
    return (
      item.filterTags.includes('payment_proof') || item.filterTags.includes('manual_review')
    );
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
    'billing_failure',
    'checkout',
    'maintenance',
    'manual_review',
  ];
  return valid.includes(value as UnifiedOpsFilter) ? (value as UnifiedOpsFilter) : null;
}

function actionItemPriority(priority: 'low' | 'medium' | 'high'): UnifiedOpsPriority {
  if (priority === 'high') return 'urgent';
  if (priority === 'medium') return 'high';
  return 'normal';
}

async function resolveFailureEntityNames(
  failures: Awaited<ReturnType<typeof listBillingGenerationFailures>>,
) {
  const customerIds = [...new Set(failures.map((f) => f.customerId).filter(Boolean))] as string[];
  const pgIds = [...new Set(failures.map((f) => f.pgId).filter(Boolean))] as string[];

  const [customerRows, pgRows] = await Promise.all([
    customerIds.length
      ? db
          .select({ id: customers.id, fullName: customers.fullName })
          .from(customers)
          .where(inArray(customers.id, customerIds))
      : Promise.resolve([]),
    pgIds.length
      ? db.select({ id: pgs.id, name: pgs.name }).from(pgs).where(inArray(pgs.id, pgIds))
      : Promise.resolve([]),
  ]);

  return {
    customerNames: new Map(customerRows.map((r) => [r.id, r.fullName])),
    pgNames: new Map(pgRows.map((r) => [r.id, r.name])),
  };
}

export async function loadUnifiedOperationsQueue(
  session: AdminSession,
  filterInput?: UnifiedOpsFilter | null,
): Promise<UnifiedOperationsQueue> {
  const filter = filterInput ?? null;
  const residentsFilter = mapFilterToResidents(filter);

  const [residentsPage, opsCenter, billingFailures, bookingApprovals, paymentReviews, openActionItems] =
    await Promise.all([
      loadResidentOperationsResidentsPage(session, residentsFilter),
      getOperationsCenterData(session),
      listBillingGenerationFailures({ unresolvedOnly: true, limit: 50 }),
      listPendingBookingApprovals(session),
      listPendingPaymentReviews(session),
      listOpenActionItems(session),
    ]);

  const { customerNames, pgNames } = await resolveFailureEntityNames(billingFailures);

  const byId = new Map<string, UnifiedOpsItem>();

  for (const row of residentsPage.queue) {
    byId.set(row.id, residentsRowToItem(row));
  }

  for (const b of bookingApprovals) {
    byId.set(`booking-${b.id}`, {
      id: `booking-${b.id}`,
      residentName: b.customerName,
      pgName: b.pgName,
      roomNumber: null,
      bedCode: null,
      priority: 'urgent',
      status: 'Booking awaiting approval',
      nextAction: 'Review payment and approve booking',
      openHref: `/admin/bookings/${b.id}`,
      openLabel: 'Review booking',
      filterTags: ['booking_approval'],
      sortRank: 0,
    });
  }

  for (const f of billingFailures) {
    byId.set(`billing-fail-${f.id}`, {
      id: `billing-fail-${f.id}`,
      residentName: f.customerId ? customerNames.get(f.customerId) ?? 'Resident' : 'Unknown',
      pgName: f.pgId ? pgNames.get(f.pgId) ?? null : null,
      roomNumber: null,
      bedCode: null,
      priority: 'urgent',
      status: 'Billing generation failed',
      nextAction: f.errorMessage,
      openHref: '/admin/billing?tab=failures',
      openLabel: 'View failure',
      filterTags: ['billing_failure'],
      sortRank: 0,
    });
  }

  for (const item of openActionItems) {
    if (item.type !== 'financial_audit_review') continue;
    const priority = actionItemPriority(item.priority);
    byId.set(`action-${item.id}`, {
      id: `action-${item.id}`,
      residentName: item.residentName ?? 'Unknown',
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      priority,
      status: 'Invoice exception',
      nextAction: item.title,
      openHref: buildActionDeepLink(item.type, item.metadata, item.residentId),
      openLabel: 'Review',
      filterTags: ['manual_review', 'waiting_for_admin_review'],
      sortRank: categorySortRank(priority),
    });
  }

  for (const task of opsCenter.tasks) {
    if (byId.has(task.id)) continue;
    const priority = opsPriorityToUnified(task.priority);
    byId.set(task.id, {
      id: task.id,
      residentName: task.label.split('—').pop()?.trim() ?? task.label,
      pgName: task.pgName,
      roomNumber: null,
      bedCode: null,
      priority,
      status: 'Requires attention',
      nextAction: task.label,
      openHref: task.href,
      openLabel: 'Open',
      filterTags: ['maintenance'],
      sortRank: categorySortRank(priority),
    });
  }

  let items = [...byId.values()].sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return a.residentName.localeCompare(b.residentName);
  });

  if (filter) {
    items = items.filter((item) => matchesFilter(item, filter));
  }

  const allItems = [...byId.values()];
  const filterCounts: UnifiedOperationsQueue['filterCounts'] = [
    { id: 'all', label: FILTER_LABELS.all, count: allItems.length },
    {
      id: 'waiting_for_payment',
      label: FILTER_LABELS.waiting_for_payment,
      count: allItems.filter(
        (i) => i.filterTags.includes('rent_due') || i.filterTags.includes('electricity_due'),
      ).length,
    },
    {
      id: 'waiting_for_admin_review',
      label: FILTER_LABELS.waiting_for_admin_review,
      count: allItems.filter(
        (i) => i.filterTags.includes('payment_proof') || i.filterTags.includes('manual_review'),
      ).length,
    },
    { id: 'payment_proof', label: FILTER_LABELS.payment_proof, count: paymentReviews.length },
    { id: 'rent_due', label: FILTER_LABELS.rent_due, count: allItems.filter((i) => i.filterTags.includes('rent_due')).length },
    { id: 'electricity_due', label: FILTER_LABELS.electricity_due, count: allItems.filter((i) => i.filterTags.includes('electricity_due')).length },
    { id: 'kyc', label: FILTER_LABELS.kyc, count: allItems.filter((i) => i.filterTags.includes('kyc')).length },
    { id: 'booking_approval', label: FILTER_LABELS.booking_approval, count: allItems.filter((i) => i.filterTags.includes('booking_approval')).length },
    { id: 'move_out', label: FILTER_LABELS.move_out, count: allItems.filter((i) => i.filterTags.includes('move_out')).length },
    { id: 'checkout', label: FILTER_LABELS.checkout, count: allItems.filter((i) => i.filterTags.includes('checkout')).length },
    { id: 'bed_assignment', label: FILTER_LABELS.bed_assignment, count: allItems.filter((i) => i.filterTags.includes('bed_assignment')).length },
    { id: 'billing_failure', label: FILTER_LABELS.billing_failure, count: allItems.filter((i) => i.filterTags.includes('billing_failure')).length },
    { id: 'maintenance', label: FILTER_LABELS.maintenance, count: allItems.filter((i) => i.filterTags.includes('maintenance')).length },
    { id: 'manual_review', label: FILTER_LABELS.manual_review, count: allItems.filter((i) => i.filterTags.includes('manual_review')).length },
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
