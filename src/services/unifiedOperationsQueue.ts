/**
 * Operations action center — eight admin queues, one action per row.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { buildCollectionsQueue, type CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { depositExpressHref } from '@/src/lib/deposits/depositExpressLinks';
import { listAdminElectricityInvoicesForReminders } from '@/src/db/queries/admin';
import { isActiveCheckoutSettlement } from '@/src/lib/residents/residentLifecycleState';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import {
  defaultOperationsFilter,
  operationsFilterHref,
  OPS_QUEUE_FILTERS,
  OPS_QUEUE_LABELS,
  parseOperationsFilter,
  type OpsQueueFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';
import type { ResidentOpsQueueCategory } from '@/src/lib/residents/residentOperationsDashboard';
import {
  isDismissedFromOperationsQueue,
  loadOperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';

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

export type UnifiedOpsFilter = OpsQueueFilter;

export type UnifiedOpsItem = {
  id: string;
  queue: OpsQueueFilter;
  customerId?: string;
  residentName: string;
  residentPhone?: string | null;
  pgId?: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  reason: string;
  openHref: string;
  openLabel: string;
  category?: ResidentOpsQueueCategory;
  bookingId?: string | null;
  vacatingRequestId?: string | null;
  kycSubmissionId?: string | null;
  amountPaise?: number;
  paymentType?: string;
  billingMonth?: string | null;
  uploadTime?: string | null;
  bookingCode?: string | null;
  statusLabel?: string;
  outstandingLines?: UnifiedOpsOutstandingLine[];
  depositRequiredPaise?: number;
  depositPaidPaise?: number;
  depositRemainingPaise?: number;
  paymentReviewKey?: string;
};

export type UnifiedOperationsQueue = {
  items: UnifiedOpsItem[];
  filter: OpsQueueFilter;
  filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
  paymentReviews: PendingPaymentReviewItem[];
  focusReviewKey: string | null;
  totalCount: number;
};

function overdueReason(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Awaiting resident payment';
  return `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`;
}

function electricityCollectionToItem(row: CollectionQueueItem): UnifiedOpsItem {
  const outstandingLine: UnifiedOpsOutstandingLine = {
    categoryLabel: 'Electricity',
    periodLabel: row.periodLabel ?? billingMonthLabel(row.billingMonth),
    amountPaise: row.amountPaise,
    financialInvoiceId: row.financialInvoiceId,
    kind: 'electricity',
    billingMonth: row.billingMonth,
    bookingId: row.bookingId,
  };

  const daysOverdue = row.daysOverdue;

  return {
    id: row.id,
    queue: 'electricity_due',
    customerId: row.customerId,
    residentName: row.customerFullName,
    residentPhone: row.customerPhone,
    pgId: row.pgId,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode ?? null,
    reason: overdueReason(daysOverdue),
    openHref: `/admin/residents/${row.customerId}#open-bills`,
    openLabel: 'Open bills',
    category: 'electricity_due',
    bookingId: row.bookingId ?? null,
    amountPaise: row.amountPaise,
    billingMonth: row.billingMonth,
    outstandingLines: [outstandingLine],
  };
}

function paymentReviewToItem(review: PendingPaymentReviewItem): UnifiedOpsItem {
  return {
    id: `approval-${review.key}`,
    queue: 'waiting_for_approval',
    customerId: review.customerId ?? undefined,
    residentName: review.residentName,
    residentPhone: review.phone,
    pgId: review.pgId,
    pgName: review.pgName,
    roomNumber: review.roomNumber,
    bedCode: review.bedCode,
    reason: review.subtitle || review.title,
    openHref: operationsFilterHref('waiting_for_approval', review.key),
    openLabel: 'Review',
    category: 'payment_proof',
    bookingId: review.bookingId,
    amountPaise: review.amountPaise,
    paymentType: review.paymentTypeLabel,
    billingMonth: review.billingMonth,
    uploadTime: review.proofSubmittedAt,
    paymentReviewKey: review.key,
  };
}

function residentsRowToItem(row: ResidentsQueueRow): UnifiedOpsItem | null {
  if (row.category === 'payment_proof' || row.category === 'resident_request') return null;

  if (row.category === 'refund') {
    return {
      id: row.id,
      queue: 'refund_due',
      customerId: row.customerId,
      residentName: row.residentName,
      residentPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      reason: row.reason,
      openHref: row.bookingId ? refundConsoleHref(row.bookingId) : row.primaryHref,
      openLabel: 'Review refund',
      category: row.category,
      bookingId: row.bookingId,
      amountPaise: row.outstandingAmountPaise,
      statusLabel: 'Refund pending',
    };
  }

  if (row.category === 'move_out') {
    if (row.nextAction.toLowerCase().includes('waiting for resident')) return null;
    if (row.primaryActionLabel === 'Refund of Deposit') {
      return {
        id: row.id,
        queue: 'refund_due',
        customerId: row.customerId,
        residentName: row.residentName,
        residentPhone: row.customerPhone,
        pgId: row.pgId,
        pgName: row.pgName,
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        reason: row.reason,
        openHref: row.bookingId ? refundConsoleHref(row.bookingId) : row.primaryHref,
        openLabel: 'Review refund',
        category: 'refund',
        bookingId: row.bookingId,
        vacatingRequestId: row.vacatingRequestId,
        statusLabel: 'Refund due',
      };
    }
    return {
      id: row.id,
      queue: 'vacating_requests',
      customerId: row.customerId,
      residentName: row.residentName,
      residentPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      reason: row.reason,
      openHref: row.primaryHref,
      openLabel: 'Review',
      category: row.category,
      bookingId: row.bookingId,
      vacatingRequestId: row.vacatingRequestId,
    };
  }

  if (row.category === 'rent_due' || row.category === 'rent_overdue') {
    const outstandingLine: UnifiedOpsOutstandingLine | undefined =
      row.outstandingAmountPaise != null && row.outstandingAmountPaise > 0
        ? {
            categoryLabel: row.outstandingCategory ?? 'Rent',
            periodLabel: row.outstandingPeriod ?? billingMonthLabel(row.billingMonth),
            amountPaise: row.outstandingAmountPaise,
            financialInvoiceId: row.financialInvoiceId,
            kind: 'rent',
            billingMonth: row.billingMonth,
            bookingId: row.bookingId,
          }
        : undefined;

    const daysMatch = row.reason.match(/(\d+) day/);
    const daysOverdue = daysMatch ? Number(daysMatch[1]) : row.category === 'rent_overdue' ? 1 : 0;

    return {
      id: row.id,
      queue: 'rent_due',
      customerId: row.customerId,
      residentName: row.residentName,
      residentPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      reason: overdueReason(daysOverdue),
      openHref: `/admin/residents/${row.customerId}#open-bills`,
      openLabel: 'Open bills',
      category: row.category,
      bookingId: row.bookingId,
      amountPaise: row.outstandingAmountPaise,
      billingMonth: row.billingMonth,
      outstandingLines: outstandingLine ? [outstandingLine] : undefined,
    };
  }

  if (row.category === 'electricity_due') {
    const outstandingLine: UnifiedOpsOutstandingLine | undefined =
      row.outstandingAmountPaise != null && row.outstandingAmountPaise > 0
        ? {
            categoryLabel: 'Electricity',
            periodLabel: row.outstandingPeriod ?? billingMonthLabel(row.billingMonth),
            amountPaise: row.outstandingAmountPaise,
            financialInvoiceId: row.financialInvoiceId,
            kind: 'electricity',
            billingMonth: row.billingMonth,
            bookingId: row.bookingId,
          }
        : undefined;

    const daysMatch = row.reason.match(/(\d+) day/);
    const daysOverdue = daysMatch ? Number(daysMatch[1]) : 0;

    return {
      id: row.id,
      queue: 'electricity_due',
      customerId: row.customerId,
      residentName: row.residentName,
      residentPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      reason: overdueReason(daysOverdue),
      openHref: `/admin/residents/${row.customerId}#open-bills`,
      openLabel: 'Open bills',
      category: row.category,
      bookingId: row.bookingId,
      amountPaise: row.outstandingAmountPaise,
      billingMonth: row.billingMonth,
      outstandingLines: outstandingLine ? [outstandingLine] : undefined,
    };
  }

  if (row.category === 'kyc') {
    return {
      id: row.id,
      queue: 'kyc_review',
      customerId: row.customerId,
      residentName: row.residentName,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      reason: row.reason,
      openHref: row.primaryHref,
      openLabel: 'Review KYC',
      category: row.category,
      bookingId: row.bookingId,
      kycSubmissionId: row.kycSubmissionId,
    };
  }

  if (row.category === 'bed_assignment') {
    return null;
  }

  return null;
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

function countByQueue(items: UnifiedOpsItem[]): Record<OpsQueueFilter, number> {
  const counts = Object.fromEntries(OPS_QUEUE_FILTERS.map((id) => [id, 0])) as Record<
    OpsQueueFilter,
    number
  >;
  for (const item of items) counts[item.queue] += 1;
  return counts;
}

export function parseUnifiedOpsFilter(value: string | undefined): OpsQueueFilter | null {
  return parseOperationsFilter(value);
}

export async function loadUnifiedOperationsQueue(
  session: AdminSession,
  filterInput?: OpsQueueFilter | null,
  focusReviewKey?: string | null,
): Promise<UnifiedOperationsQueue> {
  const [
    residentsPage,
    bookingApprovals,
    rawPaymentReviews,
    dismissalIndex,
    depositDueRows,
    elecPendingRes,
    checkoutSettlements,
  ] = await Promise.all([
    loadResidentOperationsResidentsPage(session, null),
    listPendingBookingApprovals(session),
    listPendingPaymentReviews(session),
    loadOperationsQueueDismissalIndex(),
    import('@/src/services/depositExpress').then((m) => m.listDepositDueBookings(session)),
    listAdminElectricityInvoicesForReminders(),
    listPipelineCheckoutSettlements(session),
  ]);

  const paymentReviews = rawPaymentReviews.filter(
    (p) =>
      !p.customerId ||
      !isDismissedFromOperationsQueue(dismissalIndex, { customerId: p.customerId }),
  );

  const items: UnifiedOpsItem[] = [];

  for (const review of paymentReviews) {
    items.push(paymentReviewToItem(review));
  }

  const bookingIdsWithPaymentProof = new Set(
    paymentReviews.map((p) => p.bookingId).filter(Boolean) as string[],
  );

  const pendingElecInvoiceIds = new Set(
    paymentReviews
      .filter((p) => p.kind === 'electricity')
      .map((p) => p.entityId)
      .filter(Boolean) as string[],
  );

  const activeCheckoutCustomerIds = new Set(
    checkoutSettlements
      .filter((s) => isActiveCheckoutSettlement(s))
      .map((s) => s.customerId),
  );

  const electricityDueItems = buildCollectionsQueue({
    rentRows: [],
    electricityRows: elecPendingRes.ok ? elecPendingRes.data : [],
  });

  for (const row of electricityDueItems) {
    if (pendingElecInvoiceIds.has(row.sourceId)) continue;
    if (activeCheckoutCustomerIds.has(row.customerId)) continue;
    if (
      isDismissedFromOperationsQueue(dismissalIndex, {
        customerId: row.customerId,
        bookingId: row.bookingId ?? undefined,
      })
    ) {
      continue;
    }
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) continue;
    items.push(electricityCollectionToItem(row));
  }

  for (const row of residentsPage.queue) {
    if (row.category === 'electricity_due') continue;
    const item = residentsRowToItem(row);
    if (item) items.push(item);
  }

  for (const b of bookingApprovals) {
    if (bookingIdsWithPaymentProof.has(b.id)) continue;
    items.push({
      id: `booking-${b.id}`,
      queue: 'booking_approval',
      residentName: b.customerName,
      pgName: b.pgName,
      roomNumber: null,
      bedCode: null,
      reason: 'Booking pending admin approval',
      openHref: `/admin/bookings/${b.id}`,
      openLabel: 'Review booking',
      bookingId: b.id,
      bookingCode: b.bookingCode,
      statusLabel: 'Pending approval',
    });
  }

  for (const row of depositDueRows) {
    items.push({
      id: `deposit-due-${row.bookingId}`,
      queue: 'deposit_due',
      customerId: row.customerId,
      residentName: row.customerName,
      residentPhone: row.customerPhone,
      pgId: row.pgId,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
      reason: 'Security deposit outstanding',
      openHref: depositExpressHref(row.bookingId),
      openLabel: 'Open Deposit',
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      amountPaise: row.remainingDuePaise,
      depositRequiredPaise: row.requiredDepositPaise,
      depositPaidPaise: row.alreadyPaidPaise,
      depositRemainingPaise: row.remainingDuePaise,
      outstandingLines: [
        {
          categoryLabel: 'Deposit',
          periodLabel: 'Security deposit',
          amountPaise: row.remainingDuePaise,
          kind: 'deposit',
          bookingId: row.bookingId,
          label: 'Deposit due',
        },
      ],
    });
  }

  const counts = countByQueue(items);
  const filter = filterInput ?? defaultOperationsFilter(counts);

  const filtered = items.filter((item) => item.queue === filter);

  const filterCounts = OPS_QUEUE_FILTERS.map((id) => ({
    id,
    label: OPS_QUEUE_LABELS[id],
    count: counts[id],
  }));

  return {
    items: filtered,
    filter,
    filterCounts,
    paymentReviews,
    focusReviewKey: focusReviewKey ?? null,
    totalCount: items.length,
  };
}

/** @deprecated Use buildUnifiedOpsFilterTags from tests only — queues are assigned in row mappers. */
export function buildUnifiedOpsFilterTags(input: {
  category: ResidentOpsQueueCategory | 'booking_approval' | 'deposit_due';
}): OpsQueueFilter[] {
  switch (input.category) {
    case 'payment_proof':
      return ['waiting_for_approval'];
    case 'rent_due':
    case 'rent_overdue':
      return ['rent_due'];
    case 'electricity_due':
      return ['electricity_due'];
    case 'move_out':
      return ['vacating_requests'];
    case 'refund':
      return ['refund_due'];
    case 'kyc':
      return ['kyc_review'];
    case 'bed_assignment':
      return [];
    case 'deposit_due':
      return ['deposit_due'];
    case 'booking_approval':
      return ['booking_approval'];
    default:
      return [];
  }
}
