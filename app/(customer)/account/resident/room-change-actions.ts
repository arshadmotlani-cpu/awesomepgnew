'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '@/src/db/client';
import {
  beds,
  bookings,
  auditLog,
  floors,
  pgs,
  roomChangeRequests,
  roomTransferBedHolds,
  rooms,
} from '@/src/db/schema';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  classifyTransferAvailability,
  type TransferBedOption,
} from '@/src/lib/roomTransfer/transferAvailability';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { loadBedPrice } from '@/src/services/pricing';
import { computeRoomShiftQuote, type RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import {
  cancelRoomChangeRequest,
  recordSelfServiceRoomChange,
  tryCompleteRoomChangeRequest,
} from '@/src/services/roomTransferLifecycle';
import { ensureRoomChangeInvoices } from '@/src/services/roomTransferBilling';
import { listPublicPgs } from '@/src/services/publicPgReadCache';
import { todayString } from '@/src/lib/dates';
import {
  ROOM_CHANGE_QUOTE_VERSION,
  roomChangeExpiresAt,
} from '@/src/lib/roomTransfer/stateMachine';
import { scheduleAvailabilityCacheInvalidation } from '@/src/lib/cache/invalidateAvailability';
import { appendRoomChangeEvent } from '@/src/services/roomChangeEvents';

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

export type RoomChangeBedOption = TransferBedOption;

export type RoomChangeDestinationPg = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  isCurrentPg: boolean;
};

export async function fetchRoomChangeDestinationPgsAction(input: {
  currentPgId: string;
}): Promise<ActionResult<{ pgs: RoomChangeDestinationPg[] }>> {
  await requireCustomerSession('/account/profile');
  const result = await listPublicPgs();
  if (!result.ok) {
    return { ok: false, message: result.error ?? 'Could not load properties.' };
  }
  const pgsList = result.data.map((pg) => ({
    id: pg.id,
    name: pg.name,
    slug: pg.slug,
    city: pg.city,
    isCurrentPg: pg.id === input.currentPgId,
  }));
  pgsList.sort((a, b) => {
    if (a.isCurrentPg !== b.isCurrentPg) return a.isCurrentPg ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { ok: true, data: { pgs: pgsList } };
}

export async function fetchRoomChangeAvailabilityAction(input: {
  pgId: string;
  fromBedId: string;
}): Promise<
  | { ok: true; beds: RoomChangeBedOption[] }
  | { ok: false; message: string }
> {
  const session = await requireCustomerSession('/account/profile');
  void session;
  const fromDate = todayString();

  const bedRows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
    })
    .from(beds)
    .innerJoin(rooms, eq(beds.roomId, rooms.id))
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .where(eq(floors.pgId, input.pgId));

  const available: RoomChangeBedOption[] = [];
  for (const row of bedRows) {
    if (row.bedId === input.fromBedId) continue;
    const scenario = await classifyTransferAvailability(row.bedId, fromDate);
    if (!scenario) continue;
    try {
      const price = await loadBedPrice(row.bedId, scenario.expectedTransferDate);
      if (!price) continue;
      available.push({
        bedId: row.bedId,
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        monthlyRentPaise: price.monthlyRatePaise,
        scenario,
      });
    } catch {
      // skip beds without pricing
    }
  }

  available.sort((a, b) => {
    const modeOrder = a.scenario.mode === 'immediate' ? 0 : 1;
    const modeOrderB = b.scenario.mode === 'immediate' ? 0 : 1;
    if (modeOrder !== modeOrderB) return modeOrder - modeOrderB;
    return a.scenario.expectedTransferDate.localeCompare(b.scenario.expectedTransferDate);
  });

  return { ok: true, beds: available };
}

async function destinationBedContext(toBedId: string): Promise<{
  toPgId: string;
  toPgName: string;
  toRoomNumber: string;
  toBedCode: string;
}> {
  const [row] = await db
    .select({
      toPgId: floors.pgId,
      toPgName: pgs.name,
      toRoomNumber: rooms.roomNumber,
      toBedCode: beds.bedCode,
    })
    .from(beds)
    .innerJoin(rooms, eq(beds.roomId, rooms.id))
    .innerJoin(floors, eq(rooms.floorId, floors.id))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(beds.id, toBedId))
    .limit(1);
  if (!row) throw new Error('Destination bed not found.');
  return row;
}

