'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, bookings, floors, roomChangeRequests, rooms } from '@/src/db/schema';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  classifyTransferAvailability,
  type TransferBedOption,
} from '@/src/lib/roomTransfer/transferAvailability';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { loadBedPrice } from '@/src/services/pricing';
import { computeRoomShiftQuote, type RoomShiftQuoteSnapshot } from '@/src/services/roomShiftQuote';
import { syncRoomTransferApprovalAction } from '@/src/services/roomTransferLifecycle';
import { todayString } from '@/src/lib/dates';

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; message: string };

export type RoomChangeBedOption = TransferBedOption;

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

export async function quoteRoomChangeAction(input: {
  bookingId: string;
  toBedId: string;
  shiftDate?: string;
  moveInDate: string;
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

  const quote = await computeRoomShiftQuote({
    fromBedId,
    toBedId: input.toBedId,
    shiftDate: input.shiftDate ?? scenario.expectedTransferDate,
    oldMonthlyRentPaise,
    depositHeldPaise: deposit.refundableBalancePaise,
    moveInDate,
    scenario,
  });

  return { ok: true, quote };
}

export async function submitRoomChangeAction(input: {
  bookingId: string;
  toBedId: string;
  shiftDate: string;
  quoteSnapshot: RoomShiftQuoteSnapshot;
}): Promise<{ ok: true } | { ok: false; message: string }> {
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

  const snapshot = booking.pricingSnapshot as { perBed?: Array<{ bedId?: string }> } | null;
  const fromBedId = snapshot?.perBed?.[0]?.bedId;
  if (!fromBedId) return { ok: false, message: 'Current bed not found.' };

  const [inserted] = await db
    .insert(roomChangeRequests)
    .values({
      bookingId: input.bookingId,
      customerId: session.customerId,
      fromBedId,
      toBedId: input.toBedId,
      requestedShiftDate: scenario.expectedTransferDate,
      quoteSnapshot: input.quoteSnapshot,
      transferMode: scenario.mode,
      occupantCheckoutDate: scenario.occupantCheckoutDate ?? null,
      expectedTransferDate: scenario.expectedTransferDate,
      sourceVacatingRequestId: scenario.sourceVacatingRequestId ?? null,
      status: 'submitted',
    })
    .returning({ id: roomChangeRequests.id });

  if (inserted) {
    await syncRoomTransferApprovalAction(inserted.id);
  }

  revalidatePath('/account/profile');
  return { ok: true };
}

/** Pay-all: returns first payable bill URL when batch checkout not yet supported. */
export async function getPayAllHrefAction(input: {
  payHrefs: string[];
}): Promise<ActionResult<{ href: string }>> {
  await requireCustomerSession('/account/profile');
  const href = input.payHrefs[0];
  if (!href) return { ok: false, message: 'No payable bills.' };
  return { ok: true, data: { href } };
}
