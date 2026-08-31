/**
 * Payment Review Workspace — single loader SSOT for /admin/payment-review/[reviewKey].
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgPaymentRecords,
  roomChangeRequests,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { parseReservationStayRangeStart } from '@/src/lib/dates';
import { coerceNonNegativePaise } from '@/src/lib/format';
import {
  adminBookingStatusLabel,
  stayTypeBusinessLabel,
} from '@/src/lib/stayType';
import type { RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import {
  getNextPendingPaymentReviewKey,
  getPendingPaymentReviewByKey,
} from '@/src/services/paymentProofQueue';
import {
  listPaymentProofRejectionsForEntity,
  reviewKindToEntityType,
  type PaymentProofRejectionHistoryRowClient,
} from '@/src/services/paymentProofRejectionService';

export type PaymentReviewRoomChangeLine = {
  label: string;
  amountPaise: number;
  kind: 'credit' | 'charge';
};

export type PaymentReviewRoomChangeContext = {
  status: string;
  fromLabel: string;
  toLabel: string;
  shiftDate: string | null;
  totalDuePaise: number;
  depositDuePaise: number;
  rentAdjustmentPaise: number;
  feeDuePaise: number;
  lines: PaymentReviewRoomChangeLine[];
};

export type PaymentReviewWorkspaceBookingContext = {
  bookingId: string;
  bookingCode: string;
  bookingStatus: string;
  bookingStatusLabel: string;
  stayTypeLabel: string;
  pgName: string;
  floorLabel: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  bedStatus: string | null;
  occupancyLabel: string | null;
  monthlyRentPaise: number | null;
  depositRequiredPaise: number;
  checkInDate: string | null;
  expectedMoveInDate: string | null;
  expectedCheckoutDate: string | null;
  billingCycleLabel: string | null;
  durationLabel: string | null;
  createdAt: string | null;
  residentNotes: string | null;
  adminNotes: string | null;
  roomChange: PaymentReviewRoomChangeContext | null;
};

export type PaymentReviewWorkspaceData = {
  reviewKey: string;
  item: PendingPaymentReviewItem;
  breakdown: PaymentReviewBreakdown;
  rejectionHistory: PaymentProofRejectionHistoryRowClient[];
  booking: PaymentReviewWorkspaceBookingContext | null;
  kycStatus: 'pending' | 'approved' | 'rejected' | null;
  nextReviewKey: string | null;
  bookingLoadError: string | null;
};

export type LoadPaymentReviewWorkspaceResult =
  | { ok: true; data: PaymentReviewWorkspaceData }
  | { ok: false; reason: 'not_found' | 'access_denied' | 'already_processed' };

async function loadBookingContext(
  bookingId: string,
  pgName: string,
): Promise<PaymentReviewWorkspaceBookingContext | null> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      durationMode: bookings.durationMode,
      stayType: bookings.stayType,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      createdAt: bookings.createdAt,
      notes: bookings.notes,
      adminOpsNotes: bookings.adminOpsNotes,
      billingAnchorDate: bookings.billingAnchorDate,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      floorNumber: floors.floorNumber,
      floorLabel: floors.label,
      reservationStatus: bedReservations.status,
      stayRange: bedReservations.stayRange,
    })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) return null;

  let depositRequiredPaise = coerceNonNegativePaise(row.depositPaise);
  try {
    const balances = await getBookingMoneyBalances(bookingId, { repairDepositCache: false });
    if (balances) {
      depositRequiredPaise = coerceNonNegativePaise(balances.deposit.requiredPaise);
    }
  } catch {
    // Booking row deposit_paise remains the display fallback.
  }

  const checkInDate =
    parseReservationStayRangeStart(row.stayRange) ?? row.billingAnchorDate ?? null;
  const monthlyRentPaise = coerceNonNegativePaise(
    coerceNonNegativePaise(row.subtotalPaise) - coerceNonNegativePaise(row.discountPaise),
  );

  let roomChange: PaymentReviewRoomChangeContext | null = null;
  try {
    roomChange = await loadRoomChangeContext(bookingId);
  } catch {
    roomChange = null;
  }

  const createdAt =
    row.createdAt instanceof Date && Number.isFinite(row.createdAt.getTime())
      ? row.createdAt.toISOString()
      : null;

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    bookingStatus: row.status,
    bookingStatusLabel: adminBookingStatusLabel(row.status),
    stayTypeLabel: stayTypeBusinessLabel(
      { stayType: row.stayType, durationMode: row.durationMode },
      'ops',
    ),
    pgName,
    floorLabel: row.floorLabel ?? (row.floorNumber != null ? `Floor ${row.floorNumber}` : null),
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    bedStatus: row.reservationStatus,
    occupancyLabel:
      row.reservationStatus === 'active'
        ? 'Occupied'
        : row.reservationStatus === 'hold' || row.reservationStatus === 'under_review'
          ? 'Reserved'
          : row.reservationStatus,
    monthlyRentPaise,
    depositRequiredPaise,
    checkInDate,
    expectedMoveInDate: checkInDate,
    expectedCheckoutDate: row.expectedCheckoutDate,
    billingCycleLabel:
      row.durationMode === 'open_ended' || row.durationMode === 'monthly'
        ? 'Monthly billing cycle'
        : null,
    durationLabel: row.expectedCheckoutDate
      ? `${checkInDate ?? '—'} → ${row.expectedCheckoutDate}`
      : checkInDate,
    createdAt,
    residentNotes: row.notes,
    adminNotes: row.adminOpsNotes,
    roomChange,
  };
}

async function loadRoomChangeContext(
  bookingId: string,
): Promise<PaymentReviewRoomChangeContext | null> {
  const [rcr] = await db
    .select({
      status: roomChangeRequests.status,
      requestedShiftDate: roomChangeRequests.requestedShiftDate,
      expectedTransferDate: roomChangeRequests.expectedTransferDate,
      quoteSnapshot: roomChangeRequests.quoteSnapshot,
    })
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.bookingId, bookingId))
    .orderBy(desc(roomChangeRequests.createdAt))
    .limit(1);
  if (!rcr) return null;

  const quote = rcr.quoteSnapshot as RoomShiftQuoteSnapshot | null;
  const lines: PaymentReviewRoomChangeLine[] = Array.isArray(quote?.lines)
    ? quote.lines.map((line) => ({
        label: String(line.label ?? 'Line'),
        amountPaise: coerceNonNegativePaise(line.amountPaise),
        kind: line.kind === 'credit' ? 'credit' : 'charge',
      }))
    : [];

  return {
    status: rcr.status,
    fromLabel: quote?.fromRoomLabel?.trim() || 'Previous bed',
    toLabel:
      [quote?.toPgName, quote?.toRoomNumber ? `Room ${quote.toRoomNumber}` : null, quote?.toBedCode]
        .filter(Boolean)
        .join(' · ') || 'New bed',
    shiftDate: rcr.expectedTransferDate ?? rcr.requestedShiftDate ?? quote?.shiftDate ?? null,
    totalDuePaise: coerceNonNegativePaise(quote?.totalDuePaise),
    depositDuePaise: coerceNonNegativePaise(quote?.depositDuePaise),
    rentAdjustmentPaise: coerceNonNegativePaise(quote?.newRentDuePaise),
    feeDuePaise: coerceNonNegativePaise(quote?.feeDuePaise),
    lines,
  };
}

export async function loadPaymentReviewWorkspace(
  session: AdminSession,
  reviewKey: string,
): Promise<LoadPaymentReviewWorkspaceResult> {
  const item = await getPendingPaymentReviewByKey(session, reviewKey);
  if (!item) {
    const recordId = reviewKey.startsWith('qr-') ? reviewKey.slice(3) : null;
    if (recordId) {
      const [record] = await db
        .select({ status: pgPaymentRecords.status })
        .from(pgPaymentRecords)
        .where(eq(pgPaymentRecords.id, recordId))
        .limit(1);
      if (record && record.status !== 'pending') {
        return { ok: false, reason: 'already_processed' };
      }
    }
    return { ok: false, reason: 'not_found' };
  }

  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, item.pgId)) {
    return { ok: false, reason: 'access_denied' };
  }

  const breakdown = buildPaymentReviewBreakdown(item);
  let rejectionHistory: PaymentProofRejectionHistoryRowClient[] = [];
  try {
    rejectionHistory = await listPaymentProofRejectionsForEntity(
      reviewKindToEntityType(item.kind),
      item.entityId,
    );
  } catch {
    rejectionHistory = [];
  }

  let kycStatus: PaymentReviewWorkspaceData['kycStatus'] = null;
  if (item.customerId) {
    const [customer] = await db
      .select({ kycStatus: customers.kycStatus })
      .from(customers)
      .where(eq(customers.id, item.customerId))
      .limit(1);
    kycStatus = customer?.kycStatus ?? null;
  }

  let booking: PaymentReviewWorkspaceBookingContext | null = null;
  let bookingLoadError: string | null = null;
  if (item.bookingId) {
    try {
      booking = await loadBookingContext(item.bookingId, item.pgName);
      if (!booking) {
        bookingLoadError = 'Booking financials could not be loaded for this review.';
      }
    } catch {
      bookingLoadError = 'Booking financials could not be loaded for this review.';
    }
  }

  let nextReviewKey: string | null = null;
  try {
    nextReviewKey = await getNextPendingPaymentReviewKey(session, reviewKey);
  } catch {
    nextReviewKey = null;
  }

  return {
    ok: true,
    data: {
      reviewKey,
      item,
      breakdown,
      rejectionHistory,
      booking,
      kycStatus,
      nextReviewKey,
      bookingLoadError,
    },
  };
}
