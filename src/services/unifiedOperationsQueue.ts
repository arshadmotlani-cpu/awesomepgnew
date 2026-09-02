/**
 * Operations action center — eight admin queues, one action per row.
 */

import { and, eq, inArray, not, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReserveHolds,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgPaymentRecords,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { buildCollectionsQueue, collectionQueueItemOpenHref, type CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';
import { attachFinancialInvoiceIdsToCollectionQueue } from '@/src/lib/billing/collectionsQueue.server';
import { billingMonthLabel } from '@/src/lib/billing/invoiceCollectionWhatsApp';
import { bookingFinancialWorkspaceHref } from '@/src/lib/bookings/bookingFinancialLinks';
import { listAdminElectricityInvoicesForReminders } from '@/src/db/queries/admin';
import { isActiveCheckoutSettlement } from '@/src/lib/residents/residentLifecycleState';
import {
  PAYOUT_PENDING_STATUS,
  RECORD_PAYOUT_CTA,
} from '@/src/lib/payout/payoutDisplayTerminology';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import {
  assertOperationsQueueParity,
  buildOperationsQueueFilterCounts,
  countOperationsQueueItems,
  dedupeOperationsQueueItems,
  filterOperationsQueueItems,
} from '@/src/lib/operations/operationsQueueDefinition';
import {
  assertUnifiedOperationsActiveFilterParity,
  recomputeOperationsFilterCounts,
} from '@/src/lib/operations/operationsQueueCounts';
import {
  defaultOperationsFilter,
  operationsFilterHref,
  OPS_QUEUE_FILTERS,
  OPS_QUEUE_LABELS,
  parseOperationsFilter,
  type OpsQueueFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import { isRoomOsOperationsQueueEnabled } from '@/src/lib/operations/featureFlag';
import { enrichUnifiedOpsItemsWithFinancialInvoiceIds } from '@/src/lib/operations/operationsQueueFinancialLinks';
import { loadRoomOsOperationsQueueItems } from '@/src/lib/operations/roomOsOperationsQueueAdapter';
import { loadSupplementaryOperationsQueueItems } from '@/src/lib/operations/supplementaryOperationsQueue';
import { mapVacatingPipelineItemToOpsItem, mapVacatingDateChangeToOpsItem } from '@/src/lib/operations/operationsQueueVacating';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';
import type { ResidentOpsQueueCategory } from '@/src/lib/residents/residentOperationsDashboard';
import {
  isDismissedFromOperationsQueue,
  loadOperationsQueueDismissalIndex,
  type OperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { getPendingPaymentReviewsForRequest } from '@/src/services/paymentProofQueue';
import { loadMoveOutPipelineBundle, type MoveOutPipelineBundle } from '@/src/services/moveOutPipelineService';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { repairTerminalCheckoutOperations } from '@/src/services/terminalCheckoutOperationsRepair';
import { resolveTerminalCheckoutUnresolvedActions } from '@/src/services/unresolvedActionSync';
import { mapLegacyBookingApprovalToOpsItem } from '@/src/lib/operations/bookingApprovalQueue';
import { openBookingRowSupersededByNewerAnchoredStaySql } from '@/src/lib/operations/paymentReviewSsot';
import { cache } from 'react';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';

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
  dateChangeRequestId?: string | null;
};

export type UnifiedOperationsQueue = {
  items: UnifiedOpsItem[];
  filter: OpsQueueFilter;
  filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
  paymentReviews: PendingPaymentReviewItem[];
  focusReviewKey: string | null;
  totalCount: number;
};

const EMPTY_MOVE_OUT_BUNDLE: MoveOutPipelineBundle = {
  activeItems: [],
  approvalItems: [],
  settlementItems: [],
  moveOutNoticeItems: [],
  bedsReleasingItems: [],
  counts: {
    moveOutApprovalRequests: 0,
    moveOutNotices: 0,
    bedsReleasing30Days: 0,
    activeCheckoutSettlements: 0,
  },
  activeVacatingRequestIds: [],
  vacatingRows: [],
  settlements: [],
  depositHeldByBooking: {},
  pipeline: [],
};

const EMPTY_DISMISSAL_INDEX: OperationsQueueDismissalIndex = {
  customerIds: new Set(),
  bookingIds: new Set(),
  vacatingIds: new Set(),
  settlementIds: new Set(),
};

type ResidentsPageSnapshot = Awaited<ReturnType<typeof loadResidentOperationsResidentsPage>>;

const EMPTY_RESIDENTS_PAGE = {
  commandCards: [],
  queue: [],
  allQueueCount: 0,
  nextQueueItem: null,
  journeyCounts: [],
  blockedResidents: [],
  recentActivity: [],
  activeFilter: null,
} as unknown as ResidentsPageSnapshot;

type BuildUnifiedOperationsQueueOptions = {
  /** Badge polls must stay fast — skip terminal repair passes. */
  skipRepairs?: boolean;
  /** Rent/KYC rows from residents dashboard — badge path skips the heavy page load. */
  skipResidents?: boolean;
  /** Parity audit — force data source regardless of ROOM_OS_OPERATIONS_QUEUE. */
  forceSource?: 'legacy' | 'room_os';
};

function emptyOperationsFilterCounts(): Array<{ id: OpsQueueFilter; label: string; count: number }> {
  return OPS_QUEUE_FILTERS.map((id) => ({ id, label: OPS_QUEUE_LABELS[id], count: 0 }));
}

/** Safe fallback when unified queue assembly fails — keeps admin shell pages alive. */
export function emptyUnifiedOperationsQueue(
  filterInput?: OpsQueueFilter | null,
): UnifiedOperationsQueue {
  const filterCounts = emptyOperationsFilterCounts();
  return {
    items: [],
    filter: filterInput ?? 'waiting_for_approval',
    filterCounts,
    paymentReviews: [],
    focusReviewKey: null,
    totalCount: 0,
  };
}

async function loadOperationsQueueSlice<T>(
  label: string,
  fallback: T,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (err) {
    console.error(`[operations-queue] ${label} failed`, err);
    return fallback;
  }
}

function overdueReason(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'Awaiting resident payment';
  return `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`;
}

async function appendPendingVacatingDateChangeOpsItems(
  session: AdminSession,
  items: UnifiedOpsItem[],
  dismissalIndex: OperationsQueueDismissalIndex,
): Promise<void> {
  const { listPendingVacatingDateChangesForOps } = await import('@/src/services/vacatingDateChange');
  const pending = await listPendingVacatingDateChangesForOps(50);
  for (const row of pending) {
    if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
      continue;
    }
    if (
      isDismissedFromOperationsQueue(dismissalIndex, {
        customerId: row.customerId,
        bookingId: row.bookingId,
        vacatingRequestId: row.vacatingRequestId,
      })
    ) {
      continue;
    }
    items.push(mapVacatingDateChangeToOpsItem(row));
  }
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
    openHref: collectionQueueItemOpenHref(row),
    openLabel: 'Open bills',
    category: 'electricity_due',
    bookingId: row.bookingId ?? null,
    amountPaise: row.amountPaise,
    billingMonth: row.billingMonth,
    outstandingLines: [outstandingLine],
  };
}

function paymentReviewToItem(review: PendingPaymentReviewItem): UnifiedOpsItem {
  const isReservationRequest = review.lifecycleState === 'reservation_request';
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
    reason: isReservationRequest
      ? `Reservation request — ${review.subtitle || review.title}`
      : review.subtitle || review.title,
    openHref: operationsFilterHref('waiting_for_approval', review.key),
    openLabel: isReservationRequest ? 'Review request' : 'Review',
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
      openLabel: RECORD_PAYOUT_CTA,
      category: row.category,
      bookingId: row.bookingId,
      amountPaise: row.outstandingAmountPaise,
      statusLabel: PAYOUT_PENDING_STATUS,
    };
  }

  if (row.category === 'move_out') {
    return null;
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
      reason: row.reason,
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

/** Bookings with an approved checkout payment proof — deposit-due must not double-count. */
async function loadBookingIdsWithApprovedCheckoutProof(): Promise<Set<string>> {
  const rows = await db
    .select({ bookingId: pgPaymentRecords.bookingId })
    .from(pgPaymentRecords)
    .where(
      and(
        eq(pgPaymentRecords.status, 'approved'),
        sql`${pgPaymentRecords.bookingId} IS NOT NULL`,
        sql`(
          (${pgPaymentRecords.paymentScreenshotUrl} IS NOT NULL AND trim(${pgPaymentRecords.paymentScreenshotUrl}) <> '')
          OR (${pgPaymentRecords.transactionRef} IS NOT NULL AND trim(${pgPaymentRecords.transactionRef}) <> '')
        )`,
      ),
    );
  return new Set(rows.map((r) => r.bookingId).filter(Boolean) as string[]);
}

export async function listPendingBookingApprovalsForSync(session: AdminSession) {
  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      durationMode: bookings.durationMode,
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
    .where(
      and(
        eq(bookings.status, 'pending_approval'),
        sql`${bookings.durationMode}::text <> 'reserve'`,
        not(openBookingRowSupersededByNewerAnchoredStaySql),
        sql`NOT EXISTS (
          SELECT 1 FROM bed_reservations br2
          WHERE br2.booking_id = ${bookings.id}
            AND br2.status::text = 'under_review'
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${bedReserveHolds} brh
          WHERE brh.booking_id = ${bookings.id}
            AND brh.status::text = 'active'
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${bedReserveHolds} brh
          WHERE brh.booking_id = ${bookings.id}
            AND brh.status::text IN ('cancelled', 'expired')
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${pgPaymentRecords} ppr
          WHERE ppr.booking_id = ${bookings.id}
            AND ppr.status::text = 'approved'
            AND ppr.payment_screenshot_url IS NOT NULL
        )`,
      ),
    );

  const byBooking = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (row.pgId && !byBooking.has(row.id)) byBooking.set(row.id, row);
  }

  return [...byBooking.values()].filter((r) =>
    r.pgId ? adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, r.pgId) : false,
  );
}

