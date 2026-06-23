/**
 * Partial deposit collection — tracks required vs collected vs due on bookings.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { DepositCollectionStatus } from '@/src/db/schema/enums';
import { formatDate } from '@/src/lib/dates';
import { coerceNonNegativePaise } from '@/src/lib/format';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type BookingPaymentBreakdown = {
  rentDuePaise: number;
  depositCashDuePaise: number;
  creditAppliedPaise: number;
  bookingTotalDuePaise: number;
};

export type PaymentSplitResult = BookingPaymentBreakdown & {
  rentPaisePaid: number;
  depositPaisePaid: number;
  depositDuePaise: number;
  isFullPayment: boolean;
  isPartialDeposit: boolean;
};

export function breakdownBookingPayment(booking: {
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  totalPaise: number;
  pricingSnapshot?: PricingSnapshot | null;
}): BookingPaymentBreakdown {
  const breakdown = breakdownBookingCheckoutPayment(booking);
  return {
    rentDuePaise: breakdown.rentDuePaise,
    depositCashDuePaise: breakdown.depositCashDuePaise,
    creditAppliedPaise: breakdown.creditAppliedPaise,
    bookingTotalDuePaise: breakdown.bookingTotalDuePaise,
  };
}

/** Split a booking checkout payment (excluding PS4 add-on) into rent + deposit portions. */
export function splitBookingPayment(
  booking: {
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    totalPaise: number;
    pricingSnapshot?: PricingSnapshot | null;
  },
  bookingPaymentPaise: number,
): PaymentSplitResult {
  const breakdown = breakdownBookingPayment(booking);
  const rentPaisePaid = Math.min(bookingPaymentPaise, breakdown.rentDuePaise);
  const remainder = Math.max(0, bookingPaymentPaise - breakdown.rentDuePaise);
  const depositPaisePaid = Math.min(remainder, breakdown.depositCashDuePaise);
  const depositDuePaise = Math.max(0, breakdown.depositCashDuePaise - depositPaisePaid);
  return {
    ...breakdown,
    rentPaisePaid,
    depositPaisePaid,
    depositDuePaise,
    isFullPayment: bookingPaymentPaise >= breakdown.bookingTotalDuePaise,
    isPartialDeposit: depositDuePaise > 0 && depositPaisePaid > 0,
  };
}

export type PaymentValidationResult =
  | { ok: true; split: PaymentSplitResult }
  | { ok: false; reason: string };

export function validateBookingPayment(input: {
  booking: {
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    totalPaise: number;
    pricingSnapshot?: PricingSnapshot | null;
  };
  amountPaise: number;
  membershipAmountPaise?: number;
  allowPartialDeposit?: boolean;
}): PaymentValidationResult {
  const bookingPaymentPaise = Math.max(
    0,
    input.amountPaise - (input.membershipAmountPaise ?? 0),
  );
  if (bookingPaymentPaise <= 0) {
    return { ok: false, reason: 'Payment amount must cover at least part of the booking.' };
  }

  const split = splitBookingPayment(input.booking, bookingPaymentPaise);

  if (split.isFullPayment) {
    return { ok: true, split };
  }

  if (!input.allowPartialDeposit) {
    const expectedTotal = split.bookingTotalDuePaise;
    if (bookingPaymentPaise < expectedTotal) {
      return {
        ok: false,
        reason: `Payment is short by ₹${((expectedTotal - bookingPaymentPaise) / 100).toFixed(0)}. Full checkout total is required unless admin approves partial deposit.`,
      };
    }
    return { ok: true, split };
  }

  if (split.rentPaisePaid < split.rentDuePaise) {
    return {
      ok: false,
      reason: `Rent (₹${(split.rentDuePaise / 100).toFixed(0)}) must be paid in full before partial deposit move-in.`,
    };
  }

  if (split.depositPaisePaid <= 0) {
    return {
      ok: false,
      reason: 'Partial deposit approval requires at least some deposit paid now.',
    };
  }

  return { ok: true, split };
}

