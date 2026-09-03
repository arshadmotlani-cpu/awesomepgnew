/**
 * Self-service room transfer lifecycle — holds, settlement, expiry and completion.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  customers,
  financialInvoices,
  floors,
  pgs,
  roomChangeRequests,
  roomTransferBedHolds,
  rooms,
  paymentLinks,
} from '@/src/db/schema';
import { toIstParts } from '@/src/lib/dates/ist';
import { resolveAction, upsertOpenAction } from '@/src/services/unresolvedActions';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import {
  roomChangeChargesSettled,
  roomChangeChargesSettledFromRows,
  roomChangeSettlementTimestamp,
  applyRoomChangeWalletSurplusOnComplete,
} from '@/src/services/roomTransferBilling';
import type { RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import { applyResidentBedTransfer, isPgUniqueViolation } from '@/src/services/roomTransferTenancy';
import {
  assertRoomChangeTransition,
  roomChangeDeadlinePassed,
  roomChangeExpiresAt,
  type RoomChangeWorkflowState,
} from '@/src/lib/roomTransfer/stateMachine';
import { isBedAvailable } from '@/src/services/availability';
import {
  revalidateReservationLifecycleForBookingId,
  revalidateReservationLifecycleViews,
} from '@/src/lib/occupancyRevalidate';
import { scheduleAvailabilityCacheInvalidation } from '@/src/lib/cache/invalidateAvailability';
import {
  appendRoomChangeEvent,
  processRoomChangeEvents,
} from '@/src/services/roomChangeEvents';

const OPEN_TRANSFER_STATUSES = ['submitted', 'approved', 'waiting'] as const;

export async function recordSelfServiceRoomChange(requestId: string): Promise<void> {
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
  if (!row) return;
  // Self-serve immediate/scheduled transfers do not need admin approval.
  await db.insert(auditLog).values({
    actorType: 'system',
    actorId: null,
    entity: 'room_change_request',
    entityId: row.id,
    action: 'self_serve_recorded',
    diff: {
      status: row.status,
      transferMode: row.transferMode,
      expectedTransferDate: row.expectedTransferDate,
    },
  });
}

export async function placeRoomTransferHold(input: {
  requestId: string;
  toBedId: string;
  transferDate: string;
  expiresAt?: Date;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const today = toIstParts(new Date()).dateYmd;
  const expiresAt = input.expiresAt ?? roomChangeExpiresAt(new Date());
  try {
    await db.insert(roomTransferBedHolds).values({
      bedId: input.toBedId,
      roomChangeRequestId: input.requestId,
      holdFromDate: today,
      transferDate: input.transferDate,
      expiresAt,
      status: 'active',
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      return { ok: false, message: 'That bed is already reserved for another transfer.' };
    }
    throw err;
  }
  scheduleAvailabilityCacheInvalidation({ bedId: input.toBedId });
  return { ok: true };
}

async function closeUnpaidRoomChangeFinancials(
  requestId: string,
  reason: string,
): Promise<{ paidPaise: number }> {
  return db.transaction(async (tx) => {
    const invoices = await tx
      .select({
        id: financialInvoices.id,
        sourceTable: financialInvoices.sourceTable,
        status: financialInvoices.status,
        amountPaise: financialInvoices.amountPaise,
        breakdown: financialInvoices.breakdown,
      })
      .from(financialInvoices)
      .where(eq(financialInvoices.sourceId, requestId));
    const paidPayAll = invoices.find(
      (invoice) =>
        invoice.sourceTable === 'room_change_pay_all' &&
        (invoice.status === 'paid' || invoice.status === 'settled'),
    );
    const paidPaise = paidPayAll
      ? paidPayAll.amountPaise
      : invoices
          .filter((invoice) => invoice.sourceTable !== 'room_change_pay_all')
          .reduce(
            (sum, invoice) =>
              sum +
              (invoice.status === 'paid' || invoice.status === 'settled'
                ? invoice.amountPaise
                : invoice.breakdown?.paidPaise ?? 0),
            0,
          );
    const openInvoices = invoices.filter((invoice) =>
      ['draft', 'sent', 'payment_in_progress', 'processing', 'partial', 'overdue'].includes(
        invoice.status,
      ),
    );
    const invoiceIds = openInvoices.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      await tx
        .update(financialInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        })
        .where(inArray(financialInvoices.id, invoiceIds));
      await tx
        .update(paymentLinks)
        .set({ status: 'expired' })
        .where(
          and(
            inArray(paymentLinks.invoiceId, invoiceIds),
            eq(paymentLinks.status, 'active'),
          ),
        );
    }
    return { paidPaise };
  });
}

async function restorePendingRentAfterRoomChangeClose(bookingId: string): Promise<void> {
  const { syncPendingRentInvoicesFromSsot } = await import(
    '@/src/lib/billing/rentPricingSsot'
  );
  await syncPendingRentInvoicesFromSsot(bookingId, toIstParts(new Date()).dateYmd);
}

async function openPaidRoomChangeCancellationReview(input: {
  requestId: string;
  bookingId: string;
  customerId: string;
  paidPaise: number;
}): Promise<void> {
  if (input.paidPaise <= 0) return;
  await upsertOpenAction({
    actionType: 'invoice_review',
    entityType: 'room_change_request',
    entityId: input.requestId,
    residentId: input.customerId,
    pgId: null,
    sourceKey: `room_transfer_refund:${input.requestId}`,
    href: `/admin/bookings/${input.bookingId}/financial`,
    label: `Cancelled/expired room change has ${(input.paidPaise / 100).toFixed(2)} INR settled — review refund`,
    priority: 'high',
  });
}

export async function expireRoomChangeRequest(
  requestId: string,
  now = new Date(),
): Promise<{ ok: true; status: 'expired' | 'unchanged' } | { ok: false; message: string }> {
  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(roomChangeRequests)
      .where(eq(roomChangeRequests.id, requestId))
      .for('update')
      .limit(1);
    if (!request) return { kind: 'missing' as const };
    if (['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(request.workflowState)) {
      return {
        kind: 'unchanged' as const,
        bookingId: request.bookingId,
        customerId: request.customerId,
        bedId: request.toBedId,
      };
    }
    if (!request.expiresAt || !roomChangeDeadlinePassed(request.expiresAt, now)) {
      return {
        kind: 'unchanged' as const,
        bookingId: request.bookingId,
        customerId: request.customerId,
        bedId: request.toBedId,
      };
    }
    assertRoomChangeTransition(request.workflowState as RoomChangeWorkflowState, 'EXPIRED');
    const invoiceRows = await tx
      .select({
        sourceTable: financialInvoices.sourceTable,
        status: financialInvoices.status,
        amountPaise: financialInvoices.amountPaise,
      })
      .from(financialInvoices)
      .where(eq(financialInvoices.sourceId, requestId));
    const frozenQuote = request.quoteSnapshot as RoomShiftQuoteSnapshot | null;
    const invoiceSettled =
      (frozenQuote?.totalDuePaise ?? 0) <= 0 ||
      (invoiceRows.length > 0 && roomChangeChargesSettledFromRows(invoiceRows));
    if (invoiceSettled) {
      return {
        kind: 'unchanged' as const,
        bookingId: request.bookingId,
        customerId: request.customerId,
        bedId: request.toBedId,
      };
    }

    await tx
      .update(roomTransferBedHolds)
      .set({
        status: 'released',
        releasedAt: now,
        releaseReason: 'payment_window_expired',
        updatedAt: now,
      })
      .where(
        and(
          eq(roomTransferBedHolds.roomChangeRequestId, requestId),
          eq(roomTransferBedHolds.status, 'active'),
        ),
      );
    await tx
      .update(roomChangeRequests)
      .set({
        status: 'cancelled',
        workflowState: 'EXPIRED',
        stateVersion: request.stateVersion + 1,
        updatedAt: now,
      })
      .where(eq(roomChangeRequests.id, requestId));
    await tx.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'room_change_request',
      entityId: requestId,
      action: 'expired',
      diff: { expiresAt: request.expiresAt.toISOString() },
    });
    await appendRoomChangeEvent(tx, {
      requestId,
      eventType: 'expired',
      idempotencyKey: `room-change:${requestId}:expired`,
      payload: { expiresAt: request.expiresAt.toISOString() },
    });
    return {
      kind: 'expired' as const,
      bookingId: request.bookingId,
      customerId: request.customerId,
      bedId: request.toBedId,
    };
  });

  if (result.kind === 'missing') return { ok: false, message: 'Request not found.' };
  if (result.kind === 'unchanged') return { ok: true, status: 'unchanged' };
  const financials = await closeUnpaidRoomChangeFinancials(
    requestId,
    'Room-change payment window expired',
  );
  await restorePendingRentAfterRoomChangeClose(result.bookingId);
  await openPaidRoomChangeCancellationReview({
    requestId,
    bookingId: result.bookingId,
    customerId: result.customerId,
    paidPaise: financials.paidPaise,
  });
  await resolveAction({ sourceKey: `room_transfer:${requestId}` });
  scheduleAvailabilityCacheInvalidation({ bedId: result.bedId });
  await revalidateReservationLifecycleForBookingId(result.bookingId);
  scheduleAdminNotificationSync();
  return { ok: true, status: 'expired' };
}

export async function tryCompleteRoomChangeRequest(requestId: string): Promise<{
  ok: true;
  status: string;
} | { ok: false; message: string }> {
  const [row] = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.id, requestId))
    .limit(1);
  if (!row) return { ok: false, message: 'Request not found.' };
  if (row.workflowState === 'COMPLETED' || row.status === 'completed') {
    const completedQuote = row.quoteSnapshot as RoomShiftQuoteSnapshot | null;
    if (completedQuote?.walletSurplusPaise) {
      await applyRoomChangeWalletSurplusOnComplete({
        requestId: row.id,
        customerId: row.customerId,
        bookingId: row.bookingId,
        walletSurplusPaise: completedQuote.walletSurplusPaise,
      });
    }
    return { ok: true, status: 'completed' };
  }
  if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(row.workflowState)) {
    return { ok: false, message: `Request is ${row.workflowState.toLowerCase()}.` };
  }

  // Occupancy is independent of invoice settlement. Unpaid room-change
  // charges remain normal dues and must not expire or block the transfer.
  const settled = await roomChangeChargesSettled(requestId);
  const settledAt = settled
    ? (await roomChangeSettlementTimestamp(requestId)) ?? row.heldAt ?? row.createdAt
    : null;
  const expiresAt = row.expiresAt ?? roomChangeExpiresAt(row.heldAt ?? row.createdAt);

  const transferDate = row.expectedTransferDate ?? row.requestedShiftDate;
  const todayIst = toIstParts(new Date()).dateYmd;
  const canOccupy = todayIst >= transferDate;

  if (!canOccupy) {
    await db.transaction(async (tx) => {
      assertRoomChangeTransition(row.workflowState as RoomChangeWorkflowState, 'READY_TO_TRANSFER');
      await tx
        .update(roomChangeRequests)
        .set({
          status: 'approved',
          workflowState: 'READY_TO_TRANSFER',
          settledAt: settledAt ?? row.settledAt,
          stateVersion: row.stateVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(roomChangeRequests.id, requestId));
      await appendRoomChangeEvent(tx, {
        requestId,
        eventType: 'ready',
        idempotencyKey: `room-change:${requestId}:ready`,
        payload: { transferDate },
      });
    });
    const [hold] = await db
      .select({ id: roomTransferBedHolds.id })
      .from(roomTransferBedHolds)
      .where(
        and(
          eq(roomTransferBedHolds.roomChangeRequestId, requestId),
          eq(roomTransferBedHolds.status, 'active'),
        ),
      )
      .limit(1);
    if (!hold) {
      const placed = await placeRoomTransferHold({
        requestId,
        toBedId: row.toBedId,
        transferDate,
        expiresAt,
      });
      if (!placed.ok) return placed;
    }
    await db.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'room_change_request',
      entityId: requestId,
      action: 'scheduled_accepted',
      diff: { transferDate },
    });
    return { ok: true, status: 'approved' };
  }

  let [hold] = await db
    .select({ id: roomTransferBedHolds.id })
    .from(roomTransferBedHolds)
    .where(
      and(
        eq(roomTransferBedHolds.roomChangeRequestId, requestId),
        eq(roomTransferBedHolds.bedId, row.toBedId),
        eq(roomTransferBedHolds.status, 'active'),
      ),
    )
    .limit(1);
  if (!hold) {
    const placed = await placeRoomTransferHold({
      requestId,
      toBedId: row.toBedId,
      transferDate,
      expiresAt,
    });
    if (!placed.ok) return placed;
    [hold] = await db
      .select({ id: roomTransferBedHolds.id })
      .from(roomTransferBedHolds)
      .where(
        and(
          eq(roomTransferBedHolds.roomChangeRequestId, requestId),
          eq(roomTransferBedHolds.bedId, row.toBedId),
          eq(roomTransferBedHolds.status, 'active'),
        ),
      )
      .limit(1);
  }
  if (!hold) {
    return { ok: false, message: 'Destination hold is missing; Operations has been alerted.' };
  }

  const available = await isBedAvailable(
    { bedId: row.toBedId, startDate: transferDate, endDate: null },
    { skipRoomTransferHoldCheck: true },
  );
  if (!available) {
    return { ok: false, message: 'Destination bed is not available for the transfer date.' };
  }

  const moved = await applyResidentBedTransfer({
    bookingId: row.bookingId,
    toBedId: row.toBedId,
    transferDate,
    actorType: 'system',
    actorId: row.customerId,
    roomChangeRequestId: row.id,
    settledAt: settledAt ?? undefined,
  });
  if (!moved.ok) return { ok: false, message: moved.message };

  const quote = row.quoteSnapshot as RoomShiftQuoteSnapshot | null;
  if (quote?.walletSurplusPaise) {
    await applyRoomChangeWalletSurplusOnComplete({
      requestId: row.id,
      customerId: row.customerId,
      bookingId: row.bookingId,
      walletSurplusPaise: quote.walletSurplusPaise,
    });
  }

  await resolveAction({ sourceKey: `room_transfer:${requestId}` });
  revalidateReservationLifecycleViews({ pgId: moved.pgId });
  await revalidateReservationLifecycleForBookingId(row.bookingId);
  scheduleAdminNotificationSync();
  return { ok: true, status: 'completed' };
}

export async function tryCompleteRoomChangeAfterInvoice(invoiceId: string): Promise<void> {
  const [inv] = await db
    .select({
      sourceTable: financialInvoices.sourceTable,
      sourceId: financialInvoices.sourceId,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  if (!inv?.sourceTable?.startsWith('room_change_') || !inv.sourceId) return;
  await tryCompleteRoomChangeRequest(inv.sourceId);
}

export async function processDueScheduledRoomTransfers(): Promise<{ completed: number; errors: number }> {
  const due = await db
    .select({ id: roomChangeRequests.id })
    .from(roomChangeRequests)
    .where(
      sql`${roomChangeRequests.workflowState} NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED')`,
    );
  let completed = 0;
  let errors = 0;
  for (const row of due) {
    try {
      const result = await tryCompleteRoomChangeRequest(row.id);
      if (result.ok && result.status === 'completed') completed += 1;
      else if (!result.ok) errors += 1;
    } catch (err) {
      errors += 1;
      console.error('[room-transfer] request reconciliation failed', row.id, err);
    }
  }
  const { runRoomTransferOccupancyReconciliation } = await import(
    '@/src/lib/roomTransfer/occupancyReconciliation'
  );
  await runRoomTransferOccupancyReconciliation().catch((err) => {
    console.error('[room-transfer] occupancy reconciliation failed', err);
  });
  await processRoomChangeEvents().catch((err) => {
    console.error('[room-transfer] notification outbox failed', err);
  });
  return { completed, errors };
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
  assertRoomChangeTransition(current.workflowState as RoomChangeWorkflowState, 'CANCELLED');

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
        .set({
          status: 'released',
          releasedAt: new Date(),
          releaseReason: 'request_cancelled',
          updatedAt: new Date(),
        })
        .where(eq(roomTransferBedHolds.id, hold.id));
    }
    await tx
      .update(roomChangeRequests)
      .set({
        status: 'cancelled',
        workflowState: 'CANCELLED',
        stateVersion: current.stateVersion + 1,
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
    await appendRoomChangeEvent(tx, {
      requestId: input.requestId,
      eventType: 'cancelled',
      idempotencyKey: `room-change:${input.requestId}:cancelled`,
      payload: { reason: input.reason ?? null },
    });
  });

  const financials = await closeUnpaidRoomChangeFinancials(
    input.requestId,
    'Room change cancelled',
  );
  await restorePendingRentAfterRoomChangeClose(current.bookingId);
  await openPaidRoomChangeCancellationReview({
    requestId: input.requestId,
    bookingId: current.bookingId,
    customerId: current.customerId,
    paidPaise: financials.paidPaise,
  });
  await resolveAction({ sourceKey: `room_transfer:${input.requestId}` });
  scheduleAvailabilityCacheInvalidation({ bedId: current.toBedId });
  await revalidateReservationLifecycleForBookingId(current.bookingId);
  scheduleAdminNotificationSync();
  return { ok: true };
}

/**
 * When an occupant's vacating notice is withdrawn or rejected, the deterministic
 * scheduled transfer can no longer proceed. Fail it safely and release the hold.
 */
