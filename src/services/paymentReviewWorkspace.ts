/**
 * Payment Review Workspace — single loader SSOT for /admin/payment-review/[reviewKey].
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgPaymentRecords,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { buildPaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PaymentReviewBreakdown } from '@/src/lib/operations/paymentReviewBreakdown';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import {
  adminBookingStatusLabel,
  stayTypeBusinessLabel,
} from '@/src/lib/stayType';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import {
  getNextPendingPaymentReviewKey,
  getPendingPaymentReviewByKey,
} from '@/src/services/paymentProofQueue';
import {
  listPaymentProofRejectionsForEntity,
  reviewKindToEntityType,
  type PaymentProofRejectionHistoryRow,
} from '@/src/services/paymentProofRejectionService';

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
};

export type PaymentReviewWorkspaceData = {
  reviewKey: string;
  item: PendingPaymentReviewItem;
  breakdown: PaymentReviewBreakdown;
  rejectionHistory: PaymentProofRejectionHistoryRow[];
  booking: PaymentReviewWorkspaceBookingContext | null;
  kycStatus: 'pending' | 'approved' | 'rejected' | null;
  nextReviewKey: string | null;
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

  const balances = await getBookingMoneyBalances(bookingId);
  const moveInMatch = row.stayRange?.match(/^\["(\d{4}-\d{2}-\d{2})/);
  const checkInDate = moveInMatch?.[1] ?? row.billingAnchorDate ?? null;

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
    monthlyRentPaise: Math.max(0, row.subtotalPaise - row.discountPaise),
    depositRequiredPaise: balances?.deposit.requiredPaise ?? row.depositPaise,
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
    createdAt: row.createdAt?.toISOString() ?? null,
    residentNotes: row.notes,
    adminNotes: row.adminOpsNotes,
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
  const rejectionHistory = await listPaymentProofRejectionsForEntity(
    reviewKindToEntityType(item.kind),
    item.entityId,
  );

  let kycStatus: PaymentReviewWorkspaceData['kycStatus'] = null;
  if (item.customerId) {
    const [customer] = await db
      .select({ kycStatus: customers.kycStatus })
      .from(customers)
      .where(eq(customers.id, item.customerId))
      .limit(1);
    kycStatus = customer?.kycStatus ?? null;
  }

  const booking = item.bookingId
    ? await loadBookingContext(item.bookingId, item.pgName)
    : null;

  const nextReviewKey = await getNextPendingPaymentReviewKey(session, reviewKey);

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
    },
  };
}
