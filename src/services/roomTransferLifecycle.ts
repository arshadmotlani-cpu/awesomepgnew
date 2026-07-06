/**
 * Room transfer lifecycle — admin approval, bed holds, vacating integration.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  customers,
  floors,
  pgs,
  roomChangeRequests,
  roomTransferBedHolds,
  rooms,
} from '@/src/db/schema';
import { classifyTransferAvailability } from '@/src/lib/roomTransfer/transferAvailability';
import { todayString } from '@/src/lib/dates';
import { resolveAction, upsertOpenAction } from '@/src/services/unresolvedActions';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';

const OPEN_TRANSFER_STATUSES = ['submitted', 'approved', 'waiting'] as const;

async function bookingPgId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);
  return row?.pgId ?? null;
}

export async function syncRoomTransferApprovalAction(requestId: string): Promise<void> {
  const [row] = await db
    .select({
      id: roomChangeRequests.id,
      status: roomChangeRequests.status,
      customerId: roomChangeRequests.customerId,
      bookingId: roomChangeRequests.bookingId,
      transferMode: roomChangeRequests.transferMode,
      expectedTransferDate: roomChangeRequests.expectedTransferDate,
    })
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, requestId))
    .limit(1);
  if (!row || row.status !== 'submitted') return;

  const pgId = await bookingPgId(row.bookingId);
  const modeLabel = row.transferMode === 'scheduled' ? 'Scheduled' : 'Immediate';
  await upsertOpenAction({
    actionType: 'room_transfer_approval',
    entityType: 'room_change_request',
    entityId: row.id,
    residentId: row.customerId,
    pgId,
    sourceKey: `room_transfer:${row.id}`,
    href: '/admin/requests',
    label: `${modeLabel} room transfer approval`,
    priority: row.transferMode === 'scheduled' ? 'high' : 'medium',
  });
  scheduleAdminNotificationSync();
}

export async function approveRoomChangeRequest(input: {
  requestId: string;
  adminId: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const [current] = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, message: 'Request not found.' };
  if (current.status !== 'submitted' && current.status !== 'waiting') {
    return { ok: false, message: `Cannot approve request in status ${current.status}.` };
  }

  const scenario = await classifyTransferAvailability(current.toBedId);
  if (!scenario) {
    return { ok: false, message: 'Destination bed is no longer available for transfer.' };
  }
  if (scenario.mode === 'waitlist') {
    return {
      ok: false,
      message: 'Destination bed is occupied with no vacating notice — use the waitlist instead.',
    };
  }
  if (current.transferMode && scenario.mode !== current.transferMode) {
    return {
      ok: false,
      message: `Transfer mode changed — bed is now ${scenario.label.toLowerCase()}, not ${current.transferMode}.`,
    };
  }

  const today = todayString();
  const transferDate = current.expectedTransferDate ?? scenario.expectedTransferDate;
  const holdFrom = scenario.mode === 'immediate' ? today : today;

  const transferMode: 'immediate' | 'scheduled' = scenario.mode;

  await db.transaction(async (tx) => {
    await tx
      .update(roomChangeRequests)
      .set({
        status: 'approved',
        reviewedByAdminId: input.adminId,
        adminNotes: input.notes ?? current.adminNotes,
        transferMode,
        expectedTransferDate: transferDate,
        occupantCheckoutDate: scenario.occupantCheckoutDate ?? current.occupantCheckoutDate,
        sourceVacatingRequestId:
          scenario.sourceVacatingRequestId ?? current.sourceVacatingRequestId,
        updatedAt: new Date(),
      })
      .where(eq(roomChangeRequests.id, input.requestId));

    await tx.insert(roomTransferBedHolds).values({
      bedId: current.toBedId,
      roomChangeRequestId: current.id,
      holdFromDate: holdFrom,
      transferDate,
      status: 'active',
    });

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'room_change_request',
      entityId: current.id,
      action: 'approved',
      diff: {
        transferMode: scenario.mode,
        transferDate,
        toBedId: current.toBedId,
      },
    });
  });

  await resolveAction({ sourceKey: `room_transfer:${input.requestId}` });
  scheduleAdminNotificationSync();
  return { ok: true };
}

export async function cancelRoomChangeRequest(input: {
  requestId: string;
  actorType: 'admin' | 'customer';
  actorId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const [current] = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, message: 'Request not found.' };
  if (!OPEN_TRANSFER_STATUSES.includes(current.status as (typeof OPEN_TRANSFER_STATUSES)[number])) {
    return { ok: false, message: `Cannot cancel request in status ${current.status}.` };
  }
  if (input.actorType === 'customer' && current.customerId !== input.actorId) {
    return { ok: false, message: 'Not allowed.' };
  }

  await db.transaction(async (tx) => {
    const [hold] = await tx
      .select({ id: roomTransferBedHolds.id })
      .from(roomTransferBedHolds)
      .where(
        and(
          eq(roomTransferBedHolds.roomChangeRequestId, input.requestId),
          eq(roomTransferBedHolds.status, 'active'),
        ),
      )
      .limit(1);
    if (hold) {
      await tx
        .update(roomTransferBedHolds)
        .set({ status: 'released', releasedAt: new Date(), updatedAt: new Date() })
        .where(eq(roomTransferBedHolds.id, hold.id));
    }
    await tx
      .update(roomChangeRequests)
      .set({
        status: 'cancelled',
        adminNotes: input.reason ?? current.adminNotes,
        updatedAt: new Date(),
      })
      .where(eq(roomChangeRequests.id, input.requestId));

    await tx.insert(auditLog).values({
      actorType: input.actorType,
      actorId: input.actorId,
      entity: 'room_change_request',
      entityId: current.id,
      action: 'cancelled',
      diff: { reason: input.reason },
    });
  });

  await resolveAction({ sourceKey: `room_transfer:${input.requestId}` });
  scheduleAdminNotificationSync();
  return { ok: true };
}

/**
 * When an occupant's vacating notice is withdrawn or rejected, scheduled transfers
 * on that bed return to Waiting and the bed hold is released.
 */
