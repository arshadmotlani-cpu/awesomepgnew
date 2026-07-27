/**
 * Coupon usage lifecycle SSOT.
 *
 * reserved  — booking draft / payment pending / under review (does NOT count as used)
 * consumed  — booking confirmed after admin payment approval (counts toward limits)
 * released  — cancel / reject / abandon before confirm
 * expired   — reserved past expires_at without confirm
 */
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '@/src/db/client';
import { couponRedemptions, discountApplications } from '@/src/db/schema';

type DbLike = typeof db | PgTransaction<any, any, any>;

export async function consumeCouponReservationsForBooking(
  bookingId: string,
  tx?: DbLike,
): Promise<{ consumed: number }> {
  const run = tx ?? db;
  const now = new Date();
  const apps = await run
    .update(discountApplications)
    .set({
      lifecycleStatus: 'consumed',
      consumedAt: now,
      expiresAt: null,
    })
    .where(
      and(
        eq(discountApplications.bookingId, bookingId),
        inArray(discountApplications.lifecycleStatus, ['reserved']),
      ),
    )
    .returning({ id: discountApplications.id });

  const redemptions = await run
    .update(couponRedemptions)
    .set({
      lifecycleStatus: 'consumed',
      consumedAt: now,
      expiresAt: null,
    })
    .where(
      and(
        eq(couponRedemptions.bookingId, bookingId),
        inArray(couponRedemptions.lifecycleStatus, ['reserved']),
      ),
    )
    .returning({ id: couponRedemptions.id });

  return { consumed: apps.length + redemptions.length };
}

export async function releaseCouponReservationForBooking(
  bookingId: string,
  reason?: string,
  tx?: DbLike,
): Promise<{ released: number }> {
  const run = tx ?? db;
  const now = new Date();
  const apps = await run
    .update(discountApplications)
    .set({
      lifecycleStatus: 'released',
      releasedAt: now,
      expiresAt: null,
    })
    .where(
      and(
        eq(discountApplications.bookingId, bookingId),
        inArray(discountApplications.lifecycleStatus, ['reserved']),
      ),
    )
    .returning({ id: discountApplications.id });

  void reason;

  const redemptions = await run
    .update(couponRedemptions)
    .set({
      lifecycleStatus: 'released',
      releasedAt: now,
      expiresAt: null,
    })
    .where(
      and(
        eq(couponRedemptions.bookingId, bookingId),
        inArray(couponRedemptions.lifecycleStatus, ['reserved']),
      ),
    )
    .returning({ id: couponRedemptions.id });

  return { released: apps.length + redemptions.length };
}

/** Under review: keep reserved but do not auto-expire while admin reviews. */
export async function clearCouponReservationExpiryForBooking(
  bookingId: string,
  tx?: DbLike,
): Promise<void> {
  const run = tx ?? db;
  await run
    .update(discountApplications)
    .set({ expiresAt: null })
    .where(
      and(
        eq(discountApplications.bookingId, bookingId),
        eq(discountApplications.lifecycleStatus, 'reserved'),
      ),
    );
  await run
    .update(couponRedemptions)
    .set({ expiresAt: null })
    .where(
      and(
        eq(couponRedemptions.bookingId, bookingId),
        eq(couponRedemptions.lifecycleStatus, 'reserved'),
      ),
    );
}

export async function expireStaleCouponReservations(
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const apps = await db
    .update(discountApplications)
    .set({
      lifecycleStatus: 'expired',
      releasedAt: now,
    })
    .where(
      and(
        eq(discountApplications.lifecycleStatus, 'reserved'),
        isNotNull(discountApplications.expiresAt),
        lt(discountApplications.expiresAt, now),
      ),
    )
    .returning({ id: discountApplications.id });

  const redemptions = await db
    .update(couponRedemptions)
    .set({
      lifecycleStatus: 'expired',
      releasedAt: now,
    })
    .where(
      and(
        eq(couponRedemptions.lifecycleStatus, 'reserved'),
        isNotNull(couponRedemptions.expiresAt),
        lt(couponRedemptions.expiresAt, now),
      ),
    )
    .returning({ id: couponRedemptions.id });

  return { expired: apps.length + redemptions.length };
}
