/**
 * Continuous Residency Engine — SSOT for when checkout may begin.
 *
 * Checkout is triggered only when a resident has NO confirmed successor booking
 * within the continuity window (gap <= 1 day, same PG).
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  floors,
  pgs,
  residentResidencies,
  residencyBookingLinks,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { diffDays, formatDate } from '@/src/lib/dates';
import { archiveCheckoutSettlement } from '@/src/services/checkoutSettlement';

/** Max calendar days between prior checkout and next check-in to count as continuous. */
export const CONTINUITY_MAX_GAP_DAYS = 1;

export function isWithinContinuityWindow(checkoutDate: string, nextCheckIn: string): boolean {
  const gapDays = diffDays(checkoutDate, nextCheckIn);
  return gapDays >= 0 && gapDays <= CONTINUITY_MAX_GAP_DAYS;
}

export type BookingStayWindow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  pgId: string;
  status: string;
  checkIn: string;
  checkOut: string | null;
  bedId: string | null;
};

export type SuccessorBooking = BookingStayWindow & {
  gapDays: number;
};

export type ResidencyCheckoutDecision =
  | { action: 'KEEP_RESIDENCY_ACTIVE'; successorBookingId: string; successorBookingCode: string }
  | { action: 'BEGIN_CHECKOUT' };

async function bookingStayWindow(bookingId: string): Promise<BookingStayWindow | null> {
  const [row] = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    pg_id: string;
    status: string;
    check_in: string | null;
    check_out: string | null;
    bed_id: string | null;
    expected_checkout: string | null;
  }>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code,
      b.customer_id::text AS customer_id,
      p.id::text AS pg_id,
      b.status,
      lower(br.stay_range)::date::text AS check_in,
      upper(br.stay_range)::date::text AS check_out,
      br.bed_id::text AS bed_id,
      b.expected_checkout_date::text AS expected_checkout
    FROM bookings b
    LEFT JOIN bed_reservations br
      ON br.booking_id = b.id AND br.kind = 'primary'
    LEFT JOIN beds bd ON bd.id = br.bed_id
    LEFT JOIN rooms r ON r.id = bd.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE b.id = ${bookingId}::uuid
    ORDER BY br.created_at DESC NULLS LAST
    LIMIT 1
  `);

  if (!row?.booking_id || !row.pg_id) return null;

  const checkOut =
    row.check_out ??
    row.expected_checkout ??
    null;

  return {
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    customerId: row.customer_id,
    pgId: row.pg_id,
    status: row.status,
    checkIn: row.check_in ?? row.expected_checkout ?? formatDate(new Date()),
    checkOut,
    bedId: row.bed_id,
  };
}

function checkoutDateForWindow(window: BookingStayWindow): string {
  if (window.checkOut) return window.checkOut;
  throw new Error(`Booking ${window.bookingCode} has no checkout date`);
}

/**
 * Find a confirmed successor booking continuing residency at the same PG.
 */
export async function findSuccessorConfirmedBooking(args: {
  customerId: string;
  endingBookingId: string;
  checkoutDate: string;
}): Promise<SuccessorBooking | null> {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    pg_id: string;
    status: string;
    check_in: string;
    check_out: string | null;
    bed_id: string | null;
  }>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code,
      b.customer_id::text AS customer_id,
      p.id::text AS pg_id,
      b.status,
      lower(br.stay_range)::date::text AS check_in,
      upper(br.stay_range)::date::text AS check_out,
      br.bed_id::text AS bed_id
    FROM bookings b
    INNER JOIN bed_reservations br
      ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${args.customerId}::uuid
      AND b.id != ${args.endingBookingId}::uuid
      AND b.status = 'confirmed'
      AND br.status IN ('hold', 'active')
    ORDER BY lower(br.stay_range) ASC
  `);

  const endingPg = await db.execute<{ pg_id: string }>(sql`
    SELECT p.id::text AS pg_id
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.id = ${args.endingBookingId}::uuid
    LIMIT 1
  `);
  const pgId = endingPg[0]?.pg_id;
  if (!pgId) return null;

  for (const row of rows) {
    if (row.pg_id !== pgId) continue;
    const gapDays = diffDays(args.checkoutDate, row.check_in);
    if (isWithinContinuityWindow(args.checkoutDate, row.check_in)) {
      return {
        bookingId: row.booking_id,
        bookingCode: row.booking_code,
        customerId: row.customer_id,
        pgId: row.pg_id,
        status: row.status,
        checkIn: row.check_in,
        checkOut: row.check_out,
        bedId: row.bed_id,
        gapDays,
      };
    }
  }
  return null;
}

