/**
 * Fixed-stay / short-stay auto-expiry at 11:00 AM IST on expected checkout date.
 * Completes booking, releases bed, creates checkout settlement for deposit refund.
 */

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  residentBillingProfiles,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { formatDate, parseDate } from '@/src/lib/dates';
import { isPastFixedStayCheckout } from '@/src/lib/dates/ist';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { cancelElectricityInvoicesForBooking } from '@/src/services/electricityBilling';
import { createCheckoutSettlementFromVacating } from '@/src/services/checkoutSettlement';
import { cancelFutureRentInvoices } from '@/src/services/rentInvoices';
import { completeBookingReservations } from '@/src/services/vacating';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import { upsertFixedStayCheckoutActionItem } from '@/src/services/fixedStayActionItems';
import { syncActionItemsForCron } from '@/src/services/actionItems';

const FIXED_STAY_MODES = ['fixed_stay', 'daily', 'weekly'] as const;

function monthlyRentFromBooking(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, b) => acc + (b.monthlyRatePaise ?? 0), 0);
}

export { isPastFixedStayCheckout };

export type FixedStayDueRow = {
  id: string;
  bookingCode: string;
  customerId: string;
  expectedCheckoutDate: string;
  durationMode: string;
};

export async function listFixedStaysDueForExpiry(now?: Date): Promise<FixedStayDueRow[]> {
  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      durationMode: bookings.durationMode,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, [...FIXED_STAY_MODES]),
        isNotNull(bookings.expectedCheckoutDate),
      ),
    );

  return rows
    .filter(
      (r) =>
        r.expectedCheckoutDate &&
        isPastFixedStayCheckout(r.expectedCheckoutDate, now),
    )
    .map((r) => ({
      id: r.id,
      bookingCode: r.bookingCode,
      customerId: r.customerId,
      expectedCheckoutDate: String(r.expectedCheckoutDate),
      durationMode: r.durationMode,
    }));
}

async function ensureSystemVacatingRequest(booking: {
  id: string;
  customerId: string;
  expectedCheckoutDate: string;
  createdAt: Date;
  pricingSnapshot: PricingSnapshot | null;
}): Promise<string> {
  const [existing] = await db
    .select({ id: vacatingRequests.id })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, booking.id))
    .limit(1);
  if (existing) return existing.id;

  const noticeGivenDate = formatDate(parseDate(booking.createdAt));
  const vacatingDate = booking.expectedCheckoutDate;
  const monthlyRent = monthlyRentFromBooking(booking.pricingSnapshot);
  const noticeCompliant = true;
  const deduction = 0;

  const [created] = await db
    .insert(vacatingRequests)
    .values({
      bookingId: booking.id,
      customerId: booking.customerId,
      noticeGivenDate,
      vacatingDate,
      noticeCompliant,
      deductionPaise: deduction,
      monthlyRentPaiseSnapshot: monthlyRent,
      status: 'approved',
      notes: 'Auto-generated at fixed-stay checkout expiry (11 AM IST).',
    })
    .returning({ id: vacatingRequests.id });

  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'vacating_request',
    entityId: created.id,
    action: 'auto_created_fixed_stay_expiry',
    diff: { bookingId: booking.id, vacatingDate, noticeGivenDate },
  });

  return created.id;
}

/** Ensures an approved system vacating row exists for fixed-stay refund / expiry (idempotent). */
export async function ensureFixedStayCheckoutPrerequisites(input: {
  id: string;
}): Promise<string> {
  const [row] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      createdAt: bookings.createdAt,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.id))
    .limit(1);

  if (!row) {
    throw new Error(`Booking not found: ${input.id}`);
  }

  const vacatingDate =
    row.expectedCheckoutDate ?? formatDate(parseDate(row.createdAt));

  return ensureSystemVacatingRequest({
    id: row.id,
    customerId: row.customerId,
    expectedCheckoutDate: vacatingDate,
    createdAt: row.createdAt,
    pricingSnapshot: row.pricingSnapshot,
  });
}

export type ExpireFixedStayResult =
  | { ok: true; bookingId: string; settlementId: string | null; keptResidencyActive?: boolean }
  | { ok: false; kind: 'not_found' | 'wrong_status' | 'not_due' | 'error'; message?: string };

