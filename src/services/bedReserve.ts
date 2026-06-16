import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { countBookingsInYear } from '../db/queries/customer';
import {
  auditLog,
  bedReservations,
  bedReserveHolds,
  beds,
  bookings,
  customers,
  vacatingRequests,
} from '../db/schema';
import { nextBookingCode, utcYear } from '../lib/bookingCode';
import {
  RESERVE_MAX_PERIOD_DAYS,
  RESERVE_MIN_PERIOD_DAYS,
  RESERVE_NOTICE_BUFFER_DAYS,
  reserveBufferDate,
  reserveFeePaise,
  reserveShortStayEndExclusive,
} from '../lib/bedReservePolicy';
import {
  addDays,
  diffDays,
  formatDate,
  isBefore,
  parseDate,
  todayString,
  type DateLike,
} from '../lib/dates';
import { nextReserveCode } from '../lib/reserveCode';
import { BLOCKING_RESERVATION_STATUS_SQL } from '../lib/reservationBlocking';
import { env } from '../lib/env';
import { quoteBedPrice, type PricingMode } from './pricing';

export type ActiveBedReserve = {
  id: string;
  reserveCode: string;
  bedId: string;
  customerId: string;
  reserveStart: string;
  checkInDate: string;
  bufferDate: string;
  status: 'pending_payment' | 'active' | 'expired' | 'cancelled' | 'converted';
};

export type EffectiveBedReserveWindow = {
  source: 'hold' | 'manual';
  reserveStart: string;
  checkInDate: string;
  bufferDate: string;
};

async function getManualReserveWindow(bedId: string): Promise<EffectiveBedReserveWindow | null> {
  const today = todayString();
  const [row] = await db
    .select({
      reserveStart: beds.manualReservedStart,
      checkInDate: beds.manualReservedCheckIn,
    })
    .from(beds)
    .where(
      and(
        eq(beds.id, bedId),
        sql`${beds.manualReservedCheckIn} IS NOT NULL`,
        sql`${beds.manualReservedCheckIn} >= ${today}::date`,
      ),
    )
    .limit(1);
  if (!row?.checkInDate || !row.reserveStart) return null;
  const checkIn = String(row.checkInDate);
  return {
    source: 'manual',
    reserveStart: String(row.reserveStart),
    checkInDate: checkIn,
    bufferDate: reserveBufferDate(checkIn),
  };
}

export async function getEffectiveReserveForBed(
  bedId: string,
): Promise<EffectiveBedReserveWindow | null> {
  const hold = await getActiveReserveForBed(bedId);
  if (hold?.status === 'active') {
    return {
      source: 'hold',
      reserveStart: hold.reserveStart,
      checkInDate: hold.checkInDate,
      bufferDate: hold.bufferDate,
    };
  }
  return getManualReserveWindow(bedId);
}

async function countReservesInYear(year: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bedReserveHolds)
    .where(sql`extract(year from ${bedReserveHolds.createdAt}) = ${year}`);
  return row?.count ?? 0;
}

export async function getActiveReserveForBed(bedId: string): Promise<ActiveBedReserve | null> {
  const [row] = await db
    .select({
      id: bedReserveHolds.id,
      reserveCode: bedReserveHolds.reserveCode,
      bedId: bedReserveHolds.bedId,
      customerId: bedReserveHolds.customerId,
      reserveStart: bedReserveHolds.reserveStart,
      checkInDate: bedReserveHolds.checkInDate,
      status: bedReserveHolds.status,
    })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.bedId, bedId),
        inArray(bedReserveHolds.status, ['pending_payment', 'active']),
      ),
    )
    .orderBy(desc(bedReserveHolds.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    reserveStart: String(row.reserveStart),
    checkInDate: String(row.checkInDate),
    bufferDate: reserveBufferDate(String(row.checkInDate)),
    status: row.status,
  };
}

