/**
 * Admin promo coupon CRUD + analytics.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { discountApplications, promoCoupons } from '@/src/db/schema';
import type { PromoCoupon } from '@/src/db/schema/promoCoupons';

export type PromoCouponAdminRow = PromoCoupon & {
  usageCount: number;
  totalDiscountPaise: number;
  remainingUses: number | null;
};

export async function listPromoCouponsAdmin(): Promise<PromoCouponAdminRow[]> {
  const coupons = await db.select().from(promoCoupons).orderBy(desc(promoCoupons.createdAt));

  const rows: PromoCouponAdminRow[] = [];
  for (const coupon of coupons) {
    const [stats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${discountApplications.discountAmountPaise}), 0)::bigint`,
      })
      .from(discountApplications)
      .where(
        and(
          eq(discountApplications.couponCode, coupon.code.toUpperCase()),
          eq(discountApplications.discountType, 'promo_code'),
        ),
      );

    const usageCount = stats?.count ?? 0;
    rows.push({
      ...coupon,
      usageCount,
      totalDiscountPaise: Number(stats?.total ?? 0),
      remainingUses:
        coupon.usageLimit != null ? Math.max(0, coupon.usageLimit - usageCount) : null,
    });
  }
  return rows;
}

export async function createPromoCoupon(input: {
  code: string;
  type: 'percentage' | 'fixed';
  percentageBps?: number;
  fixedAmountPaise?: number;
  validFrom: Date;
  validTill: Date;
  usageLimit?: number | null;
  perUserLimit?: number;
  scope: 'booking_rent' | 'rent_invoice' | 'bed_reserve';
  reason?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false, error: 'Code is required.' };

  const [existing] = await db
    .select({ id: promoCoupons.id })
    .from(promoCoupons)
    .where(sql`upper(${promoCoupons.code}) = ${code}`)
    .limit(1);
  if (existing) return { ok: false, error: 'Code already exists.' };

  const [row] = await db
    .insert(promoCoupons)
    .values({
      code,
      type: input.type,
      percentageBps: input.type === 'percentage' ? input.percentageBps : null,
      fixedAmountPaise: input.type === 'fixed' ? input.fixedAmountPaise : null,
      validFrom: input.validFrom,
      validTill: input.validTill,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit ?? 1,
      scope: input.scope,
      reason: input.reason ?? null,
      active: true,
    })
    .returning({ id: promoCoupons.id });

  return row ? { ok: true, id: row.id } : { ok: false, error: 'Failed to create coupon.' };
}

export async function setPromoCouponActive(
  id: string,
  active: boolean,
): Promise<{ ok: boolean }> {
  await db
    .update(promoCoupons)
    .set({ active, updatedAt: new Date() })
    .where(eq(promoCoupons.id, id));
  return { ok: true };
}

export async function deletePromoCoupon(id: string): Promise<{ ok: boolean }> {
  await db.delete(promoCoupons).where(eq(promoCoupons.id, id));
  return { ok: true };
}

export async function getTopPromoCoupons(limit = 5) {
  const rows = await db.execute<{
    coupon_code: string;
    usage_count: number;
    total_discount_paise: number;
  }>(sql`
    SELECT
      upper(coupon_code) AS coupon_code,
      count(*)::int AS usage_count,
      coalesce(sum(discount_amount_paise), 0)::bigint AS total_discount_paise
    FROM discount_applications
    WHERE discount_type IN ('promo_code', 'date_coupon')
      AND coupon_code IS NOT NULL
    GROUP BY upper(coupon_code)
    ORDER BY total_discount_paise DESC
    LIMIT ${limit}
  `);
  return rows;
}