export async function revertScheduledTransfersOnVacatingCancel(input: {
  vacatingRequestId: string;
  reason: string;
}): Promise<void> {
  const affected = await db
    .select({
      id: roomChangeRequests.id,
      customerId: roomChangeRequests.customerId,
      workflowState: roomChangeRequests.workflowState,
    })
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
          .set({
            status: 'released',
            releasedAt: new Date(),
            releaseReason: 'source_vacating_cancelled',
            updatedAt: new Date(),
          })
          .where(eq(roomTransferBedHolds.id, hold.id));
      }
      assertRoomChangeTransition(row.workflowState as RoomChangeWorkflowState, 'FAILED');
      await tx
        .update(roomChangeRequests)
        .set({
          status: 'rejected',
          workflowState: 'FAILED',
          failedAt: new Date(),
          failureReason: input.reason,
          stateVersion: sql`${roomChangeRequests.stateVersion} + 1`,
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
        action: 'failed_vacating_cancelled',
        diff: { vacatingRequestId: input.vacatingRequestId, reason: input.reason },
      });
      await appendRoomChangeEvent(tx, {
        requestId: row.id,
        eventType: 'failed',
        idempotencyKey: `room-change:${row.id}:failed:vacating-cancelled`,
        payload: { reason: input.reason },
      });
    });

    await closeUnpaidRoomChangeFinancials(row.id, 'Scheduled room change invalidated');
    await resolveAction({ sourceKey: `room_transfer:${row.id}` });
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
  const today = toIstParts(new Date()).dateYmd;
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
