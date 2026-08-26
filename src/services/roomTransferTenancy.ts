/**
 * Authoritative bed assignment for room change — shared with admin tenancy update.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  floors,
  rentInvoices,
  rooms,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { firstOfMonth } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import { isBedAvailable } from '@/src/services/availability';
import { assertBookingExitOperationsAllowed } from '@/src/lib/exit/exitBrainGuards';
import { assertBookingOperationalGates } from '@/src/lib/occupancyEligibility';
import { siblingBedIdsInRoom } from '@/src/services/tenantAssignmentInternals';
import { loadBedPrice } from '@/src/services/pricing';
import { recalculatePendingRentInvoicesForBooking } from '@/src/services/rentInvoices';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';

function pgUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === 'object' && current && 'code' in current) {
      if ((current as { code?: string }).code === '23505') return true;
    }
    current = typeof current === 'object' && current ? (current as { cause?: unknown }).cause : null;
  }
  return false;
}

export function isPgUniqueViolation(err: unknown): boolean {
  return pgUniqueViolation(err);
}

export async function applyResidentBedTransfer(input: {
  bookingId: string;
  toBedId: string;
  transferDate: string;
  actorType: 'admin' | 'customer' | 'system';
  actorId: string;
  skipExitGuard?: boolean;
}): Promise<{ ok: true; fromBedId: string; pgId: string } | { ok: false; message: string }> {
  if (!input.skipExitGuard) {
    const exitGuard = await assertBookingExitOperationsAllowed({
      bookingId: input.bookingId,
      action: 'room_transfer',
    });
    if (!exitGuard.ok) return { ok: false, message: exitGuard.reason };
  }

  const gates = await assertBookingOperationalGates(input.bookingId);
  if (!gates.ok) return { ok: false, message: gates.reason };

  const available = await isBedAvailable({
    bedId: input.toBedId,
    startDate: input.transferDate,
    endDate: null,
  });
  if (!available) {
    return { ok: false, message: 'Destination bed is not available for the transfer date.' };
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      pricingSnapshot: bookings.pricingSnapshot,
      blocksRoomAvailability: bookings.blocksRoomAvailability,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking || booking.status !== 'confirmed') {
    return { ok: false, message: 'Booking is not an active tenancy.' };
  }

  const [fromCtx] = await db
    .select({
      bedId: beds.id,
      pgId: floors.pgId,
    })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(bedReservations.bookingId, input.bookingId),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    )
    .limit(1);
  if (!fromCtx) return { ok: false, message: 'No active bed assignment found.' };

  const snapshot = (booking.pricingSnapshot ?? {
    perBed: [],
    computedAt: new Date().toISOString(),
  }) as PricingSnapshot;
  const newPrice = await loadBedPrice(input.toBedId, input.transferDate);
  if (!newPrice) return { ok: false, message: 'Could not load destination bed pricing.' };

  const blocksWholeRoom = booking.blocksRoomAvailability;
  const reservationBedIds = blocksWholeRoom
    ? [input.toBedId, ...(await siblingBedIdsInRoom(input.toBedId))]
    : [input.toBedId];

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE bed_reservations
        SET
          status = 'completed',
          stay_range = daterange(lower(stay_range), ${input.transferDate}::date, '[)'),
          updated_at = now()
        WHERE booking_id = ${input.bookingId}::uuid
          AND status = 'active'
      `);

      for (const bedId of reservationBedIds) {
        await tx.insert(bedReservations).values({
          bookingId: input.bookingId,
          bedId,
          stayRange: sql`daterange(${input.transferDate}::date, NULL, '[)')` as unknown as string,
          kind: 'primary',
          status: 'active',
        });
      }

      if (snapshot.perBed[0]) {
        snapshot.perBed[0].bedId = input.toBedId;
        snapshot.perBed[0].monthlyRatePaise = newPrice.monthlyRatePaise;
        snapshot.perBed[0].lineTotalPaise =
          newPrice.monthlyRatePaise * Math.max(1, snapshot.perBed[0].units ?? 1);
      }
      const subtotalPaise = snapshot.perBed.reduce(
        (acc, bed) => acc + (bed.lineTotalPaise ?? 0),
        0,
      );

      await tx
        .update(bookings)
        .set({
          pricingSnapshot: snapshot,
          subtotalPaise,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.bookingId));

      await tx.insert(auditLog).values({
        actorType: input.actorType,
        actorId: input.actorId,
        entity: 'booking',
        entityId: input.bookingId,
        action: 'room_change_tenancy',
        diff: {
          fromBedId: fromCtx.bedId,
          toBedId: input.toBedId,
          transferDate: input.transferDate,
        },
      });
    });
  } catch (err) {
    if (pgUniqueViolation(err)) {
      return { ok: false, message: 'That bed was just taken by another resident.' };
    }
    throw err;
  }

  const transferMonth = firstOfMonth(input.transferDate);
  await db
    .update(rentInvoices)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: `Replaced by room-change invoices on ${input.transferDate}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, transferMonth),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    );

  await recalculatePendingRentInvoicesForBooking({
    bookingId: input.bookingId,
    pricingSnapshot: snapshot,
    adminId: input.actorId,
  });

  await reconcileBookingOccupancy(input.bookingId);
  return { ok: true, fromBedId: fromCtx.bedId, pgId: fromCtx.pgId };
}