export async function quoteRoomChangeAction(input: {
  bookingId: string;
  toBedId: string;
  shiftDate?: string;
  moveInDate: string;
  fromRoomLabel?: string;
}): Promise<{ ok: true; quote: RoomShiftQuoteSnapshot } | { ok: false; message: string }> {
  await requireCustomerSession('/account/profile');

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, input.bookingId),
  });
  if (!booking) return { ok: false, message: 'Booking not found.' };

  const scenario = await classifyTransferAvailability(input.toBedId);
  if (!scenario) {
    return { ok: false, message: 'This bed is not available for room transfer.' };
  }
  if (scenario.mode === 'waitlist') {
    return { ok: false, message: 'This bed requires waitlist signup, not a transfer quote.' };
  }

  const deposit = await getDepositSummaryForBooking(input.bookingId);
  if (!deposit) return { ok: false, message: 'Deposit summary unavailable.' };

  const snapshot = booking.pricingSnapshot as { perBed?: Array<{ monthlyRatePaise?: number; bedId?: string }> } | null;
  const oldMonthlyRentPaise =
    snapshot?.perBed?.[0]?.monthlyRatePaise ?? booking.subtotalPaise;
  const fromBedId = snapshot?.perBed?.[0]?.bedId;
  if (!fromBedId) return { ok: false, message: 'Current bed not found on booking.' };

  const moveInDate = input.moveInDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveInDate)) {
    return { ok: false, message: 'Invalid move-in date on booking.' };
  }

  const dest = await destinationBedContext(input.toBedId);

  const quote = await computeRoomShiftQuote({
    bookingId: input.bookingId,
    fromBedId,
    toBedId: input.toBedId,
    // Transfer timing is server-authoritative; never freeze a client-selected date.
    shiftDate: scenario.expectedTransferDate,
    oldMonthlyRentPaise,
    depositHeldPaise: deposit.refundableBalancePaise,
    moveInDate,
    scenario,
    fromRoomLabel: input.fromRoomLabel ?? null,
    toPgId: dest.toPgId,
    toPgName: dest.toPgName,
    toRoomNumber: dest.toRoomNumber,
    toBedCode: dest.toBedCode,
  });

  return { ok: true, quote };
}

export type RoomChangeSubmitResult = {
  requestId: string;
  status: string;
  expiresAt: string;
  payAllHref: string | null;
  individual: Array<{ label: string; amountPaise: number; href: string | null; invoiceId: string }>;
  totalDuePaise: number;
};