export async function hasFutureConfirmedBooking(args: {
  customerId: string;
  endingBookingId: string;
  checkoutDate: string;
}): Promise<boolean> {
  const successor = await findSuccessorConfirmedBooking(args);
  return successor !== null;
}

export async function evaluateResidencyCheckoutOnBookingEnd(
  bookingId: string,
): Promise<ResidencyCheckoutDecision> {
  const window = await bookingStayWindow(bookingId);
  if (!window?.checkOut) {
    return { action: 'BEGIN_CHECKOUT' };
  }

  const checkoutDate = checkoutDateForWindow(window);
  const successor = await findSuccessorConfirmedBooking({
    customerId: window.customerId,
    endingBookingId: bookingId,
    checkoutDate,
  });

  if (successor) {
    return {
      action: 'KEEP_RESIDENCY_ACTIVE',
      successorBookingId: successor.bookingId,
      successorBookingCode: successor.bookingCode,
    };
  }
  return { action: 'BEGIN_CHECKOUT' };
}

async function nextLinkSequence(residencyId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${residencyBookingLinks.sequenceNo}), 0)` })
    .from(residencyBookingLinks)
    .where(eq(residencyBookingLinks.residencyId, residencyId));
  return Number(row?.max ?? 0) + 1;
}

export async function getOpenResidencyForCustomer(customerId: string) {
  const [row] = await db
    .select()
    .from(residentResidencies)
    .where(
      and(
        eq(residentResidencies.customerId, customerId),
        inArray(residentResidencies.lifecycle, ['onboarding', 'active', 'vacating', 'checkout']),
      ),
    )
    .orderBy(desc(residentResidencies.updatedAt))
    .limit(1);
  return row ?? null;
}

async function linkBookingToResidency(residencyId: string, bookingId: string) {
  const [existing] = await db
    .select({ id: residencyBookingLinks.id })
    .from(residencyBookingLinks)
    .where(eq(residencyBookingLinks.bookingId, bookingId))
    .limit(1);
  if (existing) return;

  const seq = await nextLinkSequence(residencyId);
  await db.insert(residencyBookingLinks).values({
    residencyId,
    bookingId,
    sequenceNo: seq,
  });
}

/**
 * Called when a booking becomes confirmed — merge into continuous residency.
 */
export async function ensureContinuousResidencyOnBookingConfirmed(
  bookingId: string,
): Promise<{ residencyId: string; merged: boolean }> {
  const window = await bookingStayWindow(bookingId);
  if (!window) {
    throw new Error(`Cannot resolve stay window for booking ${bookingId}`);
  }

  let residency = await getOpenResidencyForCustomer(window.customerId);

  const [priorCompleted] = await db.execute<{
    booking_id: string;
    check_out: string;
    pg_id: string;
  }>(sql`
    SELECT
      b.id::text AS booking_id,
      coalesce(upper(br.stay_range)::date::text, b.expected_checkout_date::text) AS check_out,
      p.id::text AS pg_id
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${window.customerId}::uuid
      AND b.id != ${bookingId}::uuid
      AND b.status IN ('confirmed', 'completed')
      AND p.id = ${window.pgId}::uuid
    ORDER BY coalesce(upper(br.stay_range), b.expected_checkout_date::date) DESC
    LIMIT 1
  `);

  let merged = false;
  if (priorCompleted?.check_out) {
    const gap = diffDays(priorCompleted.check_out, window.checkIn);
    if (isWithinContinuityWindow(priorCompleted.check_out, window.checkIn)) {
      merged = true;
    }
  }

  if (!residency) {
    const [created] = await db
      .insert(residentResidencies)
      .values({
        customerId: window.customerId,
        pgId: window.pgId,
        lifecycle: 'active',
        startedAt: window.checkIn,
        expectedMoveOut: window.checkOut,
        currentBookingId: bookingId,
        currentBedId: window.bedId,
        depositBookingId: merged && priorCompleted ? priorCompleted.booking_id : bookingId,
        notes: merged ? 'Continuous residency — merged successor booking' : null,
      })
      .returning({ id: residentResidencies.id });
    await linkBookingToResidency(created.id, bookingId);
    if (merged && priorCompleted) {
      await linkBookingToResidency(created.id, priorCompleted.booking_id);
      await suppressFalseCheckoutArtifactsForBooking(priorCompleted.booking_id);
    }
    await db.insert(auditLog).values({
      actorType: 'system',
      entity: 'resident_residency',
      entityId: created.id,
      action: merged ? 'booking_merged_continuous' : 'booking_linked',
      diff: { bookingId, bookingCode: window.bookingCode, merged },
    });
    return { residencyId: created.id, merged };
  }

  await db
    .update(residentResidencies)
    .set({
      lifecycle: 'active',
      currentBookingId: bookingId,
      currentBedId: window.bedId,
      expectedMoveOut: window.checkOut,
      updatedAt: new Date(),
    })
    .where(eq(residentResidencies.id, residency.id));
  await linkBookingToResidency(residency.id, bookingId);
  if (merged && priorCompleted) {
    await linkBookingToResidency(residency.id, priorCompleted.booking_id);
    await suppressFalseCheckoutArtifactsForBooking(priorCompleted.booking_id);
  }

  await db
    .update(customers)
    .set({ residencyStatus: 'active', updatedAt: new Date() })
    .where(eq(customers.id, window.customerId));

  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'resident_residency',
    entityId: residency.id,
    action: merged ? 'booking_merged_continuous' : 'booking_linked',
    diff: { bookingId, bookingCode: window.bookingCode, merged },
  });

  return { residencyId: residency.id, merged };
}

/**
 * Complete a booking period without starting checkout (continuous extension).
 */
export async function completeBookingPeriodWithoutCheckout(bookingId: string): Promise<void> {
  const window = await bookingStayWindow(bookingId);
  if (!window) return;

  const decision = await evaluateResidencyCheckoutOnBookingEnd(bookingId);
  if (decision.action !== 'KEEP_RESIDENCY_ACTIVE') return;

  const { cancelFutureRentInvoices } = await import('@/src/services/rentInvoices');
  const { cancelElectricityInvoicesForBooking } = await import('@/src/services/electricityBilling');
  const { completeBookingReservations } = await import('@/src/services/vacating');
  const { reconcileBookingOccupancy } = await import('@/src/lib/occupancySync');

  if (window.status === 'confirmed') {
    await cancelFutureRentInvoices(bookingId, `booking period ended — continuous residency`);
    await cancelElectricityInvoicesForBooking(bookingId);
    await db
      .update(bookings)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));
  }

  await completeBookingReservations(bookingId);
  await reconcileBookingOccupancy(bookingId);

  const successor = await bookingStayWindow(decision.successorBookingId);
  const residency = await getOpenResidencyForCustomer(window.customerId);

  if (residency) {
    await db
      .update(residentResidencies)
      .set({
        lifecycle: 'active',
        currentBookingId: decision.successorBookingId,
        currentBedId: successor?.bedId ?? residency.currentBedId,
        expectedMoveOut: successor?.checkOut ?? residency.expectedMoveOut,
        updatedAt: new Date(),
      })
      .where(eq(residentResidencies.id, residency.id));
    await linkBookingToResidency(residency.id, bookingId);
    await linkBookingToResidency(residency.id, decision.successorBookingId);
  } else {
    await ensureContinuousResidencyOnBookingConfirmed(decision.successorBookingId);
  }

  await db
    .update(customers)
    .set({ residencyStatus: 'active', updatedAt: new Date() })
    .where(eq(customers.id, window.customerId));

  await suppressFalseCheckoutArtifactsForBooking(bookingId);

  await db.insert(auditLog).values({
    actorType: 'system',
    entity: 'booking',
    entityId: bookingId,
    action: 'booking_period_completed_continuous',
    diff: {
      successorBookingId: decision.successorBookingId,
      successorBookingCode: decision.successorBookingCode,
    },
  });
}

/**
 * Archive vacating + checkout settlements wrongly created for continuous stays.
 */
export async function suppressFalseCheckoutArtifactsForBooking(
  bookingId: string,
  adminId?: string,
): Promise<{ archivedSettlements: string[]; suppressedVacatings: string[] }> {
  const archivedSettlements: string[] = [];
  const suppressedVacatings: string[] = [];

  const vacatings = await db
    .select({ id: vacatingRequests.id })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.bookingId, bookingId));

  for (const vr of vacatings) {
    await db
      .update(vacatingRequests)
      .set({
        checkoutSettlementSuppressed: true,
        deductionPaise: 0,
        noticeCompliant: true,
        updatedAt: new Date(),
      })
      .where(eq(vacatingRequests.id, vr.id));
    suppressedVacatings.push(vr.id);

    const settlements = await db
      .select({ id: checkoutSettlements.id, status: checkoutSettlements.status })
      .from(checkoutSettlements)
      .where(eq(checkoutSettlements.vacatingRequestId, vr.id));

    for (const cs of settlements) {
      if (!['archived', 'completed', 'refund_paid'].includes(cs.status)) {
        if (adminId) {
          await archiveCheckoutSettlement({ settlementId: cs.id, adminId });
        } else {
          await db
            .update(checkoutSettlements)
            .set({ status: 'archived', updatedAt: new Date() })
            .where(eq(checkoutSettlements.id, cs.id));
        }
        archivedSettlements.push(cs.id);
      }
    }
  }

  return { archivedSettlements, suppressedVacatings };
}

/**
 * Scan production for false checkouts: ended booking with confirmed successor at same PG.
 */
export async function cleanupContinuousStayFalseCheckouts(adminId?: string): Promise<{
  scanned: number;
  suppressed: Array<{ bookingCode: string; successorBookingCode: string }>;
}> {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_id: string;
    check_out: string;
  }>(sql`
    SELECT DISTINCT
      b.id::text AS booking_id,
      b.booking_code,
      b.customer_id::text AS customer_id,
      coalesce(upper(br.stay_range)::date::text, b.expected_checkout_date::text) AS check_out
    FROM vacating_requests vr
    JOIN bookings b ON b.id = vr.booking_id
    LEFT JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    WHERE vr.checkout_settlement_suppressed = false
      AND vr.status IN ('pending', 'approved')
  `);

  const suppressed: Array<{ bookingCode: string; successorBookingCode: string }> = [];

  for (const row of rows) {
    if (!row.check_out) continue;
    const decision = await evaluateResidencyCheckoutOnBookingEnd(row.booking_id);
    if (decision.action !== 'KEEP_RESIDENCY_ACTIVE') continue;

    suppressed.push({
      bookingCode: row.booking_code,
      successorBookingCode: decision.successorBookingCode,
    });

    await suppressFalseCheckoutArtifactsForBooking(row.booking_id, adminId);
    await completeBookingPeriodWithoutCheckout(row.booking_id).catch(() => undefined);
  }

  return { scanned: rows.length, suppressed };
}

export type ResidencyAdminView = {
  residencyId: string;
  lifecycle: string;
  startedAt: string;
  expectedMoveOut: string | null;
  currentBookingCode: string | null;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  depositBookingCode: string | null;
  bookingCodes: string[];
};

export async function getResidencyAdminView(customerId: string): Promise<ResidencyAdminView | null> {
  const residency = await getOpenResidencyForCustomer(customerId);
  if (!residency) return null;

  const links = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(residencyBookingLinks)
    .innerJoin(bookings, eq(bookings.id, residencyBookingLinks.bookingId))
    .where(eq(residencyBookingLinks.residencyId, residency.id))
    .orderBy(residencyBookingLinks.sequenceNo);

  let pgName: string | null = null;
  let roomNumber: string | null = null;
  let bedCode: string | null = null;
  let currentBookingCode: string | null = null;

  if (residency.currentBookingId) {
    const [loc] = await db
      .select({
        pgName: pgs.name,
        roomNumber: rooms.roomNumber,
        bedCode: beds.bedCode,
        bookingCode: bookings.bookingCode,
      })
      .from(bookings)
      .leftJoin(bedReservations, and(
        eq(bedReservations.bookingId, bookings.id),
        eq(bedReservations.kind, 'primary'),
      ))
      .leftJoin(beds, eq(beds.id, bedReservations.bedId))
      .leftJoin(rooms, eq(rooms.id, beds.roomId))
      .leftJoin(floors, eq(floors.id, rooms.floorId))
      .leftJoin(pgs, eq(pgs.id, floors.pgId))
      .where(eq(bookings.id, residency.currentBookingId))
      .limit(1);
    if (loc) {
      pgName = loc.pgName;
      roomNumber = loc.roomNumber;
      bedCode = loc.bedCode;
      currentBookingCode = loc.bookingCode;
    }
  }

  let depositBookingCode: string | null = null;
  if (residency.depositBookingId) {
    const [dep] = await db
      .select({ bookingCode: bookings.bookingCode })
      .from(bookings)
      .where(eq(bookings.id, residency.depositBookingId))
      .limit(1);
    depositBookingCode = dep?.bookingCode ?? null;
  }

  return {
    residencyId: residency.id,
    lifecycle: residency.lifecycle,
    startedAt: String(residency.startedAt),
    expectedMoveOut: residency.expectedMoveOut ? String(residency.expectedMoveOut) : null,
    currentBookingCode,
    pgName,
    roomNumber,
    bedCode,
    depositBookingCode,
    bookingCodes: links.map((l) => l.bookingCode),
  };
}
