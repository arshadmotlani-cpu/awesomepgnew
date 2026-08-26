'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, bookings, floors, pgs, roomChangeRequests, rooms } from '@/src/db/schema';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  classifyTransferAvailability,
  type TransferBedOption,
} from '@/src/lib/roomTransfer/transferAvailability';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { loadBedPrice } from '@/src/services/pricing';
import { computeRoomShiftQuote, type RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import {
  placeRoomTransferHold,
  syncRoomTransferApprovalAction,
  tryCompleteRoomChangeRequest,
} from '@/src/services/roomTransferLifecycle';
import { ensureRoomChangeInvoices } from '@/src/services/roomTransferBilling';
import { listPublicPgs } from '@/src/services/publicPgReadCache';
import { todayString } from '@/src/lib/dates';

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
    shiftDate: input.shiftDate ?? scenario.expectedTransferDate,
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
  payAllHref: string | null;
  individual: Array<{ label: string; amountPaise: number; href: string | null; invoiceId: string }>;
  totalDuePaise: number;
};

export async function submitRoomChangeAction(input: {
  bookingId: string;
  toBedId: string;
  shiftDate: string;
  quoteSnapshot: RoomShiftQuoteSnapshot;
}): Promise<{ ok: true; data: RoomChangeSubmitResult } | { ok: false; message: string }> {
  const session = await requireCustomerSession('/account/profile');

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, input.bookingId),
  });
  if (!booking || booking.customerId !== session.customerId) {
    return { ok: false, message: 'Booking not found.' };
  }

  const scenario = await classifyTransferAvailability(input.toBedId);
  if (!scenario) {
    return { ok: false, message: 'This bed is no longer available for transfer.' };
  }
  if (scenario.mode !== input.quoteSnapshot.transferMode) {
    return {
      ok: false,
      message: `Transfer type changed — this move is now ${scenario.label}, not ${input.quoteSnapshot.transferLabel}. Please get a fresh quote.`,
    };
  }
  if (scenario.mode === 'waitlist') {
    return { ok: false, message: 'Use waitlist signup for this bed.' };
  }

  const snapshot = booking.pricingSnapshot as { perBed?: Array<{ bedId?: string }> } | null;
  const fromBedId = snapshot?.perBed?.[0]?.bedId;
  if (!fromBedId) return { ok: false, message: 'Current bed not found.' };

  const transferDate = scenario.expectedTransferDate;

  const [inserted] = await db
    .insert(roomChangeRequests)
    .values({
      bookingId: input.bookingId,
      customerId: session.customerId,
      fromBedId,
      toBedId: input.toBedId,
      requestedShiftDate: transferDate,
      quoteSnapshot: input.quoteSnapshot,
      transferMode: scenario.mode,
      occupantCheckoutDate: scenario.occupantCheckoutDate ?? null,
      expectedTransferDate: transferDate,
      sourceVacatingRequestId: scenario.sourceVacatingRequestId ?? null,
      status: 'submitted',
    })
    .returning({ id: roomChangeRequests.id });

  if (!inserted) {
    return { ok: false, message: 'Could not create room change request.' };
  }

  const billing = await ensureRoomChangeInvoices({
    requestId: inserted.id,
    customerId: session.customerId,
    bookingId: input.bookingId,
    quote: input.quoteSnapshot,
  });

  await db
    .update(roomChangeRequests)
    .set({ quoteSnapshot: billing.quote, updatedAt: new Date() })
    .where(eq(roomChangeRequests.id, inserted.id));

  await syncRoomTransferApprovalAction(inserted.id);

  if (scenario.mode === 'immediate') {
    const hold = await placeRoomTransferHold({
      requestId: inserted.id,
      toBedId: input.toBedId,
      transferDate,
    });
    if (!hold.ok) {
      return { ok: false, message: hold.message };
    }
  }

  const completion = await tryCompleteRoomChangeRequest(inserted.id);

  revalidatePath('/account/profile');
  return {
    ok: true,
    data: {
      requestId: inserted.id,
      status: completion.ok ? completion.status : 'submitted',
      payAllHref: billing.payAllHref,
      individual: billing.individual,
      totalDuePaise: billing.quote.totalDuePaise,
    },
  };
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