async function bedHasFuturePreBook(bedId: string, fromDate: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        eq(bookings.status, 'confirmed'),
        sql`lower(${bedReservations.stayRange}) > ${fromDate}::date`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function earliestReserveStartForBed(bedId: string): Promise<string | null> {
  const today = todayString();
  const [vacating] = await db
    .select({ vacatingDate: vacatingRequests.vacatingDate })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(
      vacatingRequests,
      and(
        eq(vacatingRequests.bookingId, bookings.id),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    )
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        eq(bedReservations.status, 'active'),
        sql`${today}::date <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (vacating?.vacatingDate) {
    const opens = addDays(parseDate(String(vacating.vacatingDate)), RESERVE_NOTICE_BUFFER_DAYS);
    return formatDate(opens);
  }
  return today;
}

export async function canOfferBedReserve(bedId: string): Promise<{
  ok: boolean;
  reason?: string;
  earliestStart?: string;
}> {
  const [bed] = await db
    .select({ status: beds.status, manualOccupied: beds.manualOccupied })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!bed || bed.status !== 'available') {
    return { ok: false, reason: 'Bed is not available for reserve.' };
  }

  const existing = await getActiveReserveForBed(bedId);
  if (existing) {
    return { ok: false, reason: 'This bed already has an active reserve.' };
  }

  const manual = await getManualReserveWindow(bedId);
  if (manual) {
    return { ok: false, reason: 'This bed is marked reserved by admin.' };
  }

  const today = todayString();
  if (await bedHasFuturePreBook(bedId, today)) {
    return { ok: false, reason: 'This bed is already pre-booked by someone else.' };
  }

  const earliestStart = await earliestReserveStartForBed(bedId);
  return { ok: true, earliestStart: earliestStart ?? today };
}

export type QuoteBedReserveInput = {
  bedId: string;
  reserveStart: DateLike;
  checkInDate: DateLike;
};

export async function quoteBedReserve(input: QuoteBedReserveInput) {
  const reserveStart = formatDate(parseDate(input.reserveStart));
  const checkInDate = formatDate(parseDate(input.checkInDate));
  const periodDays = diffDays(parseDate(reserveStart), parseDate(checkInDate));

  if (!isBefore(parseDate(reserveStart), parseDate(checkInDate))) {
    throw new Error('Check-in date must be after reserve start.');
  }
  if (periodDays < RESERVE_MIN_PERIOD_DAYS) {
    throw new Error(`Reserve period must be at least ${RESERVE_MIN_PERIOD_DAYS} days.`);
  }
  if (periodDays > RESERVE_MAX_PERIOD_DAYS) {
    throw new Error(`Reserve period cannot exceed ${RESERVE_MAX_PERIOD_DAYS} days.`);
  }

  const offer = await canOfferBedReserve(input.bedId);
  if (!offer.ok) throw new Error(offer.reason ?? 'Reserve not available.');
  if (offer.earliestStart && reserveStart < offer.earliestStart) {
    throw new Error(`Reserve can start from ${offer.earliestStart} on this bed.`);
  }

  const rate = await quoteBedPrice({
    bedId: input.bedId,
    startDate: reserveStart,
    endDate: checkInDate,
    durationMode: 'monthly',
    includeDeposit: false,
  });

  const feePaise = reserveFeePaise(rate.rate.monthlyRatePaise);

  return {
    bedId: input.bedId,
    reserveStart,
    checkInDate,
    bufferDate: reserveBufferDate(checkInDate),
    periodDays,
    monthlyRatePaise: rate.rate.monthlyRatePaise,
    feePaise,
    nonRefundable: true,
  };
}

export type CreateBedReserveInput = {
  bedId: string;
  customerId: string;
  reserveStart: DateLike;
  checkInDate: DateLike;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
  };
};

export async function createBedReserve(input: CreateBedReserveInput) {
  const quote = await quoteBedReserve({
    bedId: input.bedId,
    reserveStart: input.reserveStart,
    checkInDate: input.checkInDate,
  });

  const year = utcYear();
  const yearPrefix = `APG-${year}-`;
  const holdMinutes = env.BOOKING_HOLD_MINUTES;
  const holdExpiresAt = new Date(Date.now() + holdMinutes * 60_000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const bookingSeq = (await countBookingsInYear(yearPrefix)) + attempt;
    const reserveSeq = (await countReservesInYear(year)) + attempt;
    const bookingCode = nextBookingCode(year, bookingSeq);
    const reserveCode = nextReserveCode(year, reserveSeq);

    try {
      const result = await db.transaction(async (tx) => {
        await tx
          .update(customers)
          .set({
            fullName: input.customer.fullName.trim(),
            email: input.customer.email.trim().toLowerCase(),
            phone: input.customer.phone.trim(),
            gender: input.customer.gender,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, input.customerId));

        const [booking] = await tx
          .insert(bookings)
          .values({
            bookingCode,
            customerId: input.customerId,
            status: 'pending_payment',
            durationMode: 'reserve',
            expectedCheckoutDate: quote.checkInDate,
            subtotalPaise: quote.feePaise,
            totalPaise: quote.feePaise,
            depositPaise: 0,
            pricingSnapshot: {
              perBed: [
                {
                  bedId: input.bedId,
                  dailyRatePaise: rateDailyFromMonthly(quote.monthlyRatePaise),
                  weeklyRatePaise: 0,
                  monthlyRatePaise: quote.monthlyRatePaise,
                  securityDepositPaise: 0,
                  durationMode: 'monthly',
                  units: 1,
                  lineTotalPaise: quote.feePaise,
                },
              ],
              computedAt: new Date().toISOString(),
              notes: `Bed reserve ${reserveCode}: 50% rent hold until ${quote.checkInDate}. Non-refundable.`,
            },
            notes: `Reserve hold ${reserveCode}`,
            createdVia: 'customer',
          })
          .returning({ id: bookings.id });

        const [hold] = await tx
          .insert(bedReserveHolds)
          .values({
            reserveCode,
            customerId: input.customerId,
            bedId: input.bedId,
            bookingId: booking!.id,
            reserveStart: quote.reserveStart,
            checkInDate: quote.checkInDate,
            status: 'pending_payment',
            amountPaise: quote.feePaise,
            monthlyRateSnapshotPaise: quote.monthlyRatePaise,
            holdExpiresAt,
          })
          .returning({
            id: bedReserveHolds.id,
            reserveCode: bedReserveHolds.reserveCode,
          });

        return {
          bookingId: booking!.id,
          bookingCode,
          reserveId: hold!.id,
          reserveCode: hold!.reserveCode,
        };
      });

      return { ok: true as const, ...result, ...quote, holdExpiresAt };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505' && attempt < 4) continue;
      throw err;
    }
  }

  throw new Error('Could not allocate reserve code.');
}

function rateDailyFromMonthly(monthly: number): number {
  return Math.ceil(monthly / 30);
}

export async function activateBedReserveAfterPayment(bookingId: string) {
  const [hold] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.bookingId, bookingId))
    .limit(1);
  if (!hold) return null;
  if (hold.status === 'active') return hold;

  await db
    .update(bedReserveHolds)
    .set({ status: 'active', holdExpiresAt: null, updatedAt: new Date() })
    .where(eq(bedReserveHolds.id, hold.id));

  await db.insert(auditLog).values({
    actorType: 'system',
    actorId: null,
    entity: 'bed_reserve',
    entityId: hold.id,
    action: 'activated',
    diff: { reserveCode: hold.reserveCode, checkInDate: hold.checkInDate },
  });

  return hold;
}

export async function markBedReserveConverted(reserveId: string) {
  await db
    .update(bedReserveHolds)
    .set({ status: 'converted', updatedAt: new Date() })
    .where(and(eq(bedReserveHolds.id, reserveId), eq(bedReserveHolds.status, 'active')));
}

export async function cancelBedReserveByCustomer(reserveId: string, customerId: string) {
  const [hold] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.id, reserveId))
    .limit(1);
  if (!hold || hold.customerId !== customerId) {
    throw new Error('Reserve not found.');
  }
  if (!['pending_payment', 'active'].includes(hold.status)) {
    throw new Error('This reserve cannot be cancelled.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(bedReserveHolds)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(bedReserveHolds.id, reserveId));
    await tx
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Reserve cancelled by customer (non-refundable fee retained).',
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, hold.bookingId));
  });
}

export async function extendBedReserve(
  reserveId: string,
  customerId: string,
  newCheckInDate: DateLike,
) {
  const [hold] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.id, reserveId))
    .limit(1);
  if (!hold || hold.customerId !== customerId) throw new Error('Reserve not found.');
  if (hold.status !== 'active') throw new Error('Only active reserves can be extended.');

  const checkIn = formatDate(parseDate(newCheckInDate));
  const reserveStart = String(hold.reserveStart);
  const periodDays = diffDays(parseDate(reserveStart), parseDate(checkIn));
  if (periodDays < RESERVE_MIN_PERIOD_DAYS) {
    throw new Error(`Check-in must be at least ${RESERVE_MIN_PERIOD_DAYS} days after reserve start.`);
  }
  if (periodDays > RESERVE_MAX_PERIOD_DAYS) {
    throw new Error(`Reserve cannot exceed ${RESERVE_MAX_PERIOD_DAYS} days.`);
  }
  if (!isBefore(parseDate(String(hold.checkInDate)), parseDate(checkIn))) {
    throw new Error('New check-in must be later than the current date.');
  }

  await db
    .update(bedReserveHolds)
    .set({ checkInDate: checkIn, updatedAt: new Date() })
    .where(eq(bedReserveHolds.id, reserveId));

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: checkIn, updatedAt: new Date() })
    .where(eq(bookings.id, hold.bookingId));
}

export async function expireStaleBedReserves() {
  const today = todayString();
  const rows = await db
    .select({ id: bedReserveHolds.id })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.status, 'active'),
        sql`${bedReserveHolds.checkInDate} < ${today}::date`,
      ),
    );

  for (const row of rows) {
    await db
      .update(bedReserveHolds)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(bedReserveHolds.id, row.id));
  }

  const expiredHolds = await db
    .select({ id: bedReserveHolds.id, bookingId: bedReserveHolds.bookingId })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.status, 'pending_payment'),
        sql`${bedReserveHolds.holdExpiresAt} IS NOT NULL`,
        sql`${bedReserveHolds.holdExpiresAt} <= now()`,
      ),
    );

  for (const row of expiredHolds) {
    await db.transaction(async (tx) => {
      await tx
        .update(bedReserveHolds)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(bedReserveHolds.id, row.id));
      await tx
        .update(bookings)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(bookings.id, row.bookingId));
    });
  }

  return { expired: rows.length, cancelledPending: expiredHolds.length };
}

export async function reserveBlocksLongStay(
  bedId: string,
  startDate: DateLike,
  endDate: DateLike | null,
  durationMode: PricingMode | 'open_ended',
): Promise<boolean> {
  if (durationMode === 'daily' || durationMode === 'weekly') return false;

  const reserve = await getEffectiveReserveForBed(bedId);
  if (!reserve) return false;

  const start = formatDate(parseDate(startDate));
  const end = endDate ? formatDate(parseDate(endDate)) : reserve.checkInDate;

  return start < reserve.checkInDate && end > reserve.reserveStart;
}

export async function validateShortStayDuringReserve(
  bedId: string,
  startDate: DateLike,
  endDate: DateLike,
): Promise<string | null> {
  const reserve = await getEffectiveReserveForBed(bedId);
  if (!reserve) return null;

  const start = formatDate(parseDate(startDate));
  const end = formatDate(parseDate(endDate));
  const cap = reserveShortStayEndExclusive(reserve.checkInDate);

  if (start < reserve.reserveStart) {
    return `Stay cannot start before the reserve window (${reserve.reserveStart}).`;
  }
  if (end > cap) {
    return `During a reserve, short stays must end before ${reserve.bufferDate} (cleaning day before check-in).`;
  }
  return null;
}

export async function listCustomerBedReserves(customerId: string) {
  return db
    .select({
      id: bedReserveHolds.id,
      reserveCode: bedReserveHolds.reserveCode,
      bookingCode: bookings.bookingCode,
      bedId: bedReserveHolds.bedId,
      reserveStart: bedReserveHolds.reserveStart,
      checkInDate: bedReserveHolds.checkInDate,
      status: bedReserveHolds.status,
      amountPaise: bedReserveHolds.amountPaise,
    })
    .from(bedReserveHolds)
    .innerJoin(bookings, eq(bookings.id, bedReserveHolds.bookingId))
    .where(eq(bedReserveHolds.customerId, customerId))
    .orderBy(desc(bedReserveHolds.createdAt));
}