export function parseUnifiedOpsFilter(value: string | undefined): OpsQueueFilter | null {
  return parseOperationsFilter(value);
}

export async function loadUnifiedOperationsQueue(
  session: AdminSession,
  filterInput?: OpsQueueFilter | null,
  focusReviewKey?: string | null,
): Promise<UnifiedOperationsQueue> {
  return getUnifiedOperationsQueueForRequest(session, filterInput, focusReviewKey);
}

async function buildRoomOsUnifiedOperationsQueue(
  session: AdminSession,
  options?: BuildUnifiedOperationsQueueOptions,
): Promise<{
  allItems: UnifiedOpsItem[];
  paymentReviews: PendingPaymentReviewItem[];
  filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
}> {
  if (!options?.skipRepairs) {
    await repairTerminalCheckoutOperations();
    await resolveTerminalCheckoutUnresolvedActions();
  }

  const [
    roomOsItems,
    bookingApprovals,
    rawPaymentReviews,
    dismissalIndex,
    depositDueRows,
    checkoutSettlements,
    moveOutBundle,
  ] = await Promise.all([
    loadOperationsQueueSlice('room os queue', [], () =>
      loadRoomOsOperationsQueueItems(session),
    ),
    loadOperationsQueueSlice('booking approvals', [], () =>
      listPendingBookingApprovalsForSync(session),
    ),
    loadOperationsQueueSlice('payment reviews', [], () =>
      getPendingPaymentReviewsForRequest(session),
    ),
    loadOperationsQueueSlice('dismissals', EMPTY_DISMISSAL_INDEX, () =>
      loadOperationsQueueDismissalIndex(),
    ),
    loadOperationsQueueSlice('deposit due', [], () =>
      import('@/src/services/depositExpress').then((m) => m.listDepositDueBookings(session)),
    ),
    loadOperationsQueueSlice('checkout settlements', [], () =>
      listPipelineCheckoutSettlements(session),
    ),
    loadOperationsQueueSlice('move-out pipeline', EMPTY_MOVE_OUT_BUNDLE, () =>
      loadMoveOutPipelineBundle(session, { syncSettlements: false }),
    ),
  ]);

  const supplementaryItems = options?.skipResidents
    ? []
    : await loadOperationsQueueSlice('supplementary ops', [], () =>
        loadSupplementaryOperationsQueueItems(session, dismissalIndex, checkoutSettlements),
      );

  const vacatingPgByRequestId = new Map(
    moveOutBundle.vacatingRows.map((row) => [row.id, row.pgId]),
  );

  const paymentReviews = rawPaymentReviews.filter(
    (p) =>
      !p.customerId ||
      !isDismissedFromOperationsQueue(dismissalIndex, { customerId: p.customerId }),
  );

  let items: UnifiedOpsItem[] = [...roomOsItems, ...supplementaryItems];

  for (const review of paymentReviews) {
    items.push(paymentReviewToItem(review));
  }

  const bookingIdsWithPaymentProof = new Set(
    paymentReviews.map((p) => p.bookingId).filter(Boolean) as string[],
  );

  const approvedCheckoutBookingIds = await loadBookingIdsWithApprovedCheckoutProof();

  const pendingElecBookingIds = new Set(
    paymentReviews
      .filter((p) => p.kind === 'electricity')
      .map((p) => p.bookingId)
      .filter(Boolean) as string[],
  );

  const activeCheckoutCustomerIds = new Set(
    checkoutSettlements
      .filter((s) => isActiveCheckoutSettlement(s))
      .map((s) => s.customerId),
  );

  items = items.filter((item) => {
    if (item.queue === 'electricity_due' && item.bookingId) {
      if (pendingElecBookingIds.has(item.bookingId)) return false;
      if (activeCheckoutCustomerIds.has(item.customerId ?? '')) return false;
      if (
        isDismissedFromOperationsQueue(dismissalIndex, {
          customerId: item.customerId,
          bookingId: item.bookingId,
        })
      ) {
        return false;
      }
    }
    if (item.queue === 'rent_due' && item.bookingId) {
      if (activeCheckoutCustomerIds.has(item.customerId ?? '')) return false;
      if (
        isDismissedFromOperationsQueue(dismissalIndex, {
          customerId: item.customerId,
          bookingId: item.bookingId,
        })
      ) {
        return false;
      }
    }
    return true;
  });

  for (const pipelineItem of moveOutBundle.activeItems) {
    if (
      isDismissedFromOperationsQueue(dismissalIndex, {
        customerId: pipelineItem.customerId,
        bookingId: pipelineItem.bookingId,
        vacatingRequestId: pipelineItem.vacatingRequestId,
      })
    ) {
      continue;
    }
    const pgId = vacatingPgByRequestId.get(pipelineItem.vacatingRequestId) ?? null;
    if (pgId && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
      continue;
    }
    const mapped = mapVacatingPipelineItemToOpsItem(pipelineItem, pgId);
    if (mapped) items.push(mapped);
  }

  for (const b of bookingApprovals) {
    if (bookingIdsWithPaymentProof.has(b.id)) continue;
    items.push(mapLegacyBookingApprovalToOpsItem(b));
  }

  // Normal room changes are self-service and complete automatically.
  // Their invoices appear in financial due queues; there is no approval/execution task.

  for (const row of depositDueRows) {
    if (row.bookingId && approvedCheckoutBookingIds.has(row.bookingId)) continue;
    if (row.bookingId && bookingIdsWithPaymentProof.has(row.bookingId)) continue;
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
      openHref: bookingFinancialWorkspaceHref(row.bookingId),
      openLabel: 'Review finances',
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

  await appendPendingVacatingDateChangeOpsItems(session, items, dismissalIndex);

  items = dedupeOperationsQueueItems(items);

  const counts = countOperationsQueueItems(items);
  assertOperationsQueueParity(items, counts);
  const filterCounts = buildOperationsQueueFilterCounts(items);

  return {
    allItems: items,
    paymentReviews,
    filterCounts,
  };
}

async function buildUnifiedOperationsQueue(
  session: AdminSession,
  _filterInput?: OpsQueueFilter | null,
  _focusReviewKey?: string | null,
  options?: BuildUnifiedOperationsQueueOptions,
): Promise<{
  allItems: UnifiedOpsItem[];
  paymentReviews: PendingPaymentReviewItem[];
  filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
}> {
  unifiedQueueBuildCount += 1;

  if (options?.forceSource === 'room_os') {
    return buildRoomOsUnifiedOperationsQueue(session, options);
  }
  if (options?.forceSource !== 'legacy' && isRoomOsOperationsQueueEnabled()) {
    return buildRoomOsUnifiedOperationsQueue(session, options);
  }

  if (!options?.skipRepairs) {
    // Close terminal checkout rows that still inflate vacating / refund queue counts.
    await repairTerminalCheckoutOperations();
    await resolveTerminalCheckoutUnresolvedActions();
  }

  const [
    residentsPage,
    bookingApprovals,
    rawPaymentReviews,
    dismissalIndex,
    depositDueRows,
    elecPendingRes,
    checkoutSettlements,
    moveOutBundle,
  ] = await Promise.all([
    options?.skipResidents
      ? Promise.resolve(EMPTY_RESIDENTS_PAGE)
      : loadOperationsQueueSlice(
          'residents queue',
          EMPTY_RESIDENTS_PAGE,
          () => loadResidentOperationsResidentsPage(session, null),
        ),
    loadOperationsQueueSlice('booking approvals', [], () =>
      listPendingBookingApprovalsForSync(session),
    ),
    loadOperationsQueueSlice('payment reviews', [], () =>
      getPendingPaymentReviewsForRequest(session),
    ),
    loadOperationsQueueSlice('dismissals', EMPTY_DISMISSAL_INDEX, () =>
      loadOperationsQueueDismissalIndex(),
    ),
    loadOperationsQueueSlice('deposit due', [], () =>
      import('@/src/services/depositExpress').then((m) => m.listDepositDueBookings(session)),
    ),
    loadOperationsQueueSlice('electricity reminders', { ok: false as const, error: '' }, () =>
      listAdminElectricityInvoicesForReminders(),
    ),
    loadOperationsQueueSlice('checkout settlements', [], () =>
      listPipelineCheckoutSettlements(session),
    ),
    loadOperationsQueueSlice('move-out pipeline', EMPTY_MOVE_OUT_BUNDLE, () =>
      loadMoveOutPipelineBundle(session, { syncSettlements: false }),
    ),
  ]);

  const vacatingPgByRequestId = new Map(
    moveOutBundle.vacatingRows.map((row) => [row.id, row.pgId]),
  );

  const paymentReviews = rawPaymentReviews.filter(
    (p) =>
      !p.customerId ||
      !isDismissedFromOperationsQueue(dismissalIndex, { customerId: p.customerId }),
  );

  let items: UnifiedOpsItem[] = [];

  for (const review of paymentReviews) {
    items.push(paymentReviewToItem(review));
  }

  const bookingIdsWithPaymentProof = new Set(
    paymentReviews.map((p) => p.bookingId).filter(Boolean) as string[],
  );

  const approvedCheckoutBookingIds = await loadBookingIdsWithApprovedCheckoutProof();

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

  const electricityDueItems = await attachFinancialInvoiceIdsToCollectionQueue(
    buildCollectionsQueue({
      rentRows: [],
      electricityRows: elecPendingRes.ok ? (elecPendingRes.data ?? []) : [],
    }),
  );

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

  for (const pipelineItem of moveOutBundle.activeItems) {
    if (
      isDismissedFromOperationsQueue(dismissalIndex, {
        customerId: pipelineItem.customerId,
        bookingId: pipelineItem.bookingId,
        vacatingRequestId: pipelineItem.vacatingRequestId,
      })
    ) {
      continue;
    }
    const pgId = vacatingPgByRequestId.get(pipelineItem.vacatingRequestId) ?? null;
    if (pgId && !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
      continue;
    }
    const mapped = mapVacatingPipelineItemToOpsItem(pipelineItem, pgId);
    if (mapped) items.push(mapped);
  }

  for (const row of residentsPage.queue) {
    if (row.category === 'electricity_due' || row.category === 'move_out') continue;
    const item = residentsRowToItem(row);
    if (item) items.push(item);
  }

  for (const b of bookingApprovals) {
    if (bookingIdsWithPaymentProof.has(b.id)) continue;
    // Pending approval only — never inject active/confirmed reserves into this queue.
    items.push(mapLegacyBookingApprovalToOpsItem(b));
  }

  // Normal room changes are self-service. Outstanding charge lines already
  // surface in the financial queues and completion is attempted automatically.

  for (const row of depositDueRows) {
    if (row.bookingId && approvedCheckoutBookingIds.has(row.bookingId)) continue;
    if (row.bookingId && bookingIdsWithPaymentProof.has(row.bookingId)) continue;
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
      openHref: bookingFinancialWorkspaceHref(row.bookingId),
      openLabel: 'Review finances',
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

  await appendPendingVacatingDateChangeOpsItems(session, items, dismissalIndex);

  items = dedupeOperationsQueueItems(items);

  const counts = countOperationsQueueItems(items);
  assertOperationsQueueParity(items, counts);
  const filterCounts = buildOperationsQueueFilterCounts(items);

  return {
    allItems: items,
    paymentReviews,
    filterCounts,
  };
}

/** @internal — exported for queue parity unit tests */
export function applyUnifiedOperationsFilter(
  base: {
    allItems: UnifiedOpsItem[];
    paymentReviews: PendingPaymentReviewItem[];
    filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
  },
  filterInput?: OpsQueueFilter | null,
  focusReviewKey?: string | null,
): UnifiedOperationsQueue {
  const filterCounts = recomputeOperationsFilterCounts(base.allItems);
  const counts = countOperationsQueueItems(base.allItems);
  assertOperationsQueueParity(base.allItems, counts);
  const filter = filterInput ?? defaultOperationsFilter(counts);
  const filtered = filterOperationsQueueItems(base.allItems, filter);

  const activeReviewKeys = new Set(
    base.allItems
      .filter((item) => item.queue === 'waiting_for_approval' && item.paymentReviewKey)
      .map((item) => item.paymentReviewKey as string),
  );
  const paymentReviews =
    filter === 'waiting_for_approval'
      ? base.paymentReviews.filter((review) => activeReviewKeys.has(review.key))
      : base.paymentReviews;

  const queue: UnifiedOperationsQueue = {
    items: filtered,
    filter,
    filterCounts,
    paymentReviews,
    focusReviewKey: focusReviewKey ?? null,
    totalCount: base.allItems.length,
  };

  assertUnifiedOperationsActiveFilterParity(queue);
  return queue;
}

const buildUnifiedOperationsQueueCached = cache(
  async (
    scopeKey: string,
    session: AdminSession,
  ): Promise<{
    allItems: UnifiedOpsItem[];
    paymentReviews: PendingPaymentReviewItem[];
    filterCounts: Array<{ id: OpsQueueFilter; label: string; count: number }>;
  }> => {
    void scopeKey;
    return buildUnifiedOperationsQueue(session, null, null);
  },
);

/** @deprecated alias — badges and pages share one cache per request */
const buildUnifiedOperationsQueueBaseCached = buildUnifiedOperationsQueueCached;

/** Deduped within a single admin RSC request (layout + page + nested loaders). */
export function getUnifiedOperationsQueueForRequest(
  session: AdminSession,
  filterInput?: OpsQueueFilter | null,
  focusReviewKey?: string | null,
): Promise<UnifiedOperationsQueue> {
  return buildUnifiedOperationsQueueCached(adminRequestScopeKey(session), session)
    .then((base) => applyUnifiedOperationsFilter(base, filterInput, focusReviewKey ?? null))
    .catch((err) => {
      console.error('[operations-queue] unified queue unavailable', err);
      return emptyUnifiedOperationsQueue(filterInput);
    });
}

/** Sidebar badges — same cached base build as pages (one queue build per request). */
export function getUnifiedOperationsQueueForBadges(
  session: AdminSession,
): Promise<UnifiedOperationsQueue> {
  return buildUnifiedOperationsQueueCached(adminRequestScopeKey(session), session)
    .then((base) => applyUnifiedOperationsFilter(base, null, null))
    .catch((err) => {
      console.error('[operations-queue] badge queue unavailable', err);
      return emptyUnifiedOperationsQueue(null);
    });
}

let unifiedQueueBuildCount = 0;

/** Test/profiling only — count uncached base queue builds in this process. */
export function resetUnifiedQueueBuildCount(): void {
  unifiedQueueBuildCount = 0;
}

export function getUnifiedQueueBuildCount(): number {
  return unifiedQueueBuildCount;
}

/** Read-only parity audit — bypasses React cache and feature flag env. */
export async function loadOperationsQueueForParityAudit(
  session: AdminSession,
  source: 'legacy' | 'room_os',
): Promise<UnifiedOpsItem[]> {
  const base = await buildUnifiedOperationsQueue(session, null, null, {
    forceSource: source,
    skipRepairs: true,
  });
  return base.allItems;
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
