/**
 * Unified checkout discount engine.
 *
 * Stacking: exactly ONE discount per payment (priority: referral → promo/date coupon).
 * Reservation 50% is priced separately in reservePricing.ts — not stacked here.
 */
import { and, eq, sql } from 'drizzle-orm';
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
};

function discountFromBps(amountPaise: number, bps: number): number {
  if (amountPaise <= 0 || bps <= 0) return 0;
  return Math.floor((amountPaise * bps) / 10_000);
}

async function customerUsedDateCouponForRent(
  customerId: string,
  couponCode: string,
  couponDate: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: couponRedemptions.id })
    .from(couponRedemptions)
    .where(
      and(
        eq(couponRedemptions.customerId, customerId),
        eq(couponRedemptions.couponCode, couponCode),
        eq(couponRedemptions.couponDate, couponDate),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function resolveAdminPromo(input: {
  code: string;
  amountPaise: number;
  scope: 'booking_rent' | 'rent_invoice';
  customerId?: string;
}): Promise<ResolvedDiscount | null> {
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
    const [usage] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discountApplications)
      .where(
        and(
          eq(discountApplications.couponCode, normalized),
          eq(discountApplications.discountType, 'promo_code'),
        ),
      );
    if ((usage?.count ?? 0) >= coupon.usageLimit) return null;
  }

  if (input.customerId && coupon.perUserLimit > 0) {
    const [perUser] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(discountApplications)
      .where(
        and(
          eq(discountApplications.couponCode, normalized),
          eq(discountApplications.appliedByCustomerId, input.customerId),
        ),
      );
    if ((perUser?.count ?? 0) >= coupon.perUserLimit) return null;
  }

  let discountPaise = 0;
  if (coupon.type === 'fixed' && coupon.fixedAmountPaise) {
    discountPaise = Math.min(input.amountPaise, coupon.fixedAmountPaise);
  } else if (coupon.percentageBps) {
    discountPaise = discountFromBps(input.amountPaise, coupon.percentageBps);
  }

  if (discountPaise <= 0) return null;

  return {
    discountPaise,
    discountType: 'promo_code',
    code: normalized,
    label: coupon.reason ?? `Promo ${normalized}`,
    reason: coupon.reason ?? undefined,
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

  // Priority 1: Referral (booking checkout only).
  if (input.kind === 'booking_checkout' && input.customerEmail) {
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
          discountPaise: referral.discountPaise,
          discountType: 'referral',
          code: code.toUpperCase(),
          label: 'Referral discount',
          referrerCustomerId: referral.referrerCustomerId,
        };
      }
      return { error: referral.reason };
    }
  }

  // Priority 2a: Date coupon (DDMMYY) — booking rent or rent invoice.
  if (DATE_COUPON_CODE_RE.test(code)) {
    if (input.kind === 'rent_invoice' && input.customerId) {
      const couponResult = applyDateCouponToRentSubtotal(
        input.amountPaise,
        code,
        input.now,
      );
      if (!couponResult.ok) return { error: 'Invalid or expired promo code' };
      if (couponResult.coupon) {
        const used = await customerUsedDateCouponForRent(
          input.customerId,
          couponResult.coupon.code,
          couponResult.coupon.couponDate,
        );
        if (used) return { error: 'You have already used this promo code.' };
      }
      return {
        discountPaise: couponResult.discountPaise,
        discountType: 'date_coupon',
        code: couponResult.coupon?.code ?? code,
        label: 'Daily promo',
        dateCoupon: couponResult.coupon ?? undefined,
      };
    }

    if (input.kind === 'booking_checkout') {
      const couponResult = applyDateCouponToRentSubtotal(
        input.amountPaise,
        code,
        input.now,
      );
      if (!couponResult.ok) return { error: 'Invalid or expired promo code' };
      return {
        discountPaise: couponResult.discountPaise,
        discountType: 'date_coupon',
        code: couponResult.coupon?.code ?? code,
        label: 'Daily promo',
        dateCoupon: couponResult.coupon ?? undefined,
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
  if (adminPromo) return adminPromo;

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
}) {
  const [row] = await db
    .insert(discountApplications)
    .values({
      discountType: input.discountType,
      couponCode: input.couponCode ?? null,
      referralCode: input.referralCode ?? null,
      originalAmountPaise: input.originalAmountPaise,
      discountAmountPaise: input.discountAmountPaise,
      finalAmountPaise: input.finalAmountPaise,
      appliedByCustomerId: input.appliedByCustomerId ?? null,
      bookingId: input.bookingId ?? null,
      rentInvoiceId: input.rentInvoiceId ?? null,
      paymentId: input.paymentId ?? null,
      reason: input.reason ?? null,
    })
    .returning();
  return row ?? null;
}
