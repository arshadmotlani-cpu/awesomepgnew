import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { couponRedemptions } from '@/src/db/schema';
import {
  couponCalendarDate,
  generateDateCouponCode,
  generateYesterdayDateCouponCode,
} from '@/src/lib/dateCoupon';

export type DateCouponAdminSnapshot = {
  todayCode: string;
  yesterdayCode: string;
  todayDate: string;
  usageCountToday: number;
  totalDiscountPaiseToday: number;
  bookingsInfluencedToday: number;
};

export async function getDateCouponAdminSnapshot(
  now: Date = new Date(),
): Promise<DateCouponAdminSnapshot> {
  const todayDate = couponCalendarDate(now);
  const todayCode = generateDateCouponCode(now);
  const yesterdayCode = generateYesterdayDateCouponCode(now);

  const [row] = await db
    .select({
      usageCount: sql<number>`count(*)::int`,
      totalDiscount: sql<number>`coalesce(sum(${couponRedemptions.discountPaise}), 0)::int`,
    })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponDate, todayDate));

  return {
    todayCode,
    yesterdayCode,
    todayDate,
    usageCountToday: row?.usageCount ?? 0,
    totalDiscountPaiseToday: row?.totalDiscount ?? 0,
    bookingsInfluencedToday: row?.usageCount ?? 0,
  };
}

export type DateCouponAnalyticsRow = {
  couponDate: string;
  redemptionCount: number;
  totalDiscountPaise: number;
};

/** Last N days of coupon redemptions for analytics charts. */
export async function listDateCouponAnalytics(days = 14): Promise<DateCouponAnalyticsRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const rows = await db
    .select({
      couponDate: couponRedemptions.couponDate,
      redemptionCount: sql<number>`count(*)::int`,
      totalDiscountPaise: sql<number>`coalesce(sum(${couponRedemptions.discountPaise}), 0)::int`,
    })
    .from(couponRedemptions)
    .where(gte(couponRedemptions.createdAt, since))
    .groupBy(couponRedemptions.couponDate)
    .orderBy(couponRedemptions.couponDate);

  return rows;
}

export async function countCouponRedemptionsBetween(
  fromDate: string,
  toDateExclusive: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(couponRedemptions)
    .where(
      and(
        gte(couponRedemptions.couponDate, fromDate),
        lt(couponRedemptions.couponDate, toDateExclusive),
      ),
    );
  return row?.count ?? 0;
}
