/**
 * Checkout electricity — meter delta × rate, split by room monthly occupants.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, beds, bookings } from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { asPlainNumber } from '@/src/lib/format';

export type CheckoutElectricityCalc = {
  unitsConsumed: number;
  totalBillPaise: number;
  roomOccupants: number;
  sharePaise: number;
  ratePerUnitPaise: number;
};

export function calculateCheckoutElectricity(input: {
  previousReading: number;
  currentReading: number;
  ratePerUnitPaise: number;
  roomOccupants: number;
}): { ok: true; calc: CheckoutElectricityCalc } | { ok: false; error: string } {
  const previous = asPlainNumber(input.previousReading);
  const current = asPlainNumber(input.currentReading);
  const rate = asPlainNumber(input.ratePerUnitPaise);
  const occupants = Math.max(1, Math.floor(asPlainNumber(input.roomOccupants)));

  if (previous < 0 || current < 0) {
    return { ok: false, error: 'Meter readings cannot be negative.' };
  }
  if (current < previous) {
    return { ok: false, error: 'Current reading must be greater than or equal to previous reading.' };
  }
  if (rate <= 0) {
    return { ok: false, error: 'Rate per unit must be greater than zero.' };
  }

  const unitsConsumed = current - previous;
  const totalBillPaise = Math.round(unitsConsumed * rate);
  const sharePaise = Math.floor(totalBillPaise / occupants);

  return {
    ok: true,
    calc: {
      unitsConsumed,
      totalBillPaise,
      roomOccupants: occupants,
      sharePaise,
      ratePerUnitPaise: rate,
    },
  };
}

/** Active monthly/open-ended residents in the same room today (minimum 1). */
export async function resolveRoomMonthlyOccupantCount(bookingId: string): Promise<number> {
  const rows = await db.execute<{ occupant_count: number }>(sql`
    WITH ctx AS (
      SELECT bd.room_id
      FROM bookings b
      INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
      INNER JOIN beds bd ON bd.id = br.bed_id
      WHERE b.id = ${bookingId}::uuid
      LIMIT 1
    )
    SELECT count(DISTINCT b.id)::int AS occupant_count
    FROM ctx
    INNER JOIN beds bd ON bd.room_id = ctx.room_id
    INNER JOIN bed_reservations br ON br.bed_id = bd.id
    INNER JOIN bookings b ON b.id = br.booking_id
    WHERE br.status = 'active'
      AND b.status = 'confirmed'
      AND b.duration_mode IN ('monthly', 'open_ended')
      AND CURRENT_DATE <@ br.stay_range
  `);
  return Math.max(1, asPlainNumber(rows[0]?.occupant_count ?? 1));
}

export function defaultElectricityRatePaise(): number {
  return DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;
}

/** Resolve room id for a booking's primary bed. */
export async function bookingRoomId(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ roomId: beds.roomId })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')))
    .limit(1);
  return row?.roomId ?? null;
}
