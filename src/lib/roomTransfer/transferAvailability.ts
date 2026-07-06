/**
 * Room transfer availability — SSOT for Move Now vs Scheduled Transfer.
 *
 * Scenario 1 (immediate): destination bed is vacant today.
 * Scenario 2 (scheduled): destination is occupied with an approved vacating notice;
 *   expected transfer date is the checkout date (earliest bookable window).
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  roomTransferBedHolds,
  vacatingRequests,
} from '@/src/db/schema';
import { BLOCKING_RESERVATION_STATUS_SQL } from '@/src/lib/reservationBlocking';
import { formatDate, parseDate, todayString } from '@/src/lib/dates';
import { isBedAvailable } from '@/src/services/availability';

export type RoomTransferMode = 'immediate' | 'scheduled' | 'waitlist';

export type TransferAvailabilityScenario = {
  mode: RoomTransferMode;
  /** ISO date — earliest date the requesting resident can move. */
  expectedTransferDate: string;
  /** Present only for scheduled transfers. */
  occupantCheckoutDate?: string;
  sourceVacatingRequestId?: string;
  label: 'Immediate' | 'Scheduled' | 'Waitlist';
  summary: string;
};

export type TransferBedOption = {
  bedId: string;
  roomNumber: string;
  bedCode: string;
  monthlyRentPaise: number;
  scenario: TransferAvailabilityScenario;
};

/** Active room-transfer holds block public booking and other transfers. */
export async function bedHasActiveRoomTransferHold(bedId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: roomTransferBedHolds.id })
    .from(roomTransferBedHolds)
    .where(and(eq(roomTransferBedHolds.bedId, bedId), eq(roomTransferBedHolds.status, 'active')))
    .limit(1);
  return Boolean(row);
}

type ApprovedVacatingOnBed = {
  vacatingRequestId: string;
  vacatingDate: string;
};

/** Approved vacating notice for the current occupant of a bed. */
export async function findApprovedVacatingOnBed(
  bedId: string,
): Promise<ApprovedVacatingOnBed | null> {
  const [row] = await db
    .select({
      vacatingRequestId: vacatingRequests.id,
      vacatingDate: vacatingRequests.vacatingDate,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .innerJoin(vacatingRequests, eq(vacatingRequests.bookingId, bookings.id))
    .where(
      and(
        eq(bedReservations.bedId, bedId),
        sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
        eq(bookings.status, 'confirmed'),
        eq(vacatingRequests.status, 'approved'),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    vacatingRequestId: row.vacatingRequestId,
    vacatingDate: formatDate(parseDate(row.vacatingDate)),
  };
}

/**
 * Classify how a bed can be transferred into.
 * Returns null when the bed is not eligible (occupied without approved vacating,
 * archived, or held for another approved transfer).
 */
export async function classifyTransferAvailability(
  bedId: string,
  asOfDate: string = todayString(),
): Promise<TransferAvailabilityScenario | null> {
  const [bed] = await db
    .select({ status: beds.status, archivedAt: beds.archivedAt })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!bed || bed.archivedAt || bed.status !== 'available') return null;

  if (await bedHasActiveRoomTransferHold(bedId)) return null;

  const vacantNow = await isBedAvailable(
    { bedId, startDate: asOfDate, endDate: null },
    { skipRoomTransferHoldCheck: true },
  );
  if (vacantNow) {
    return {
      mode: 'immediate',
      expectedTransferDate: asOfDate,
      label: 'Immediate',
      summary: 'Destination bed is vacant — move as soon as admin approves and payments clear.',
    };
  }

  const vacating = await findApprovedVacatingOnBed(bedId);
  if (!vacating) {
    const [occupied] = await db
      .select({ id: bedReservations.id })
      .from(bedReservations)
      .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
      .where(
        and(
          eq(bedReservations.bedId, bedId),
          sql`${bedReservations.status} IN ${sql.raw(BLOCKING_RESERVATION_STATUS_SQL)}`,
          eq(bookings.status, 'confirmed'),
          sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
        ),
      )
      .limit(1);
    if (occupied) {
      return {
        mode: 'waitlist',
        expectedTransferDate: asOfDate,
        label: 'Waitlist',
        summary: 'Bed is occupied with no approved vacating notice — join the waitlist.',
      };
    }
    return null;
  }

  const checkoutDate = vacating.vacatingDate;
  const expectedTransferDate = checkoutDate;

  return {
    mode: 'scheduled',
    expectedTransferDate,
    occupantCheckoutDate: checkoutDate,
    sourceVacatingRequestId: vacating.vacatingRequestId,
    label: 'Scheduled',
    summary: `Reserved after current occupant checks out on ${checkoutDate}.`,
  };
}

export function transferModeLabel(mode: RoomTransferMode): 'Immediate' | 'Scheduled' | 'Waitlist' {
  if (mode === 'immediate') return 'Immediate';
  if (mode === 'scheduled') return 'Scheduled';
  return 'Waitlist';
}
