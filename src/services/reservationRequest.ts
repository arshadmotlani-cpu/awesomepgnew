/**
 * Reservation request lifecycle — draft → under review → reserved.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  floors,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { bedBlocksInventory } from '@/src/lib/inventoryBlocking';
import { formatDate, parseDate } from '@/src/lib/dates';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import { draftExpiresAtFromNow, reviewExpiresAtFromNow } from '@/src/lib/reservationLifecycle';

export { draftExpiresAtFromNow };

export function reviewExpiresAtForReservation(): Date {
  return reviewExpiresAtFromNow();
}

function bedIdsFromSnapshot(snapshot: PricingSnapshot | null | undefined): string[] {
  if (!snapshot?.perBed?.length) return [];
  return snapshot.perBed.map((b) => b.bedId).filter(Boolean);
}

/** Load PG id from pricing snapshot bed ids. */
export async function pgIdForBookingDraft(bookingId: string): Promise<string | null> {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { pricingSnapshot: true },
  });
  const bedIds = bedIdsFromSnapshot(booking?.pricingSnapshot as PricingSnapshot | null);
  if (bedIds.length === 0) return null;
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(beds.id, bedIds[0]!))
    .limit(1);
  return row?.pgId ?? null;
}

/**
 * Create under_review reservations when resident submits payment proof.
 * Idempotent when reservations already exist in under_review.
 */
export async function activateReservationRequestForBooking(bookingId: string): Promise<void> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      status: bookings.status,
      durationMode: bookings.durationMode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      billingAnchorDate: bookings.billingAnchorDate,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) throw new Error('Booking not found.');

  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const bedIds = bedIdsFromSnapshot(snapshot);
  if (bedIds.length === 0) throw new Error('No beds on booking draft.');

  if (!booking.billingAnchorDate) {
    throw new Error('Check-in date missing on booking draft.');
  }

  const isOpenEnded =
    booking.durationMode === 'open_ended' || booking.durationMode === 'monthly';
  const startIso = formatDate(parseDate(booking.billingAnchorDate));
  const endIso =
    !isOpenEnded && booking.expectedCheckoutDate
      ? formatDate(parseDate(booking.expectedCheckoutDate))
      : null;

  for (const bedId of bedIds) {
    const blocked = await bedBlocksInventory({
      bedId,
      startDate: startIso,
      endDate: endIso,
    });
    if (blocked) {
      throw new Error('This bed is no longer available for the selected dates.');
    }
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: bedReservations.id, status: bedReservations.status })
      .from(bedReservations)
      .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')));

    if (existing.some((r) => r.status === 'under_review')) {
      await tx
        .update(bookings)
        .set({ status: 'pending_approval', draftExpiresAt: null, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
      return;
    }

    if (existing.some((r) => r.status === 'active')) {
      return;
    }

    const reviewHoldUntil = reviewExpiresAtForReservation();

    if (existing.length > 0) {
      await tx
        .update(bedReservations)
        .set({
          status: 'under_review',
          holdExpiresAt: reviewHoldUntil,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bedReservations.bookingId, bookingId),
            inArray(bedReservations.status, ['hold', 'under_review']),
          ),
        );
    } else {
      for (const bedId of bedIds) {
        const stayRange = isOpenEnded
          ? (sql`daterange(${startIso}::date, NULL, '[)')` as unknown as string)
          : (sql`daterange(${startIso}::date, ${endIso}::date, '[)')` as unknown as string);
        await tx.insert(bedReservations).values({
          bookingId,
          bedId,
          stayRange,
          kind: 'primary',
          status: 'under_review',
          holdExpiresAt: reviewHoldUntil,
        });
      }
    }

    await tx
      .update(bookings)
      .set({
        status: 'pending_approval',
        draftExpiresAt: null,
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
      entity: 'booking',
      entityId: bookingId,
      action: 'reservation_request_submitted',
      diff: { bookingCode: booking.bookingCode, bedIds, moveIn: startIso },
    });
  });

  const { scheduleAvailabilityCacheInvalidation } = await import(
    '@/src/lib/cache/invalidateAvailability'
  );
  scheduleAvailabilityCacheInvalidation({ bookingId });

  scheduleAdminNotificationSync();
}

/** Cancel abandoned server drafts past TTL. */
export async function expireAbandonedReservationDrafts(): Promise<{ expired: number }> {
  const now = new Date();
  const rows = await db
    .update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      cancellationReason: 'Reservation draft expired.',
      updatedAt: now,
    })
    .where(and(eq(bookings.status, 'draft'), sql`${bookings.draftExpiresAt} < ${now}`))
    .returning({ id: bookings.id });

  for (const row of rows) {
    await db.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'booking',
      entityId: row.id,
      action: 'draft_abandoned',
      diff: {},
    });
  }

  return { expired: rows.length };
}
