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
  payments,
  pgPaymentRecords,
  vacatingRequests,
} from '../db/schema';
import { nextBookingCode, utcYear } from '../lib/bookingCode';
import {
  RESERVE_MAX_PERIOD_DAYS,
  RESERVE_MIN_PERIOD_DAYS,
  RESERVE_NOTICE_BUFFER_DAYS,
  reserveBufferDate,
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
import { bedReserveHoldBlocksInventory } from '@/src/lib/reservationLifecycle/constants';
import { draftExpiresAtFromNow, reviewExpiresAtFromNow } from '@/src/lib/reservationLifecycle/ttl';
import { env } from '../lib/env';
import { computeReservePricing } from '../lib/pricing/reservePricing';
import { loadBedPrice, quoteBedPrice, type PricingMode } from './pricing';
import { stayTypeFromPricingMode } from '../lib/stayType';
import { ensureBillingProfileForBooking } from './residentBillingProfiles';

import type { PricingSnapshot } from '../db/schema/bookings';

export type ActiveBedReserve = {
  id: string;
  reserveCode: string;
  bedId: string;
  customerId: string;
  reserveStart: string;
  checkInDate: string;
  bufferDate: string;
  status: 'pending_payment' | 'under_review' | 'active' | 'expired' | 'cancelled' | 'converted';
  paymentProofUrl?: string | null;
};

export { bedReserveHoldBlocksInventory };

function bedIdFromReserveSnapshot(snapshot: PricingSnapshot | null | undefined): string | null {
  return snapshot?.perBed?.[0]?.bedId ?? null;
}

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
  const hold = await getInventoryBlockingReserveForBed(bedId);
  if (hold) {
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

export async function getInventoryBlockingReserveForBed(
  bedId: string,
): Promise<ActiveBedReserve | null> {
  const [row] = await db
    .select({
      id: bedReserveHolds.id,
      reserveCode: bedReserveHolds.reserveCode,
      bedId: bedReserveHolds.bedId,
      customerId: bedReserveHolds.customerId,
      reserveStart: bedReserveHolds.reserveStart,
      checkInDate: bedReserveHolds.checkInDate,
      status: bedReserveHolds.status,
      paymentProofUrl: bedReserveHolds.paymentProofUrl,
    })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.bedId, bedId),
        sql`(
          ${bedReserveHolds.status}::text IN ('under_review', 'active')
          OR (
            ${bedReserveHolds.status}::text = 'pending_payment'
            AND ${bedReserveHolds.paymentProofUrl} IS NOT NULL
            AND trim(${bedReserveHolds.paymentProofUrl}) <> ''
          )
        )`,
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

/** @deprecated Use getInventoryBlockingReserveForBed — kept for legacy unpaid hold resume. */
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
      paymentProofUrl: bedReserveHolds.paymentProofUrl,
    })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.bedId, bedId),
        inArray(bedReserveHolds.status, ['pending_payment', 'under_review', 'active']),
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
        sql`${bedReservations.status}::text IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
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

export async function getCustomerBedReserveDraft(
  customerId: string,
  bedId?: string,
): Promise<{
  id: string;
  bookingCode: string;
  bedId: string;
  reserveStart: string;
  checkInDate: string;
} | null> {
  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      pricingSnapshot: bookings.pricingSnapshot,
      billingAnchorDate: bookings.billingAnchorDate,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      draftExpiresAt: bookings.draftExpiresAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.customerId, customerId),
        eq(bookings.status, 'draft'),
        eq(bookings.durationMode, 'reserve'),
        sql`(${bookings.draftExpiresAt} IS NULL OR ${bookings.draftExpiresAt} > now())`,
      ),
    )
    .orderBy(desc(bookings.createdAt));

  for (const row of rows) {
    const snapBedId = bedIdFromReserveSnapshot(row.pricingSnapshot as PricingSnapshot | null);
    if (!snapBedId) continue;
    if (bedId && snapBedId !== bedId) continue;
    const reserveStart = row.billingAnchorDate
      ? String(row.billingAnchorDate)
      : null;
    const checkInDate = row.expectedCheckoutDate ? String(row.expectedCheckoutDate) : null;
    if (!reserveStart || !checkInDate) continue;
    return {
      id: row.id,
      bookingCode: row.bookingCode,
      bedId: snapBedId,
      reserveStart,
      checkInDate,
    };
  }
  return null;
}

export async function canOfferBedReserve(
  bedId: string,
  options?: { customerId?: string },
): Promise<{
  ok: boolean;
  reason?: string;
  earliestStart?: string;
  existingDraft?: {
    bookingCode: string;
    bedId: string;
    reserveStart: string;
    checkInDate: string;
  };
  resumePayment?: { bookingCode: string };
}> {
  const [bed] = await db
    .select({ status: beds.status, manualOccupied: beds.manualOccupied })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!bed || bed.status !== 'available') {
    if (bed?.status === 'maintenance') {
      return { ok: false, reason: 'This bed is under maintenance.' };
    }
    return { ok: false, reason: 'Bed is not available for reserve.' };
  }

  const blocking = await getInventoryBlockingReserveForBed(bedId);
  if (blocking) {
    if (options?.customerId && blocking.customerId === options.customerId) {
      const [row] = await db
        .select({ bookingCode: bookings.bookingCode })
        .from(bookings)
        .innerJoin(bedReserveHolds, eq(bedReserveHolds.bookingId, bookings.id))
        .where(eq(bedReserveHolds.id, blocking.id))
        .limit(1);
      if (row) {
        return { ok: true, resumePayment: { bookingCode: row.bookingCode } };
      }
    }
    return {
      ok: false,
      reason: 'This bed is reserved and under review.',
    };
  }

  if (options?.customerId) {
    const draft = await getCustomerBedReserveDraft(options.customerId, bedId);
    if (draft) {
      return {
        ok: true,
        earliestStart: draft.reserveStart,
        existingDraft: draft,
      };
    }

    const legacyHold = await getActiveReserveForBed(bedId);
    if (
      legacyHold &&
      legacyHold.customerId === options.customerId &&
      legacyHold.status === 'pending_payment' &&
      !bedReserveHoldBlocksInventory(legacyHold)
    ) {
      const [legacyBooking] = await db
        .select({ bookingCode: bookings.bookingCode })
        .from(bookings)
        .innerJoin(bedReserveHolds, eq(bedReserveHolds.bookingId, bookings.id))
        .where(eq(bedReserveHolds.id, legacyHold.id))
        .limit(1);
      if (legacyBooking) {
        return {
          ok: true,
          earliestStart: legacyHold.reserveStart,
          resumePayment: { bookingCode: legacyBooking.bookingCode },
        };
      }
    }
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

export async function quoteBedReserve(
  input: QuoteBedReserveInput & { customerId?: string },
) {
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

  const offer = await canOfferBedReserve(input.bedId, { customerId: input.customerId });
  if (!offer.ok) throw new Error(offer.reason ?? 'Reserve not available.');
  if (offer.earliestStart && reserveStart < offer.earliestStart) {
    throw new Error(`Reserve can start from ${offer.earliestStart} on this bed.`);
  }

  const rate = await loadBedPrice(input.bedId, reserveStart);
  if (!rate) {
    throw new Error('No rent price configured for this bed on the reserve start date.');
  }

  const pricing = computeReservePricing({
    monthlyRentPaise: rate.monthlyRatePaise,
    reserveStart,
    reservedDays: periodDays,
  });

  return {
    bedId: input.bedId,
    reserveStart,
    checkInDate,
    bufferDate: reserveBufferDate(checkInDate),
    periodDays,
    monthlyRatePaise: rate.monthlyRatePaise,
    daysInMonth: pricing.daysInMonth,
    dailyRentPaise: pricing.dailyRentPaise,
    fullReservationPaise: pricing.fullReservationPaise,
    feePaise: pricing.feePaise,
    savingsPaise: pricing.savingsPaise,
    offerPercent: pricing.offerPercent,
    nonRefundable: true,
    existingDraft: offer.existingDraft,
    resumePayment: offer.resumePayment,
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
    customerId: input.customerId,
  });

  const existingDraft = await getCustomerBedReserveDraft(input.customerId, input.bedId);
  if (existingDraft) {
    await db
      .update(bookings)
      .set({
        expectedCheckoutDate: quote.checkInDate,
        billingAnchorDate: quote.reserveStart,
        subtotalPaise: quote.feePaise,
        totalPaise: quote.feePaise,
        pricingSnapshot: buildReservePricingSnapshot(input.bedId, quote, existingDraft.bookingCode),
        draftExpiresAt: draftExpiresAtFromNow(),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, existingDraft.id));

    return {
      ok: true as const,
      bookingId: existingDraft.id,
      bookingCode: existingDraft.bookingCode,
      reserveId: null,
      reserveCode: null,
      ...quote,
      draftExpiresAt: draftExpiresAtFromNow(),
    };
  }

  const year = utcYear();
  const yearPrefix = `APG-${year}-`;
  const draftExpiresAt = draftExpiresAtFromNow();

  for (let attempt = 0; attempt < 5; attempt++) {
    const bookingSeq = (await countBookingsInYear(yearPrefix)) + attempt;
    const bookingCode = nextBookingCode(year, bookingSeq);

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
            status: 'draft',
            durationMode: 'reserve',
            expectedCheckoutDate: quote.checkInDate,
            billingAnchorDate: quote.reserveStart,
            subtotalPaise: quote.feePaise,
            totalPaise: quote.feePaise,
            depositPaise: 0,
            pricingSnapshot: buildReservePricingSnapshot(input.bedId, quote, bookingCode),
            notes: `Bed reserve draft ${bookingCode}`,
            createdVia: 'customer',
            draftExpiresAt,
          })
          .returning({ id: bookings.id });

        return {
          bookingId: booking!.id,
          bookingCode,
        };
      });

      return {
        ok: true as const,
        ...result,
        reserveId: null,
        reserveCode: null,
        ...quote,
        draftExpiresAt,
      };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505' && attempt < 4) continue;
      throw err;
    }
  }

  throw new Error('Could not allocate booking code.');
}

function buildReservePricingSnapshot(
  bedId: string,
  quote: Awaited<ReturnType<typeof quoteBedReserve>>,
  codeLabel: string,
): PricingSnapshot {
  return {
    perBed: [
      {
        bedId,
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
    notes: `Bed reserve ${codeLabel}: ${quote.offerPercent}% of monthly-prorated rent (${quote.periodDays} days) until ${quote.checkInDate}. Non-refundable.`,
  };
}

/**
 * Create under-review bed reserve hold when customer submits payment proof.
 * Draft bookings have no hold row until this runs — inventory blocks only here.
 */
export async function activateBedReserveRequestForBooking(
  bookingId: string,
  proof: { paymentScreenshotUrl: string; transactionRef?: string | null },
): Promise<void> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      durationMode: bookings.durationMode,
      totalPaise: bookings.totalPaise,
      billingAnchorDate: bookings.billingAnchorDate,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking || booking.durationMode !== 'reserve') {
    throw new Error('Reserve booking not found.');
  }

  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const bedId = bedIdFromReserveSnapshot(snapshot);
  const reserveStart = booking.billingAnchorDate ? String(booking.billingAnchorDate) : null;
  const checkInDate = booking.expectedCheckoutDate ? String(booking.expectedCheckoutDate) : null;
  if (!bedId || !reserveStart || !checkInDate) {
    throw new Error('Reserve draft is missing bed or dates.');
  }

  const monthlyRatePaise = snapshot?.perBed?.[0]?.monthlyRatePaise ?? booking.totalPaise * 2;
  const reviewExpiresAt = reviewExpiresAtFromNow();

  const { bedBlocksInventory } = await import('@/src/lib/inventoryBlocking');
  const blocked = await bedBlocksInventory({
    bedId,
    startDate: reserveStart,
    endDate: checkInDate,
  });
  if (blocked) {
    throw new Error('This bed is no longer available for the selected dates.');
  }

  const [existingHold] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.bookingId, bookingId))
    .limit(1);
  if (existingHold?.status === 'active') return;

  await db.transaction(async (tx) => {
    let holdId = existingHold?.id;
    let reserveCode = existingHold?.reserveCode;

    if (!existingHold) {
      const year = utcYear();
      for (let attempt = 0; attempt < 5; attempt++) {
        const reserveSeq = (await countReservesInYear(year)) + attempt;
        reserveCode = nextReserveCode(year, reserveSeq);
        try {
          const [inserted] = await tx
            .insert(bedReserveHolds)
            .values({
              reserveCode,
              customerId: booking.customerId,
              bedId,
              bookingId: booking.id,
              reserveStart,
              checkInDate,
              status: 'under_review',
              amountPaise: booking.totalPaise,
              monthlyRateSnapshotPaise: monthlyRatePaise,
              paymentProofUrl: proof.paymentScreenshotUrl.trim(),
              transactionRef: proof.transactionRef?.trim() || null,
              holdExpiresAt: reviewExpiresAt,
            })
            .returning({ id: bedReserveHolds.id });
          holdId = inserted!.id;
          break;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === '23505' && attempt < 4) continue;
          throw err;
        }
      }
      if (!holdId) throw new Error('Could not allocate reserve code.');
    } else {
      await tx
        .update(bedReserveHolds)
        .set({
          status: 'under_review',
          paymentProofUrl: proof.paymentScreenshotUrl.trim(),
          transactionRef: proof.transactionRef?.trim() || null,
          holdExpiresAt: reviewExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(bedReserveHolds.id, existingHold.id));
      holdId = existingHold.id;
    }

    await tx
      .update(bookings)
      .set({
        status: 'pending_approval',
        draftExpiresAt: null,
        notes: `Reserve hold ${reserveCode}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, bookingId),
          inArray(bookings.status, ['draft', 'pending_payment', 'pending_approval']),
        ),
      );

    await tx.insert(auditLog).values({
      actorType: 'customer',
      actorId: booking.customerId,
      entity: 'bed_reserve',
      entityId: holdId!,
      action: 'reservation_request_submitted',
      diff: { reserveCode, bookingId, bookingCode: booking.bookingCode },
    });
  });
}