export async function submitRoomChangeAction(input: {
  bookingId: string;
  toBedId: string;
  shiftDate: string;
  moveInDate: string;
  fromRoomLabel?: string;
  quoteSnapshot: RoomShiftQuoteSnapshot;
}): Promise<{ ok: true; data: RoomChangeSubmitResult } | { ok: false; message: string }> {
  const session = await requireCustomerSession('/account/profile');

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, input.bookingId),
  });
  if (!booking || booking.customerId !== session.customerId) {
    return { ok: false, message: 'Booking not found.' };
  }

  const authoritativeQuoteResult = await quoteRoomChangeAction({
    bookingId: input.bookingId,
    toBedId: input.toBedId,
    shiftDate: input.shiftDate,
    moveInDate: input.moveInDate,
    fromRoomLabel: input.fromRoomLabel,
  });
  if (!authoritativeQuoteResult.ok) return authoritativeQuoteResult;
  const authoritativeQuote = authoritativeQuoteResult.quote;
  const scenario = await classifyTransferAvailability(input.toBedId);
  if (!scenario || scenario.mode === 'waitlist') {
    return { ok: false, message: 'This bed is no longer available for room transfer.' };
  }
  if (authoritativeQuote.transferMode !== input.quoteSnapshot.transferMode) {
    return {
      ok: false,
      message: `Transfer type changed — this move is now ${authoritativeQuote.transferLabel}, not ${input.quoteSnapshot.transferLabel}. Please review the fresh quote.`,
    };
  }
  if (authoritativeQuote.transferMode === 'waitlist') {
    return { ok: false, message: 'Use waitlist signup for this bed.' };
  }

  const snapshot = booking.pricingSnapshot as { perBed?: Array<{ bedId?: string }> } | null;
  const fromBedId = snapshot?.perBed?.[0]?.bedId;
  if (!fromBedId) return { ok: false, message: 'Current bed not found.' };

  const transferDate = authoritativeQuote.expectedTransferDate;
  const transferMode: 'immediate' | 'scheduled' =
    scenario.mode === 'immediate' ? 'immediate' : 'scheduled';
  const heldAt = new Date();
  const expiresAt = roomChangeExpiresAt(heldAt);
  const quoteHash = createHash('sha256')
    .update(JSON.stringify(authoritativeQuote))
    .digest('hex');

  let inserted: { id: string } | undefined;
  try {
    inserted = await db.transaction(async (tx) => {
      // Serialize request creation for this booking and target bed.
      // Unique indexes remain the final race backstop.
      await tx.execute(sql`SELECT id FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM beds WHERE id = ${input.toBedId}::uuid FOR UPDATE`);
      const [request] = await tx
        .insert(roomChangeRequests)
        .values({
          bookingId: input.bookingId,
          customerId: session.customerId,
          fromBedId,
          toBedId: input.toBedId,
          requestedShiftDate: transferDate,
          quoteSnapshot: authoritativeQuote,
          quoteVersion: ROOM_CHANGE_QUOTE_VERSION,
          quoteHash,
          transferMode,
          occupantCheckoutDate: authoritativeQuote.occupantCheckoutDate ?? null,
          expectedTransferDate: transferDate,
          sourceVacatingRequestId: scenario.sourceVacatingRequestId ?? null,
          status: 'submitted',
          // Accepted request: occupancy is not gated on payment.
          workflowState: 'READY_TO_TRANSFER',
          heldAt,
          expiresAt,
        })
        .returning({ id: roomChangeRequests.id });
      if (!request) throw new Error('Could not create room change request.');

      await tx.insert(roomTransferBedHolds).values({
        bedId: input.toBedId,
        roomChangeRequestId: request.id,
        holdFromDate: todayString(),
        transferDate,
        expiresAt,
        status: 'active',
      });
      await tx.insert(auditLog).values({
        actorType: 'customer',
        actorId: session.customerId,
        entity: 'room_change_request',
        entityId: request.id,
        action: 'self_service_requested_and_held',
        diff: {
          fromBedId,
          toBedId: input.toBedId,
          transferDate,
          expiresAt: expiresAt.toISOString(),
          quoteHash,
        },
      });
      await appendRoomChangeEvent(tx, {
        requestId: request.id,
        eventType: 'held',
        idempotencyKey: `room-change:${request.id}:held`,
        payload: { expiresAt: expiresAt.toISOString(), transferDate },
      });
      await appendRoomChangeEvent(tx, {
        requestId: request.id,
        eventType: 'ready',
        idempotencyKey: `room-change:${request.id}:ready`,
        payload: {
          expiresAt: expiresAt.toISOString(),
          totalDuePaise: authoritativeQuote.totalDuePaise,
          transferDate,
        },
      });
      return request;
    });
  } catch (err) {
    const { isPgUniqueViolation } = await import('@/src/services/roomTransferTenancy');
    if (isPgUniqueViolation(err)) {
      return { ok: false, message: 'That bed is already reserved, or you already have an active room change.' };
    }
    throw err;
  }

  const billing = await ensureRoomChangeInvoices({
    requestId: inserted.id,
    customerId: session.customerId,
    bookingId: input.bookingId,
    quote: authoritativeQuote,
  });
  scheduleAvailabilityCacheInvalidation({ bedId: input.toBedId });

  await db
    .update(roomChangeRequests)
    .set({ quoteSnapshot: billing.quote, updatedAt: new Date() })
    .where(eq(roomChangeRequests.id, inserted.id));

  await recordSelfServiceRoomChange(inserted.id);

  const completion = await tryCompleteRoomChangeRequest(inserted.id);

  revalidatePath('/account/profile');
  revalidatePath('/account/resident');
  return {
    ok: true,
    data: {
      requestId: inserted.id,
      status: completion.ok ? completion.status : 'submitted',
      expiresAt: expiresAt.toISOString(),
      payAllHref: billing.payAllHref,
      individual: billing.individual,
      totalDuePaise: billing.quote.totalDuePaise,
    },
  };
}

export async function cancelRoomChangeAction(input: {
  requestId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireCustomerSession('/account/profile');
  const result = await cancelRoomChangeRequest({
    requestId: input.requestId,
    actorType: 'customer',
    actorId: session.customerId,
    reason: 'Cancelled by resident',
  });
  if (result.ok) revalidatePath('/account/profile');
  return result;
}

export async function joinBedWaitlistAction(input: {
  bedId: string;
  bookingId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireCustomerSession('/account/profile');
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, input.bookingId),
  });
  if (!booking || booking.customerId !== session.customerId) {
    return { ok: false, message: 'Booking not found.' };
  }
  const scenario = await classifyTransferAvailability(input.bedId);
  if (!scenario || scenario.mode !== 'waitlist') {
    return { ok: false, message: 'Waitlist is not available for this bed.' };
  }
  const { joinBedWaitlist } = await import('@/src/services/bedWaitlist');
  const result = await joinBedWaitlist({
    bedId: input.bedId,
    customerId: session.customerId,
    bookingId: input.bookingId,
  });
  if (!result.ok) return result;
  revalidatePath('/account/profile');
  return { ok: true };
}
