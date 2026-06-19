/**
 * Single source of truth for active bed assignment (PG → room → bed).
 * Used by residents list, profile, search, and financial summaries.
 */

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import type { ResidencyStatus } from '@/src/db/schema/enums';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { occupancyReservationCoreSql_b, adminAssignedReservationSql_b } from '@/src/lib/occupancySsot';

/** Booking notes/snapshot markers — used by cleanup tools, not occupancy SSOT. */
export const isNotOccupancyPlaceholderBookingSql = sql`NOT (
  b.notes ILIKE '%occupancy placeholder%'
  OR b.notes ILIKE '%Full occupancy marker%'
  OR b.notes ILIKE '%full occupancy%'
  OR b.pricing_snapshot::text ILIKE '%Occupancy placeholder%'
)`;

/** @deprecated Use occupancyReservationCoreSql_b from occupancySsot.ts */
export const activeBedReservationWhereSql = occupancyReservationCoreSql_b;

/**
 * Optional active-bed context for a customer row (`c`).
 * LEFT JOIN LATERAL — never filters customers out.
 */
export const activeTenancyLateralSql = sql`
  LEFT JOIN LATERAL (
    SELECT
      b.id::text AS booking_id,
      b.booking_code AS booking_code,
      p.name AS pg_name,
      r.room_number,
      r.id::text AS room_id,
      bd.bed_code,
      bd.id::text AS bed_id,
      f.pg_id::text AS pg_id,
      coalesce((
        SELECT sum((elem->>'monthlyRatePaise')::bigint)
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
            THEN b.pricing_snapshot->'perBed'
            ELSE '[]'::jsonb
          END
        ) elem
      ), 0)::bigint AS monthly_rent_paise,
      b.deposit_paise,
      b.blocks_room_availability,
      to_char(lower(br.stay_range), 'YYYY-MM-DD') AS move_in_date,
      b.pricing_snapshot,
      EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.booking_id = b.id
          AND vr.status IN ('pending', 'approved')
      ) AS is_vacating
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = c.id
      AND ${adminAssignedReservationSql_b}
    ORDER BY
      (CURRENT_DATE <@ br.stay_range) DESC,
      lower(br.stay_range) DESC
    LIMIT 1
  ) t ON true
`;

export type ActiveTenancyDbRow = {
  booking_id: string;
  booking_code: string;
  pg_name: string;
  room_number: string;
  room_id: string;
  bed_code: string;
  bed_id: string;
  pg_id: string;
  monthly_rent_paise: number | null;
  deposit_paise: number;
  blocks_room_availability: boolean;
  move_in_date: string;
  pricing_snapshot: PricingSnapshot | null;
  is_vacating: boolean;
};

export type ActiveTenancy = {
  bookingId: string;
  bookingCode: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  roomId: string;
  bedId: string;
  bedCode: string;
  monthlyRentPaise: number;
  depositPaise: number;
  blocksRoomAvailability: boolean;
  moveInDate: string;
  isVacating: boolean;
};

function mapActiveTenancyRow(row: ActiveTenancyDbRow): ActiveTenancy {
  const snapshot = row.pricing_snapshot as PricingSnapshot | null;
  const monthlyFromSnapshot =
    snapshot?.perBed?.reduce((acc, b) => acc + (b.monthlyRatePaise ?? 0), 0) ?? 0;
  return {
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    roomId: row.room_id,
    bedId: row.bed_id,
    bedCode: row.bed_code,
    monthlyRentPaise: Number(row.monthly_rent_paise ?? monthlyFromSnapshot),
    depositPaise: Number(row.deposit_paise ?? 0),
    blocksRoomAvailability: row.blocks_room_availability,
    moveInDate: row.move_in_date,
    isVacating: row.is_vacating,
  };
}

/** Resolve the current active bed assignment for one customer. */
export async function getActiveTenancyForCustomer(
  customerId: string,
): Promise<ActiveTenancy | null> {
  const rows = await db.execute<ActiveTenancyDbRow>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code AS booking_code,
      p.name AS pg_name,
      r.room_number,
      r.id::text AS room_id,
      bd.bed_code,
      bd.id::text AS bed_id,
      f.pg_id::text AS pg_id,
      coalesce((
        SELECT sum((elem->>'monthlyRatePaise')::bigint)
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
            THEN b.pricing_snapshot->'perBed'
            ELSE '[]'::jsonb
          END
        ) elem
      ), 0)::bigint AS monthly_rent_paise,
      b.deposit_paise,
      b.blocks_room_availability,
      to_char(lower(br.stay_range), 'YYYY-MM-DD') AS move_in_date,
      b.pricing_snapshot,
      EXISTS (
        SELECT 1 FROM vacating_requests vr
        WHERE vr.booking_id = b.id
          AND vr.status IN ('pending', 'approved')
      ) AS is_vacating
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${customerId}::uuid
      AND ${adminAssignedReservationSql_b}
    ORDER BY
      (CURRENT_DATE <@ br.stay_range) DESC,
      lower(br.stay_range) DESC
    LIMIT 1
  `);
  const row = rows[0];
  return row ? mapActiveTenancyRow(row) : null;
}

export type ResidentTenancyStatus =
  | 'unassigned'
  | 'active'
  | 'vacating'
  | 'vacated'
  | 'blocked';

export function deriveTenancyStatus(input: {
  residencyStatus?: ResidencyStatus | null;
  activeTenancy: Pick<ActiveTenancy, 'bookingId' | 'isVacating'> | null;
}): ResidentTenancyStatus {
  if (input.residencyStatus === 'blocked') return 'blocked';
  if (input.activeTenancy) {
    if (input.activeTenancy.isVacating) return 'vacating';
    return 'active';
  }
  if (input.residencyStatus === 'vacated') return 'vacated';
  return 'unassigned';
}
