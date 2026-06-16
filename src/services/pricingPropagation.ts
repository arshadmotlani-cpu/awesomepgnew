/**
 * When bed rent changes, sync deposit requirements and pending rent invoices
 * for active tenants on affected beds.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import { revalidatePricingViews } from '@/src/lib/pricingRevalidate';
import type { AdminSession } from '@/src/lib/auth/session';
import { computeMonthlyDepositPaise } from '@/src/services/pricing';
import { correctDepositCollected, getDepositSummaryForBooking } from '@/src/services/deposits';
import { recalculatePendingRentInvoicesForBooking } from '@/src/services/rentInvoices';
import { loadLatestBedPrice } from '@/src/services/pricing';
import type { PricingSnapshot } from '@/src/db/schema/bookings';

export type DepositAdjustmentResult = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  previousRequiredPaise: number;
  newRequiredPaise: number;
  collectedPaise: number;
  remainingDuePaise: number;
};

export type PricingPropagationReport = {
  bedsUpdated: number;
  rentInvoicesRecalculated: number;
  depositAdjustments: DepositAdjustmentResult[];
};

/**
 * After room/bed pricing save: recalc pending rent invoices and deposit gaps
 * for confirmed monthly/open-ended bookings on those beds.
 */
export async function propagatePricingChangeForBeds(
  session: AdminSession,
  pgId: string,
  bedIds: string[],
  opts?: { notifyResident?: boolean },
): Promise<PricingPropagationReport> {
  if (bedIds.length === 0) {
    return { bedsUpdated: 0, rentInvoicesRecalculated: 0, depositAdjustments: [] };
  }

  const activeBookings = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
      pgSlug: pgs.slug,
      bedId: bedReservations.bedId,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        inArray(bedReservations.bedId, bedIds),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    );

  const depositAdjustments: DepositAdjustmentResult[] = [];
  let rentInvoicesRecalculated = 0;
  const slugs = new Set<string>();

  for (const row of activeBookings) {
    const rate = await loadLatestBedPrice(row.bedId);
    if (!rate) continue;

    const newMonthly = rate.monthlyRatePaise;
    const newRequiredDeposit = computeMonthlyDepositPaise(rate);
    const snapshot = (row.pricingSnapshot ?? {
      perBed: [],
      computedAt: new Date().toISOString(),
    }) as PricingSnapshot;

    if (snapshot.perBed[0]) {
      snapshot.perBed[0].monthlyRatePaise = newMonthly;
      snapshot.perBed[0].lineTotalPaise = newMonthly;
    }

    const rentResult = await recalculatePendingRentInvoicesForBooking({
      bookingId: row.bookingId,
      pricingSnapshot: snapshot,
      adminId: session.adminId,
    });
    rentInvoicesRecalculated += rentResult.updatedCount;

    const summary = await getDepositSummaryForBooking(row.bookingId);
    const collectedPaise = summary?.collectedPaise ?? 0;
    const previousRequired = row.depositPaise;
    const remainingDue = Math.max(0, newRequiredDeposit - collectedPaise);

    if (newRequiredDeposit !== previousRequired) {
      await db
        .update(bookings)
        .set({
          depositPaise: newRequiredDeposit,
          pricingSnapshot: snapshot,
          subtotalPaise: newMonthly,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, row.bookingId));

      if (collectedPaise > 0 && collectedPaise !== newRequiredDeposit) {
        await correctDepositCollected({
          bookingId: row.bookingId,
          customerId: row.customerId,
          targetCollectedPaise: Math.min(collectedPaise, newRequiredDeposit),
          reason: 'Deposit synced after rent pricing change',
          createdByAdminId: session.adminId,
        });
      }

      depositAdjustments.push({
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        previousRequiredPaise: previousRequired,
        newRequiredPaise: newRequiredDeposit,
        collectedPaise,
        remainingDuePaise: remainingDue,
      });

      if (opts?.notifyResident && remainingDue > 0) {
        const { ensureDepositDuePaymentLink } = await import('@/src/services/depositCollection');
        await ensureDepositDuePaymentLink(row.bookingId).catch(() => undefined);
      }
    }

    if (row.pgSlug) slugs.add(row.pgSlug);
  }

  revalidatePricingViews();
  for (const slug of slugs) revalidatePricingViews(slug);

  void pgId;

  return {
    bedsUpdated: bedIds.length,
    rentInvoicesRecalculated,
    depositAdjustments,
  };
}