function rateDailyFromMonthly(monthly: number): number {
  return Math.ceil(monthly / 30);
}

export async function activateBedReserveAfterPayment(bookingId: string) {
  const result = await ensureBedReserveHoldActiveForBooking(bookingId);
  if (!result.holdId) return null;
  const [hold] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.id, result.holdId))
    .limit(1);
  return hold ?? null;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Idempotent — flips under_review/pending_payment → active after admin approval.
 * Repairs missing holds when a bed_reserve payment already succeeded (production heal).
 */
export async function ensureBedReserveHoldActiveForBooking(
  bookingId: string,
  tx?: DbTx,
): Promise<{ ok: boolean; holdId: string | null; repaired: boolean }> {
  const run = async (runner: DbTx) => {
    const [booking] = await runner
      .select({
        id: bookings.id,
        bookingCode: bookings.bookingCode,
        customerId: bookings.customerId,
        durationMode: bookings.durationMode,
        totalPaise: bookings.totalPaise,
        billingAnchorDate: bookings.billingAnchorDate,
        expectedCheckoutDate: bookings.expectedCheckoutDate,
        pricingSnapshot: bookings.pricingSnapshot,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking || booking.durationMode !== 'reserve') {
      return { ok: false, holdId: null, repaired: false };
    }

    const [alreadyActive] = await runner
      .select({ id: bedReserveHolds.id })
      .from(bedReserveHolds)
      .where(
        and(eq(bedReserveHolds.bookingId, bookingId), eq(bedReserveHolds.status, 'active')),
      )
      .limit(1);
    if (alreadyActive) {
      return { ok: true, holdId: alreadyActive.id, repaired: false };
    }

    const activated = await runner
      .update(bedReserveHolds)
      .set({ status: 'active', holdExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(bedReserveHolds.bookingId, bookingId),
          inArray(bedReserveHolds.status, ['under_review', 'pending_payment']),
        ),
      )
      .returning({ id: bedReserveHolds.id });
    if (activated.length > 0) {
      return { ok: true, holdId: activated[0].id, repaired: false };
    }

    const [payment] = await runner
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.bookingId, bookingId),
          eq(payments.purpose, 'bed_reserve'),
          eq(payments.status, 'succeeded'),
        ),
      )
      .limit(1);
    if (!payment) return { ok: false, holdId: null, repaired: false };

    const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
    const bedId = bedIdFromReserveSnapshot(snapshot);
    const reserveStart = booking.billingAnchorDate ? String(booking.billingAnchorDate) : null;
    const checkInDate = booking.expectedCheckoutDate ? String(booking.expectedCheckoutDate) : null;
    if (!bedId || !reserveStart || !checkInDate) {
      return { ok: false, holdId: null, repaired: false };
    }

    const [proof] = await runner
      .select({
        paymentScreenshotUrl: pgPaymentRecords.paymentScreenshotUrl,
        transactionRef: pgPaymentRecords.transactionRef,
      })
      .from(pgPaymentRecords)
      .where(
        and(eq(pgPaymentRecords.bookingId, bookingId), eq(pgPaymentRecords.status, 'approved')),
      )
      .orderBy(desc(pgPaymentRecords.reviewedAt))
      .limit(1);

    const monthlyRatePaise = snapshot?.perBed?.[0]?.monthlyRatePaise ?? booking.totalPaise * 2;
    const year = utcYear();
    let holdId: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const reserveSeq = (await countReservesInYear(year)) + attempt;
      const reserveCode = nextReserveCode(year, reserveSeq);
      try {
        const [inserted] = await runner
          .insert(bedReserveHolds)
          .values({
            reserveCode,
            customerId: booking.customerId,
            bedId,
            bookingId: booking.id,
            reserveStart,
            checkInDate,
            status: 'active',
            amountPaise: booking.totalPaise,
            monthlyRateSnapshotPaise: monthlyRatePaise,
            paymentProofUrl: proof?.paymentScreenshotUrl?.trim() || null,
            transactionRef: proof?.transactionRef?.trim() || null,
            holdExpiresAt: null,
          })
          .returning({ id: bedReserveHolds.id });
        holdId = inserted!.id;
        break;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === '23505' && attempt < 4) continue;
        throw err;
      }
    }
    if (!holdId) return { ok: false, holdId: null, repaired: false };

    await runner
      .update(bookings)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(
        and(
          eq(bookings.id, bookingId),
          inArray(bookings.status, ['draft', 'pending_payment', 'confirmed']),
        ),
      );

    await runner.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'bed_reserve',
      entityId: holdId,
      action: 'reserve_hold_repaired',
      diff: { bookingId, bookingCode: booking.bookingCode },
    });

    return { ok: true, holdId, repaired: true };
  };

  if (tx) return run(tx);
  return db.transaction(run);
}