export async function revertScheduledTransfersOnVacatingCancel(input: {
  vacatingRequestId: string;
  reason: string;
}): Promise<void> {
  const affected = await db
    .select({ id: roomChangeRequests.id, customerId: roomChangeRequests.customerId })
    .from(roomChangeRequests)
    .where(
      and(
        eq(roomChangeRequests.sourceVacatingRequestId, input.vacatingRequestId),
        inArray(roomChangeRequests.status, ['approved', 'submitted']),
        eq(roomChangeRequests.transferMode, 'scheduled'),
      ),
    );

  for (const row of affected) {
    await db.transaction(async (tx) => {
      const [hold] = await tx
        .select({ id: roomTransferBedHolds.id })
        .from(roomTransferBedHolds)
        .where(
          and(
            eq(roomTransferBedHolds.roomChangeRequestId, row.id),
            eq(roomTransferBedHolds.status, 'active'),
          ),
        )
        .limit(1);
      if (hold) {
        await tx
          .update(roomTransferBedHolds)
          .set({ status: 'released', releasedAt: new Date(), updatedAt: new Date() })
          .where(eq(roomTransferBedHolds.id, hold.id));
      }
      await tx
        .update(roomChangeRequests)
        .set({
          status: 'waiting',
          sourceVacatingRequestId: null,
          occupantCheckoutDate: null,
          adminNotes: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(roomChangeRequests.id, row.id));

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'room_change_request',
        entityId: row.id,
        action: 'waiting_vacating_cancelled',
        diff: { vacatingRequestId: input.vacatingRequestId, reason: input.reason },
      });
    });

    await upsertOpenAction({
      actionType: 'room_transfer_approval',
      entityType: 'room_change_request',
      entityId: row.id,
      residentId: row.customerId,
      pgId: null,
      sourceKey: `room_transfer:${row.id}`,
      href: '/admin/requests',
      label: 'Scheduled room transfer — waiting (vacating cancelled)',
      priority: 'high',
    });
  }

  if (affected.length > 0) scheduleAdminNotificationSync();
}

/** Scheduled transfers whose transfer date is today — admin journey entry point. */
export async function listRoomTransfersDueToday(): Promise<
  Array<{
    id: string;
    bookingId: string;
    toBedId: string;
    transferDate: string;
    customerId: string;
    customerName: string;
    pgId: string | null;
    pgName: string | null;
    bedCode: string | null;
    roomNumber: string | null;
  }>
> {
  const today = todayString();
  const rows = await db
    .select({
      id: roomChangeRequests.id,
      bookingId: roomChangeRequests.bookingId,
      toBedId: roomChangeRequests.toBedId,
      transferDate: roomChangeRequests.expectedTransferDate,
      customerId: roomChangeRequests.customerId,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
    })
    .from(roomChangeRequests)
    .innerJoin(customers, eq(customers.id, roomChangeRequests.customerId))
    .innerJoin(beds, eq(beds.id, roomChangeRequests.toBedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(roomChangeRequests.status, 'approved'),
        eq(roomChangeRequests.transferMode, 'scheduled'),
        eq(roomChangeRequests.expectedTransferDate, today),
      ),
    );
  return rows
    .filter((r): r is typeof r & { transferDate: string } => Boolean(r.transferDate))
    .map((r) => ({
      id: r.id,
      bookingId: r.bookingId,
      toBedId: r.toBedId,
      transferDate: r.transferDate,
      customerId: r.customerId,
      customerName: r.customerName,
      pgId: r.pgId,
      pgName: r.pgName,
      bedCode: r.bedCode,
      roomNumber: r.roomNumber,
    }));
}
