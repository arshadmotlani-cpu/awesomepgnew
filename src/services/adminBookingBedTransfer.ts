/**
 * Admin SSOT — relocate an existing confirmed booking to another bed (same PG).
 * Uses applyResidentBedTransfer (atomic bed_reservations + audit + occupancy).
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, bedReservations, bookings, customers, floors, pgs, rooms } from '@/src/db/schema';
import { formatDate, parseDate, todayString } from '@/src/lib/dates';
import { isBedAvailable } from '@/src/services/availability';
import { applyResidentBedTransfer } from '@/src/services/roomTransferTenancy';
import { getRoomConfigurationEffectiveOn } from '@/src/services/roomConfigurationSchedule';

export type AdminBookingBedTransferInput = {
  actorId: string;
  bookingCode: string;
  toRoomNumber: string;
  toBedCode: string;
  pgSlug?: string;
  /** ISO date; default = lower(active primary stay) for whole-stay relocation. */
  transferDate?: string;
  preservePricingSnapshot?: boolean;
  dryRun?: boolean;
};

export type AdminBookingBedTransferPlan = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  fromBedId: string;
  fromRoomNumber: string;
  fromBedCode: string;
  toBedId: string;
  toRoomNumber: string;
  toBedCode: string;
  transferDate: string;
  stayRangeAfter: string;
  expectedCheckoutDate: string | null;
  preservePricingSnapshot: boolean;
  destinationAvailable: boolean;
  roomConfigNote?: string;
};

export async function planAdminBookingBedTransfer(
  input: Omit<AdminBookingBedTransferInput, 'actorId' | 'dryRun'>,
): Promise<AdminBookingBedTransferPlan | { ok: false; message: string }> {
  const pgSlug = input.pgSlug?.trim();

  const bookingWhere = and(
    eq(bookings.bookingCode, input.bookingCode.trim()),
    eq(bookings.status, 'confirmed'),
    eq(bedReservations.kind, 'primary'),
    eq(bedReservations.status, 'active'),
    pgSlug ? eq(pgs.slug, pgSlug) : undefined,
  );

  const [row] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      customerName: customers.fullName,
      fromBedId: beds.id,
      fromBedCode: beds.bedCode,
      fromRoomNumber: rooms.roomNumber,
      fromRoomId: rooms.id,
      stayLower: sql<string>`lower(${bedReservations.stayRange})::text`,
      stayUpper: sql<string | null>`upper(${bedReservations.stayRange})::text`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(bookingWhere)
    .limit(1);

  if (!row) {
    return { ok: false, message: 'Active booking not found (check booking code and PG slug).' };
  }

  const destWhere = and(
    eq(rooms.roomNumber, input.toRoomNumber.trim()),
    eq(beds.bedCode, input.toBedCode.trim()),
    isNull(beds.archivedAt),
    isNull(rooms.archivedAt),
    pgSlug ? eq(pgs.slug, pgSlug) : undefined,
  );

  const [dest] = await db
    .select({
      bedId: beds.id,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      archivedAt: beds.archivedAt,
      status: beds.status,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(destWhere)
    .limit(1);

  if (!dest) {
    return { ok: false, message: 'Destination bed not found in this PG.' };
  }
  if (dest.bedId === row.fromBedId) {
    return { ok: false, message: 'Booking is already on that bed.' };
  }
  if (dest.status !== 'available') {
    return { ok: false, message: `Destination bed status is ${dest.status}.` };
  }

  const today = todayString();
  const stayStart = formatDate(parseDate(row.stayLower.slice(0, 10)));
  const transferDate = input.transferDate?.trim()
    ? formatDate(parseDate(input.transferDate.trim()))
    : stayStart;

  if (transferDate < stayStart) {
    return {
      ok: false,
      message: `Transfer date ${transferDate} is before stay start ${stayStart}.`,
    };
  }
  if (transferDate > today) {
    return { ok: false, message: 'Transfer date cannot be in the future.' };
  }

  const expectedCheckoutDate =
    row.expectedCheckoutDate != null
      ? formatDate(parseDate(String(row.expectedCheckoutDate)))
      : row.stayUpper && row.stayUpper !== 'infinity'
        ? formatDate(parseDate(row.stayUpper.slice(0, 10)))
        : null;

  const destinationAvailable = await isBedAvailable({
    bedId: dest.bedId,
    startDate: transferDate,
    endDate: expectedCheckoutDate,
  });

  let roomConfigNote: string | undefined;
  if (expectedCheckoutDate) {
    const effAtCheckout = await getRoomConfigurationEffectiveOn(dest.roomId, expectedCheckoutDate);
    if (effAtCheckout.fromSchedule && effAtCheckout.sharingCapacity < effAtCheckout.physicalBedCount) {
      roomConfigNote =
        `Room ${dest.roomNumber} has scheduled configuration from ${effAtCheckout.asOfDate}: ` +
        `${effAtCheckout.roomTypeName} (${effAtCheckout.sharingCapacity} beds). ` +
        `Occupied beds are not archived on apply; checkout ${expectedCheckoutDate} remains valid.`;
    }
  }

  const stayRangeAfter = expectedCheckoutDate
    ? `[${transferDate},${expectedCheckoutDate})`
    : `[${transferDate},)`;

  return {
    bookingId: row.bookingId,
    bookingCode: row.bookingCode,
    customerName: row.customerName,
    fromBedId: row.fromBedId,
    fromRoomNumber: row.fromRoomNumber,
    fromBedCode: row.fromBedCode,
    toBedId: dest.bedId,
    toRoomNumber: dest.roomNumber,
    toBedCode: dest.bedCode,
    transferDate,
    stayRangeAfter,
    expectedCheckoutDate,
    preservePricingSnapshot: input.preservePricingSnapshot ?? true,
    destinationAvailable,
    roomConfigNote,
  };
}

export async function executeAdminBookingBedTransfer(
  input: AdminBookingBedTransferInput,
): Promise<
  | { ok: true; plan: AdminBookingBedTransferPlan; fromBedId: string; pgId: string }
  | { ok: false; message: string; plan?: AdminBookingBedTransferPlan }
> {
  const planned = await planAdminBookingBedTransfer(input);
  if ('ok' in planned && planned.ok === false) {
    return planned;
  }
  const plan = planned as AdminBookingBedTransferPlan;

  if (!plan.destinationAvailable) {
    return { ok: false, message: 'Destination bed is not available for this stay window.', plan };
  }

  if (input.dryRun) {
    return { ok: true, plan, fromBedId: plan.fromBedId, pgId: '' };
  }

  const moved = await applyResidentBedTransfer({
    bookingId: plan.bookingId,
    toBedId: plan.toBedId,
    transferDate: plan.transferDate,
    actorType: 'admin',
    actorId: input.actorId,
    preservePricingSnapshot: plan.preservePricingSnapshot,
  });

  if (!moved.ok) {
    return { ok: false, message: moved.message, plan };
  }

  return { ok: true, plan, fromBedId: moved.fromBedId, pgId: moved.pgId };
}
