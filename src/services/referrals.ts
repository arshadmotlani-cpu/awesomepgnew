/**
 * Referral program — code validation, discount, earnings, fraud protection.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, customers, referralEarnings, referralRedemptions } from '@/src/db/schema';

export const REFERRAL_DISCOUNT_BPS = 500; // 5%

export function referralCodeFromCustomerId(customerId: string): string {
  return customerId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export async function findReferrerByCode(code: string): Promise<{ customerId: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`upper(replace(${customers.id}::text, '-', '')) like ${normalized + '%'}`)
    .limit(5);

  const match = rows.find((r) => referralCodeFromCustomerId(r.id) === normalized);
  return match ? { customerId: match.id } : null;
}

export type ReferralValidationResult =
  | { ok: true; referrerCustomerId: string; discountPaise: number }
  | { ok: false; reason: string };

export async function validateReferralForBooking(input: {
  referralCode: string;
  refereeEmail: string;
  refereeCustomerId?: string | null;
  refereePhone?: string | null;
  firstMonthRentPaise: number;
}): Promise<ReferralValidationResult> {
  const referrer = await findReferrerByCode(input.referralCode);
  if (!referrer) {
    return { ok: false, reason: 'Referral code not found.' };
  }

  if (input.refereeCustomerId && input.refereeCustomerId === referrer.customerId) {
    return { ok: false, reason: 'You cannot use your own referral code.' };
  }

  const existingRedemption = await db.query.referralRedemptions.findFirst({
    where: eq(referralRedemptions.refereeEmail, input.refereeEmail.toLowerCase()),
  });
  if (existingRedemption && existingRedemption.status !== 'voided') {
    return { ok: false, reason: 'This email has already used a referral code.' };
  }

  if (input.refereeCustomerId) {
    const priorBookings = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.customerId, input.refereeCustomerId),
          inArray(bookings.status, ['confirmed', 'completed']),
        ),
      )
      .limit(1);
    if (priorBookings.length > 0) {
      return { ok: false, reason: 'Referral codes are for new residents only.' };
    }
  }

  if (input.refereePhone) {
    const phoneMatch = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phone, input.refereePhone))
      .limit(1);
    if (phoneMatch[0]?.id === referrer.customerId) {
      return { ok: false, reason: 'You cannot use your own referral code.' };
    }
  }

  const discountPaise = Math.floor((input.firstMonthRentPaise * REFERRAL_DISCOUNT_BPS) / 10_000);
  return { ok: true, referrerCustomerId: referrer.customerId, discountPaise };
}

export async function recordReferralRedemption(input: {
  referrerCustomerId: string;
  refereeEmail: string;
  refereeCustomerId?: string;
  bookingId?: string;
  discountPaise: number;
}) {
  const [row] = await db
    .insert(referralRedemptions)
    .values({
      referrerCustomerId: input.referrerCustomerId,
      refereeEmail: input.refereeEmail.toLowerCase(),
      refereeCustomerId: input.refereeCustomerId ?? null,
      bookingId: input.bookingId ?? null,
      discountPaise: input.discountPaise,
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function creditReferralEarningOnBookingPayment(input: {
  bookingId: string;
  rentSubtotalPaise: number;
}) {
  const redemption = await db.query.referralRedemptions.findFirst({
    where: and(
      eq(referralRedemptions.bookingId, input.bookingId),
      eq(referralRedemptions.status, 'pending'),
    ),
  });
  if (!redemption) return null;

  const [booking] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking || booking.status === 'cancelled' || booking.status === 'superseded') {
    return null;
  }

  const earningPaise = Math.floor((input.rentSubtotalPaise * REFERRAL_DISCOUNT_BPS) / 10_000);
  await db
    .update(referralRedemptions)
    .set({ status: 'applied' })
    .where(eq(referralRedemptions.id, redemption.id));

  const [earning] = await db
    .insert(referralEarnings)
    .values({
      referrerCustomerId: redemption.referrerCustomerId,
      redemptionId: redemption.id,
      amountPaise: earningPaise,
      status: 'locked',
    })
    .returning();

  return earning ?? null;
}

/** @deprecated Prefer creditReferralEarningOnBookingPayment at checkout confirm. */
export async function creditReferralEarningOnFirstRentPayment(input: {
  bookingId: string;
  firstMonthRentPaise: number;
}) {
  const redemption = await db.query.referralRedemptions.findFirst({
    where: and(
      eq(referralRedemptions.bookingId, input.bookingId),
      eq(referralRedemptions.status, 'pending'),
    ),
  });
  if (!redemption) return null;

  const earningPaise = Math.floor((input.firstMonthRentPaise * REFERRAL_DISCOUNT_BPS) / 10_000);
  await db
    .update(referralRedemptions)
    .set({ status: 'applied' })
    .where(eq(referralRedemptions.id, redemption.id));

  const [earning] = await db
    .insert(referralEarnings)
    .values({
      referrerCustomerId: redemption.referrerCustomerId,
      redemptionId: redemption.id,
      amountPaise: earningPaise,
      status: 'locked',
    })
    .returning();

  return earning ?? null;
}

export async function getReferralSummaryForCustomer(customerId: string) {
  const code = referralCodeFromCustomerId(customerId);
  try {
    const earnings = await db
      .select()
      .from(referralEarnings)
      .where(eq(referralEarnings.referrerCustomerId, customerId));

    let lockedPaise = 0;
    let availablePaise = 0;
    let withdrawnPaise = 0;
    for (const e of earnings) {
      if (e.status === 'locked') lockedPaise += e.amountPaise;
      else if (e.status === 'available') availablePaise += e.amountPaise;
      else if (e.status === 'withdrawn') withdrawnPaise += e.amountPaise;
    }

    return {
      code,
      lockedPaise,
      availablePaise,
      withdrawnPaise,
      earnings,
    };
  } catch {
    return {
      code,
      lockedPaise: 0,
      availablePaise: 0,
      withdrawnPaise: 0,
      earnings: [],
    };
  }
}

export async function unlockReferralEarningsOnVacate(customerId: string) {
  await db
    .update(referralEarnings)
    .set({ status: 'available', unlockedAt: new Date() })
    .where(
      and(
        eq(referralEarnings.referrerCustomerId, customerId),
        eq(referralEarnings.status, 'locked'),
      ),
    );
}