export async function syncDepositCollectionFromLedger(bookingId: string): Promise<void> {
  const [booking] = await db
    .select({
      id: bookings.id,
      depositPaise: bookings.depositPaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      depositDuePaise: bookings.depositDuePaise,
      depositDueDate: bookings.depositDueDate,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking || coerceNonNegativePaise(booking.depositPaise) <= 0) return;

  const summary = await getDepositSummaryForBooking(bookingId);
  const collected = guardDepositPaise(summary?.collectedPaise ?? 0, 'syncDepositCollection.collected');
  const required = guardDepositPaise(booking.depositPaise, 'syncDepositCollection.required');
  const due = Math.max(0, required - collected);

  let status: DepositCollectionStatus = booking.depositCollectionStatus;
  const wasOutstanding = ['partial', 'overdue'].includes(booking.depositCollectionStatus);
  if (due <= 0) {
    status = 'full';
  } else if (collected > 0) {
    const today = formatDate(new Date());
    if (booking.depositDueDate && booking.depositDueDate < today) {
      status = 'overdue';
    } else {
      status = 'partial';
    }
  }

  await db
    .update(bookings)
    .set({
      depositCollectionStatus: status,
      depositDuePaise: due,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  if (wasOutstanding && due <= 0 && status === 'full') {
    const [ctx] = await db
      .select({
        customerId: bookings.customerId,
        pgId: floors.pgId,
        customerName: customers.fullName,
        pgName: pgs.name,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
      .innerJoin(beds, eq(beds.id, bedReservations.bedId))
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .innerJoin(floors, eq(floors.id, rooms.floorId))
      .innerJoin(pgs, eq(pgs.id, floors.pgId))
      .where(and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')))
      .limit(1);
    if (ctx) {
      const { queueAutomationEvent, processQueuedAutomationActions } = await import(
        './automationEngine'
      );
      queueAutomationEvent({
        eventType: 'deposit_collection_received',
        pgId: ctx.pgId,
        customerId: ctx.customerId,
        bookingId,
        idempotencyKey: `deposit_received:${bookingId}:${formatDate(new Date())}`,
        metadata: {
          customerName: ctx.customerName,
          pgName: ctx.pgName,
          amountPaise: booking.depositPaise,
        },
      });
      void processQueuedAutomationActions(5);
    }
  }
}

export async function applyPartialDepositOnConfirm(input: {
  bookingId: string;
  depositDuePaise: number;
  depositDueDate: string;
  approvedByAdminId: string;
}): Promise<void> {
  await db
    .update(bookings)
    .set({
      depositCollectionStatus: 'partial',
      depositDuePaise: input.depositDuePaise,
      depositDueDate: input.depositDueDate,
      depositDueApprovedByAdminId: input.approvedByAdminId,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.approvedByAdminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'partial_deposit_approved',
    diff: {
      depositDuePaise: input.depositDuePaise,
      depositDueDate: input.depositDueDate,
    },
  });

  await ensureDepositDuePaymentLink(input.bookingId);
}

export async function ensureDepositDuePaymentLink(bookingId: string): Promise<string | null> {
  const [ctx] = await db
    .select({
      customerId: bookings.customerId,
      depositDuePaise: bookings.depositDuePaise,
      depositDueDate: bookings.depositDueDate,
      depositCollectionStatus: bookings.depositCollectionStatus,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgId: floors.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);

  if (
    !ctx ||
    ctx.depositDuePaise <= 0 ||
    !['partial', 'overdue'].includes(ctx.depositCollectionStatus)
  ) {
    return null;
  }

  const { createPaymentLink } = await import('./paymentLinks');
  const { paymentLinkPublicUrl } = await import('@/src/lib/billing/paymentLinkUrl');
  const result = await createPaymentLink({
    residentId: ctx.customerId,
    pgId: ctx.pgId,
    amountPaise: ctx.depositDuePaise,
    purpose: 'deposit',
    residentName: ctx.customerName,
    residentPhone: ctx.customerPhone,
    pgName: ctx.pgName,
    dueDate: ctx.depositDueDate ?? undefined,
    roomNumber: ctx.roomNumber,
    isOverdue: ctx.depositCollectionStatus === 'overdue',
  });
  if (!result.ok) return null;
  return paymentLinkPublicUrl(result.link.id);
}

export async function applyFullDepositOnConfirm(bookingId: string): Promise<void> {
  await db
    .update(bookings)
    .set({
      depositCollectionStatus: 'full',
      depositDuePaise: 0,
      depositDueDate: null,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));
}

export async function waiveDepositDue(input: {
  bookingId: string;
  adminId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [booking] = await db
    .select({ depositDuePaise: bookings.depositDuePaise })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };
  if ((booking.depositDuePaise ?? 0) <= 0) {
    return { ok: false, error: 'No deposit balance due on this booking.' };
  }

  await db
    .update(bookings)
    .set({
      depositCollectionStatus: 'waived',
      depositDuePaise: 0,
      depositDueDate: null,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_due_waived',
    diff: { reason: input.reason },
  });

  return { ok: true };
}

export async function extendDepositDueDate(input: {
  bookingId: string;
  newDueDate: string;
  adminId?: string | null;
  fromResidentRequest?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const newDate = formatDate(new Date(input.newDueDate));
  const today = formatDate(new Date());
  if (newDate <= today) {
    return { ok: false, error: 'New due date must be in the future.' };
  }

  const [booking] = await db
    .select({
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };
  if (!['partial', 'overdue'].includes(booking.depositCollectionStatus)) {
    return { ok: false, error: 'This booking has no outstanding deposit due.' };
  }

  await db
    .update(bookings)
    .set({
      depositDueDate: newDate,
      depositCollectionStatus: 'partial',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, input.bookingId));

  await db.insert(auditLog).values({
    actorType: input.adminId ? 'admin' : 'system',
    actorId: input.adminId ?? null,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'deposit_due_extended',
    diff: { newDueDate: newDate, fromResidentRequest: input.fromResidentRequest ?? false },
  });

  return { ok: true };
}

export type OutstandingDepositRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  depositPaise: number;
  collectedPaise: number;
  depositDuePaise: number;
  depositDueDate: string | null;
  depositCollectionStatus: DepositCollectionStatus;
};

export async function listOutstandingDeposits(filter?: {
  overdueOnly?: boolean;
  dueWithinDays?: number;
}): Promise<OutstandingDepositRow[]> {
  const { listOutstandingDepositsFromEngine } = await import('./residentFinancialEngine');
  const rows = await listOutstandingDepositsFromEngine(undefined, filter);
  return rows.map((r) => ({
    ...r,
    depositCollectionStatus: r.depositCollectionStatus as DepositCollectionStatus,
  }));
}

/** Mark overdue partial deposits (cron). */
export async function markOverdueDeposits(): Promise<number> {
  const today = formatDate(new Date());
  const updated = await db
    .update(bookings)
    .set({ depositCollectionStatus: 'overdue', updatedAt: new Date() })
    .where(
      and(
        eq(bookings.depositCollectionStatus, 'partial'),
        sql`${bookings.depositDueDate} < ${today}::date`,
        sql`${bookings.depositDuePaise} > 0`,
      ),
    )
    .returning({ id: bookings.id });
  return updated.length;
}

export async function getBookingPaymentContext(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  const breakdown = breakdownBookingPayment(row);
  return { ...row, breakdown };
}

export { labelDepositCollectionStatus, hasOutstandingDepositDue } from '@/src/lib/depositCollectionLabels';
