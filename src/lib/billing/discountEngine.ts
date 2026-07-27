/**
 * Unified checkout discount engine.
 *
 * Stacking: exactly ONE discount per payment (priority: referral → promo/date coupon).
 * Reservation 50% is priced separately in reservePricing.ts — not stacked here.
 *
 * Coupon usage lifecycle:
 * - Create booking → lifecycle_status = reserved (does NOT count as used)
 * - Admin confirms payment → consumed (counts toward usageLimit / perUserLimit)
 * - Cancel / reject / draft expire → released / expired (reusable)
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { couponRedemptions, discountApplications, promoCoupons } from '@/src/db/schema';
import {
  applyDateCouponToRentSubtotal,
  DATE_COUPON_CODE_RE,
  type DateCouponSnapshot,
} from '@/src/lib/dateCoupon';
import {
  findReferrerByCode,
  validateReferralForBooking,
} from '@/src/services/referrals';

export type DiscountContextKind = 'booking_checkout' | 'rent_invoice';

export type ResolvedDiscount = {
  discountPaise: number;
  discountType: 'referral' | 'date_coupon' | 'promo_code' | null;
  code: string | null;
  label: string | null;
  dateCoupon?: DateCouponSnapshot;
  referrerCustomerId?: string;
  reason?: string;
  /** Admin promo row id when discountType === promo_code. */
  promoCouponId?: string;
  /** Snapshot of percentage bps at apply time (1000 = 10%). */
  percentageBps?: number | null;
};

/** Cap discount to [0, rent]. Rejects negative / NaN / over-rent client tricks. */
export function clampRentDiscountPaise(rentPaise: number, discountPaise: number): number {
  if (!Number.isFinite(rentPaise) || rentPaise <= 0) return 0;
  if (!Number.isFinite(discountPaise) || discountPaise <= 0) return 0;
  return Math.min(Math.floor(rentPaise), Math.floor(discountPaise));
}

function discountFromBps(amountPaise: number, bps: number): number {
  if (amountPaise <= 0 || bps <= 0) return 0;
  const cappedBps = Math.min(Math.max(0, Math.floor(bps)), 10_000);
  return clampRentDiscountPaise(
    amountPaise,
    Math.floor((amountPaise * cappedBps) / 10_000),
  );
}

/** Only confirmed consumptions count toward usageLimit / perUserLimit. */
async function countConsumedPromoApplications(input: {
  couponCode: string;
  customerId?: string;
}): Promise<number> {
  const normalized = input.couponCode.trim().toUpperCase();
  const conditions = [
    eq(discountApplications.couponCode, normalized),
    eq(discountApplications.discountType, 'promo_code'),
    eq(discountApplications.lifecycleStatus, 'consumed'),
  ];
  if (input.customerId) {
    conditions.push(eq(discountApplications.appliedByCustomerId, input.customerId));
  }

  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discountApplications)
    .where(and(...conditions));

  return usage?.count ?? 0;
}