export async function markBedReserveConverted(reserveId: string) {
  await db
    .update(bedReserveHolds)
    .set({ status: 'converted', updatedAt: new Date() })
    .where(and(eq(bedReserveHolds.id, reserveId), eq(bedReserveHolds.status, 'active')));
}

export async function cancelBedReserveDraftByCustomer(bookingId: string, customerId: string) {
  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status, durationMode: bookings.durationMode })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerId)))
    .limit(1);
  if (!booking || booking.durationMode !== 'reserve' || booking.status !== 'draft') {
    throw new Error('Reservation draft not found.');
  }

  await db
    .update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: 'Reservation draft cancelled by customer.',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));
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
  if (!['pending_payment', 'under_review', 'active'].includes(hold.status)) {
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

export async function convertBedReserveToMonthlyStay(reserveId: string) {
  const [hold] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.id, reserveId))
    .limit(1);
  if (!hold || hold.status !== 'active') {
    return { ok: false as const, reason: 'Reserve not active.' };
  }

  const checkInIso = String(hold.checkInDate);
  const quote = await quoteBedPrice({
    bedId: hold.bedId,
    startDate: checkInIso,
    endDate: null,
    durationMode: 'open_ended',
    includeDeposit: true,
  });

  const reserveFeePaid = hold.amountPaise;
  const monthlyDuePaise = quote.subtotalPaise + quote.depositPaise - reserveFeePaid;

  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({
        durationMode: 'open_ended',
        stayType: stayTypeFromPricingMode('open_ended'),
        status: monthlyDuePaise > 0 ? 'pending_payment' : 'confirmed',
        expectedCheckoutDate: null,
        billingAnchorDate: checkInIso,
        subtotalPaise: quote.subtotalPaise,
        depositPaise: quote.depositPaise,
        totalPaise: Math.max(0, monthlyDuePaise),
        pricingSnapshot: {
          perBed: [
            {
              bedId: hold.bedId,
              dailyRatePaise: quote.rate.dailyRatePaise,
              weeklyRatePaise: quote.rate.weeklyRatePaise,
              monthlyRatePaise: quote.rate.monthlyRatePaise,
              securityDepositPaise: quote.depositPaise,
              durationMode: 'open_ended',
              units: quote.units,
              lineTotalPaise: quote.subtotalPaise,
            },
          ],
          computedAt: new Date().toISOString(),
          notes: `Converted from reserve ${hold.reserveCode} on ${checkInIso}. Reserve fee ₹${(reserveFeePaid / 100).toFixed(0)} applied.`,
          stayType: stayTypeFromPricingMode('open_ended'),
        },
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, hold.bookingId));

    await tx
      .insert(bedReservations)
      .values({
        bookingId: hold.bookingId,
        bedId: hold.bedId,
        stayRange: sql`daterange(${checkInIso}::date, NULL, '[)')` as unknown as string,
        kind: 'primary',
        status: monthlyDuePaise > 0 ? 'hold' : 'active',
        holdExpiresAt: monthlyDuePaise > 0 ? new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60_000) : null,
      });

    await tx
      .update(bedReserveHolds)
      .set({ status: 'converted', updatedAt: new Date() })
      .where(eq(bedReserveHolds.id, reserveId));

    await tx.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'bed_reserve',
      entityId: hold.id,
      action: 'converted_to_monthly',
      diff: {
        reserveCode: hold.reserveCode,
        checkInDate: checkInIso,
        monthlyDuePaise,
      },
    });
  });

  if (monthlyDuePaise <= 0) {
    await ensureBillingProfileForBooking(hold.bookingId);
  }

  return { ok: true as const, bookingId: hold.bookingId, monthlyDuePaise };
}

