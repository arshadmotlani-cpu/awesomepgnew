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
  roomChangeRequests,
  roomTransferBedHolds,
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
import {
  recalculatePendingRentInvoicesForBooking,
  reconcileRentInvoicesAfterRoomTransfer,
} from '@/src/services/rentInvoices';
import { resolvePostTransferMonthlyRentPaise } from '@/src/lib/billing/postTransferRentPricing';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import { appendRoomChangeEvent } from '@/src/services/roomChangeEvents';
import {
  assertRoomChangeTransition,
  type RoomChangeWorkflowState,
} from '@/src/lib/roomTransfer/stateMachine';

function pgUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === 'object' && current && 'code' in current) {
      if (['23505', '23P01'].includes((current as { code?: string }).code ?? '')) return true;
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
  roomChangeRequestId?: string;
  settledAt?: Date;
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
  }, { skipRoomTransferHoldCheck: Boolean(input.roomChangeRequestId) });
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
  const ongoingMonthlyRent =
    (await resolvePostTransferMonthlyRentPaise(input.toBedId, input.transferDate)) ??
    (await loadBedPrice(input.toBedId, input.transferDate))?.monthlyRatePaise;
  if (ongoingMonthlyRent == null) {
    return { ok: false, message: 'Could not load destination bed pricing.' };
  }

  const blocksWholeRoom = booking.blocksRoomAvailability;
  const reservationBedIds = blocksWholeRoom
    ? [input.toBedId, ...(await siblingBedIdsInRoom(input.toBedId))]
    : [input.toBedId];

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`,
      );
      await tx.execute(
        sql`SELECT id FROM beds WHERE id IN (${fromCtx.bedId}::uuid, ${input.toBedId}::uuid) ORDER BY id FOR UPDATE`,
      );
      if (input.roomChangeRequestId) {
        const [request] = await tx
          .select({
            bookingId: roomChangeRequests.bookingId,
            toBedId: roomChangeRequests.toBedId,
            workflowState: roomChangeRequests.workflowState,
          })
          .from(roomChangeRequests)
          .where(eq(roomChangeRequests.id, input.roomChangeRequestId))
          .for('update')
          .limit(1);
        if (
          !request ||
          request.bookingId !== input.bookingId ||
          request.toBedId !== input.toBedId ||
          !['PAYMENT_PENDING', 'READY_TO_TRANSFER', 'TRANSFERRING'].includes(
            request.workflowState,
          )
        ) {
          throw new Error('Room-change request is no longer eligible for transfer.');
        }
        let workflow = request.workflowState as RoomChangeWorkflowState;
        if (workflow === 'PAYMENT_PENDING') {
          assertRoomChangeTransition('PAYMENT_PENDING', 'READY_TO_TRANSFER');
          await tx
            .update(roomChangeRequests)
            .set({
              workflowState: 'READY_TO_TRANSFER',
              stateVersion: sql`${roomChangeRequests.stateVersion} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(roomChangeRequests.id, input.roomChangeRequestId));
          workflow = 'READY_TO_TRANSFER';
        }
        if (workflow !== 'TRANSFERRING') {
          assertRoomChangeTransition(workflow, 'TRANSFERRING');
        }
        await tx
          .update(roomChangeRequests)
          .set({
            workflowState: 'TRANSFERRING',
            stateVersion: sql`${roomChangeRequests.stateVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(roomChangeRequests.id, input.roomChangeRequestId));
        await tx.insert(auditLog).values({
          actorType: input.actorType,
          actorId: input.actorId,
          entity: 'room_change_request',
          entityId: input.roomChangeRequestId,
          action: 'transfer_started',
          diff: { toBedId: input.toBedId, transferDate: input.transferDate },
        });
        const [ownedHold] = await tx
          .select({ id: roomTransferBedHolds.id })
          .from(roomTransferBedHolds)
          .where(
            and(
              eq(roomTransferBedHolds.roomChangeRequestId, input.roomChangeRequestId),
              eq(roomTransferBedHolds.bedId, input.toBedId),
              eq(roomTransferBedHolds.status, 'active'),
            ),
          )
          .for('update')
          .limit(1);
        if (!ownedHold) throw new Error('Room-change target hold is missing.');
      }

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
        snapshot.perBed[0].monthlyRatePaise = ongoingMonthlyRent;
        snapshot.perBed[0].lineTotalPaise =
          ongoingMonthlyRent * Math.max(1, snapshot.perBed[0].units ?? 1);
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

      if (input.roomChangeRequestId) {
        const completedAt = new Date();
        await tx
          .update(roomTransferBedHolds)
          .set({
            status: 'released',
            consumedAt: completedAt,
            releasedAt: completedAt,
            releaseReason: 'transfer_completed',
            updatedAt: completedAt,
          })
          .where(eq(roomTransferBedHolds.roomChangeRequestId, input.roomChangeRequestId));
        assertRoomChangeTransition('TRANSFERRING', 'COMPLETED');
        await tx
          .update(roomChangeRequests)
          .set({
            status: 'completed',
            workflowState: 'COMPLETED',
            completedAt,
            settledAt: input.settledAt ?? completedAt,
            stateVersion: sql`${roomChangeRequests.stateVersion} + 1`,
            updatedAt: completedAt,
          })
          .where(eq(roomChangeRequests.id, input.roomChangeRequestId));
        await tx.insert(auditLog).values({
          actorType: 'system',
          actorId: null,
          entity: 'room_change_request',
          entityId: input.roomChangeRequestId,
          action: 'transfer_completed',
          diff: {
            fromBedId: fromCtx.bedId,
            toBedId: input.toBedId,
            transferDate: input.transferDate,
          },
        });
        await appendRoomChangeEvent(tx, {
          requestId: input.roomChangeRequestId,
          eventType: 'completed',
          idempotencyKey: `room-change:${input.roomChangeRequestId}:completed`,
          payload: {
            fromBedId: fromCtx.bedId,
            toBedId: input.toBedId,
            transferDate: input.transferDate,
          },
        });
      }

    });
  } catch (err) {
    if (pgUniqueViolation(err)) {
      return { ok: false, message: 'That bed was just taken by another resident.' };
    }
    if (
      err instanceof Error &&
      (err.message.startsWith('Room-change') || err.message.startsWith('Invalid room-change'))
    ) {
      return { ok: false, message: err.message };
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

  const { syncBillingProfileRentFromSsot, syncPendingRentInvoicesFromSsot } = await import(
    '@/src/lib/billing/rentPricingSsot'
  );
  await syncBillingProfileRentFromSsot(input.bookingId, transferMonth);
  await syncPendingRentInvoicesFromSsot(input.bookingId, transferMonth);

  await reconcileRentInvoicesAfterRoomTransfer({
    bookingId: input.bookingId,
    transferDate: input.transferDate,
    actorId: input.actorId,
  });

  await reconcileBookingOccupancy(input.bookingId);
  return { ok: true, fromBedId: fromCtx.bedId, pgId: fromCtx.pgId };
}