export async function expireFixedStayBooking(bookingId: string): Promise<ExpireFixedStayResult> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      durationMode: bookings.durationMode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      createdAt: bookings.createdAt,
      pricingSnapshot: bookings.pricingSnapshot,
      depositPaise: bookings.depositPaise,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return { ok: false, kind: 'not_found' };
  if (booking.status !== 'confirmed') return { ok: false, kind: 'wrong_status' };
  if (!FIXED_STAY_MODES.includes(booking.durationMode as (typeof FIXED_STAY_MODES)[number])) {
    return { ok: false, kind: 'wrong_status', message: 'Not a fixed-stay booking.' };
  }
  if (!booking.expectedCheckoutDate) {
    return { ok: false, kind: 'not_due', message: 'No checkout date.' };
  }
  if (!isPastFixedStayCheckout(booking.expectedCheckoutDate)) {
    return { ok: false, kind: 'not_due', message: 'Checkout time not reached (11 AM IST).' };
  }

  const { evaluateResidencyCheckoutOnBookingEnd, completeBookingPeriodWithoutCheckout } =
    await import('@/src/services/continuousResidency');
  const checkoutDecision = await evaluateResidencyCheckoutOnBookingEnd(booking.id);
  if (checkoutDecision.action === 'KEEP_RESIDENCY_ACTIVE') {
    await completeBookingPeriodWithoutCheckout(booking.id);
    await db.insert(auditLog).values({
      actorType: 'system',
      entity: 'booking',
      entityId: booking.id,
      action: 'fixed_stay_period_end_continuous',
      diff: {
        expectedCheckoutDate: booking.expectedCheckoutDate,
        successorBookingId: checkoutDecision.successorBookingId,
        successorBookingCode: checkoutDecision.successorBookingCode,
      },
    });
    scheduleAdminNotificationSync();
    return {
      ok: true,
      bookingId: booking.id,
      settlementId: null,
      keptResidencyActive: true,
    };
  }

  const [location] = await db
    .select({
      pgId: pgs.id,
      pgName: pgs.name,
      roomId: rooms.id,
      bedId: beds.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      residentName: customers.fullName,
    })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .innerJoin(customers, eq(customers.id, booking.customerId))
    .where(
      and(
        eq(bedReservations.bookingId, booking.id),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['hold', 'active']),
      ),
    )
    .limit(1);

  await cancelFutureRentInvoices(
    booking.id,
    `fixed-stay auto-expiry on ${booking.expectedCheckoutDate}`,
  );
  await cancelElectricityInvoicesForBooking(booking.id);

  await db
    .update(bookings)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(bookings.id, booking.id));

  await db
    .update(customers)
    .set({ residencyStatus: 'vacated', updatedAt: new Date() })
    .where(eq(customers.id, booking.customerId));

  await db
    .update(residentBillingProfiles)
    .set({ autoGenerate: false, updatedAt: new Date() })
    .where(eq(residentBillingProfiles.bookingId, booking.id));

  await completeBookingReservations(booking.id);
  await reconcileBookingOccupancy(booking.id);

  const vacatingRequestId = await ensureSystemVacatingRequest({
    id: booking.id,
    customerId: booking.customerId,
    expectedCheckoutDate: String(booking.expectedCheckoutDate),
    createdAt: booking.createdAt,
    pricingSnapshot: booking.pricingSnapshot as PricingSnapshot | null,
  });

  const settlement = await createCheckoutSettlementFromVacating({ vacatingRequestId });
  const settlementId = settlement.ok ? settlement.settlementId : null;

  if (location) {
    await upsertFixedStayCheckoutActionItem({
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      pgId: location.pgId,
      pgName: location.pgName,
      roomId: location.roomId,
      bedId: location.bedId,
      roomNumber: location.roomNumber,
      bedCode: location.bedCode,
      residentId: booking.customerId,
      residentName: location.residentName,
      checkoutDate: String(booking.expectedCheckoutDate),
      settlementId,
      depositPaise: booking.depositPaise,
    });
  }

  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'booking',
    entityId: booking.id,
    action: 'fixed_stay_auto_expired',
    diff: {
      expectedCheckoutDate: booking.expectedCheckoutDate,
      vacatingRequestId,
      settlementId,
    },
  });

  scheduleAdminNotificationSync();
  await syncActionItemsForCron().catch(() => undefined);

  return { ok: true, bookingId: booking.id, settlementId };
}

export async function processFixedStayAutoExpiryBatch(now?: Date): Promise<{
  scanned: number;
  expired: number;
  errors: string[];
}> {
  const due = await listFixedStaysDueForExpiry(now);
  const errors: string[] = [];
  let expired = 0;

  for (const row of due) {
    const result = await expireFixedStayBooking(row.id);
    if (result.ok) {
      expired += 1;
    } else if (result.kind === 'error' || result.message) {
      errors.push(`${row.bookingCode}: ${result.message ?? result.kind}`);
    }
  }

  return { scanned: due.length, expired, errors };
}