export async function processDueBedReserveConversions(asOfDate?: string) {
  const today = asOfDate ?? todayString();
  const due = await db
    .select({ id: bedReserveHolds.id })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.status, 'active'),
        sql`${bedReserveHolds.checkInDate} <= ${today}::date`,
      ),
    );
  return { scanned: due.length, converted: 0, errors: [] as string[] };
}

export async function expireStaleBedReserves() {
  const today = todayString();
  const conversions = await processDueBedReserveConversions(today);

  const expiredUnderReview = await db
    .select({ id: bedReserveHolds.id, bookingId: bedReserveHolds.bookingId })
    .from(bedReserveHolds)
    .where(
      and(
        sql`${bedReserveHolds.status}::text IN ('under_review', 'pending_payment')`,
        sql`${bedReserveHolds.holdExpiresAt} IS NOT NULL`,
        sql`${bedReserveHolds.holdExpiresAt} <= now()`,
      ),
    );

  for (const row of expiredUnderReview) {
    await db.transaction(async (tx) => {
      await tx
        .update(bedReserveHolds)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(bedReserveHolds.id, row.id));
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Bed reserve request expired before admin review.',
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, row.bookingId));
    });
  }

  const expiredActive = await db
    .select({ id: bedReserveHolds.id, bookingId: bedReserveHolds.bookingId })
    .from(bedReserveHolds)
    .where(
      and(
        eq(bedReserveHolds.status, 'active'),
        sql`${bedReserveHolds.checkInDate} < ${today}::date`,
      ),
    );

  for (const row of expiredActive) {
    await db.transaction(async (tx) => {
      await tx
        .update(bedReserveHolds)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(bedReserveHolds.id, row.id));
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Bed reservation expired before booking completion.',
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, row.bookingId));
    });
  }

  return {
    converted: conversions.converted,
    conversionErrors: conversions.errors,
    cancelledPending: expiredUnderReview.length + expiredActive.length,
  };
}

export async function reserveBlocksLongStay(
  bedId: string,
  startDate: DateLike,
  endDate: DateLike | null,
  durationMode: PricingMode | 'open_ended',
): Promise<boolean> {
  if (durationMode === 'fixed_stay' || durationMode === 'daily' || durationMode === 'weekly') {
    return false;
  }

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