/** Active reserve blocks the same resident from double-holding one code. */
async function customerHasActivePromoReservation(input: {
  couponCode: string;
  customerId: string;
}): Promise<boolean> {
  const normalized = input.couponCode.trim().toUpperCase();
  const now = new Date();
  const [row] = await db
    .select({ id: discountApplications.id })
    .from(discountApplications)
    .where(
      and(
        eq(discountApplications.couponCode, normalized),
        eq(discountApplications.discountType, 'promo_code'),
        eq(discountApplications.lifecycleStatus, 'reserved'),
        eq(discountApplications.appliedByCustomerId, input.customerId),
        or(
          sql`${discountApplications.expiresAt} IS NULL`,
          sql`${discountApplications.expiresAt} > ${now}`,
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function customerUsedDateCoupon(input: {
  customerId: string;
  couponCode: string;
  couponDate: string;
}): Promise<boolean> {
  const [consumed] = await db
    .select({ id: couponRedemptions.id })
    .from(couponRedemptions)
    .where(
      and(
        eq(couponRedemptions.customerId, input.customerId),
        eq(couponRedemptions.couponCode, input.couponCode),
        eq(couponRedemptions.couponDate, input.couponDate),
        eq(couponRedemptions.lifecycleStatus, 'consumed'),
      ),
    )
    .limit(1);
  if (consumed) return true;

  const now = new Date();
  const [reserved] = await db
    .select({ id: couponRedemptions.id })
    .from(couponRedemptions)
    .where(
      and(
        eq(couponRedemptions.customerId, input.customerId),
        eq(couponRedemptions.couponCode, input.couponCode),
        eq(couponRedemptions.couponDate, input.couponDate),
        eq(couponRedemptions.lifecycleStatus, 'reserved'),
        or(
          sql`${couponRedemptions.expiresAt} IS NULL`,
          sql`${couponRedemptions.expiresAt} > ${now}`,
        ),
      ),
    )
    .limit(1);
  return Boolean(reserved);
}

async function resolveAdminPromo(input: {
  code: string;
  amountPaise: number;
  scope: 'booking_rent' | 'rent_invoice';
  customerId?: string;
}): Promise<ResolvedDiscount | { error: string } | null> {
  const normalized = input.code.trim().toUpperCase();
  const now = new Date();
  const [coupon] = await db
    .select()
    .from(promoCoupons)
    .where(
      and(
        sql`upper(${promoCoupons.code}) = ${normalized}`,
        eq(promoCoupons.active, true),
        eq(promoCoupons.scope, input.scope),
        sql`${promoCoupons.validFrom} <= ${now}`,
        sql`${promoCoupons.validTill} >= ${now}`,
      ),
    )
    .limit(1);

  if (!coupon) return null;

  if (coupon.usageLimit != null) {
    const usageCount = await countConsumedPromoApplications({ couponCode: normalized });
    if (usageCount >= coupon.usageLimit) {
      return { error: 'This promo code has reached its usage limit.' };
    }
  }

  if (input.customerId && coupon.perUserLimit > 0) {
    const perUserCount = await countConsumedPromoApplications({
      couponCode: normalized,
      customerId: input.customerId,
    });
    if (perUserCount >= coupon.perUserLimit) {
      return { error: 'You have already used this promo code.' };
    }

    if (input.scope === 'booking_rent') {
      const hasReserve = await customerHasActivePromoReservation({
        couponCode: normalized,
        customerId: input.customerId,
      });
      if (hasReserve) {
        return {
          error:
            'This promo code is already reserved on another open booking. Complete or cancel that booking first.',
        };
      }
    }
  }

  let discountPaise = 0;
  let percentageBps: number | null = null;
  if (coupon.type === 'fixed' && coupon.fixedAmountPaise) {
    discountPaise = clampRentDiscountPaise(input.amountPaise, coupon.fixedAmountPaise);
  } else if (coupon.percentageBps) {
    percentageBps = Math.min(coupon.percentageBps, 10_000);
    discountPaise = discountFromBps(input.amountPaise, percentageBps);
  }

  if (discountPaise <= 0) return null;

  return {
    discountPaise,
    discountType: 'promo_code',
    code: normalized,
    label: coupon.reason ?? `Promo ${normalized}`,
    reason: coupon.reason ?? undefined,
    promoCouponId: coupon.id,
    percentageBps,
  };
}

/** Resolve a single checkout discount (no stacking). */
export async function resolveCheckoutDiscount(input: {
  kind: DiscountContextKind;
  amountPaise: number;
  promoCode?: string | null;
  customerId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  now?: Date;
}): Promise<ResolvedDiscount | { error: string }> {
  const code = input.promoCode?.trim() ?? '';
  if (!code || input.amountPaise <= 0) {
    return {
      discountPaise: 0,
      discountType: null,
      code: null,
      label: null,
    };
  }

  // Priority 1: Referral — booking checkout and rent invoice (same validation rules).
  if (
    input.customerEmail &&
    (input.kind === 'booking_checkout' || input.kind === 'rent_invoice')
  ) {
    const referrer = await findReferrerByCode(code);
    if (referrer) {
      const referral = await validateReferralForBooking({
        referralCode: code,
        refereeEmail: input.customerEmail,
        refereeCustomerId: input.customerId,
        refereePhone: input.customerPhone,
        firstMonthRentPaise: input.amountPaise,
      });
      if (referral.ok) {
        return {
          discountPaise: clampRentDiscountPaise(input.amountPaise, referral.discountPaise),
          discountType: 'referral',
          code: code.toUpperCase(),
          label: 'Referral discount',
          referrerCustomerId: referral.referrerCustomerId,
          percentageBps: 500,
        };
      }
      return { error: referral.reason };
    }
  }

  // Priority 2a: Date coupon (DDMMYY) — booking rent or rent invoice.
  if (DATE_COUPON_CODE_RE.test(code)) {
    if (input.kind === 'rent_invoice' || input.kind === 'booking_checkout') {
      const couponResult = applyDateCouponToRentSubtotal(
        input.amountPaise,
        code,
        input.now,
      );
      if (!couponResult.ok) return { error: 'Invalid or expired promo code' };
      if (couponResult.coupon && input.customerId) {
        const used = await customerUsedDateCoupon({
          customerId: input.customerId,
          couponCode: couponResult.coupon.code,
          couponDate: couponResult.coupon.couponDate,
        });
        if (used) return { error: 'You have already used this promo code.' };
      }
      return {
        discountPaise: clampRentDiscountPaise(input.amountPaise, couponResult.discountPaise),
        discountType: 'date_coupon',
        code: couponResult.coupon?.code ?? code,
        label: 'Daily promo',
        dateCoupon: couponResult.coupon ?? undefined,
        percentageBps: 1000,
      };
    }
  }

  // Priority 2b: Admin promo coupons.
  const adminPromo = await resolveAdminPromo({
    code,
    amountPaise: input.amountPaise,
    scope: input.kind === 'rent_invoice' ? 'rent_invoice' : 'booking_rent',
    customerId: input.customerId ?? undefined,
  });
  if (adminPromo) {
    if ('error' in adminPromo) return { error: adminPromo.error };
    return adminPromo;
  }

  return { error: 'Invalid or expired promo code' };
}

export async function recordDiscountApplication(input: {
  discountType: 'referral' | 'promo_code' | 'date_coupon' | 'reservation';
  originalAmountPaise: number;
  discountAmountPaise: number;
  finalAmountPaise: number;
  appliedByCustomerId?: string | null;
  bookingId?: string | null;
  rentInvoiceId?: string | null;
  paymentId?: string | null;
  couponCode?: string | null;
  referralCode?: string | null;
  reason?: string | null;
  lifecycleStatus?: 'reserved' | 'consumed' | 'released' | 'expired';
  expiresAt?: Date | null;
  promoCouponId?: string | null;
}) {
  const [row] = await db
    .insert(discountApplications)
    .values({
      discountType: input.discountType,
      originalAmountPaise: input.originalAmountPaise,
      discountAmountPaise: input.discountAmountPaise,
      finalAmountPaise: input.finalAmountPaise,
      appliedByCustomerId: input.appliedByCustomerId ?? null,
      bookingId: input.bookingId ?? null,
      rentInvoiceId: input.rentInvoiceId ?? null,
      paymentId: input.paymentId ?? null,
      couponCode: input.couponCode ?? null,
      referralCode: input.referralCode ?? null,
      reason: input.reason ?? null,
      lifecycleStatus: input.lifecycleStatus ?? (input.rentInvoiceId ? 'consumed' : 'reserved'),
      expiresAt: input.expiresAt ?? null,
      consumedAt: input.lifecycleStatus === 'consumed' || input.rentInvoiceId ? new Date() : null,
      promoCouponId: input.promoCouponId ?? null,
    })
    .returning();
  return row ?? null;
}
