/**
 * Batch fetch bed occupancy facts and aggregate via the SSOT engine.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  bedReserveHolds,
  beds,
  bookings,
  electricityInvoices,
  floors,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { bedOccupiedTodayExistsSql } from '@/src/lib/occupancySsot';
import {
  aggregateOccupancyCounts,
  rawFactsToInput,
  resolveBedOccupancy,
  type OccupancyAggregateCounts,
  type RawBedOccupancyFacts,
  type ResolvedBedOccupancy,
} from '@/src/lib/bedOccupancyResolve';
import { todayString } from '@/src/lib/dates';

export type BedOccupancyBatchRow = RawBedOccupancyFacts & {
  pgId?: string;
  roomId?: string;
  floorId?: string;
};

type FetchFilter = {
  pgIds?: string[];
  pgId?: string;
  roomId?: string;
  roomIds?: string[];
  bedId?: string;
  asOfDate?: string;
};

export async function fetchBedOccupancyRows(
  filter: FetchFilter = {},
): Promise<BedOccupancyBatchRow[]> {
  const refDate = filter.asOfDate ?? todayString();
  const conditions = [isNull(beds.archivedAt)];

  if (filter.pgId) {
    conditions.push(eq(floors.pgId, filter.pgId));
  }
  if (filter.pgIds && filter.pgIds.length > 0) {
    conditions.push(inArray(floors.pgId, filter.pgIds));
  }
  if (filter.roomId) {
    conditions.push(eq(beds.roomId, filter.roomId));
  }
  if (filter.roomIds && filter.roomIds.length > 0) {
    conditions.push(inArray(beds.roomId, filter.roomIds));
  }
  if (filter.bedId) {
    conditions.push(eq(beds.id, filter.bedId));
  }

  const rows = await db
    .select({
      bedId: beds.id,
      pgId: floors.pgId,
      roomId: beds.roomId,
      floorId: floors.id,
      bedStatus: beds.status,
      manualOccupied: beds.manualOccupied,
      isOccupiedToday: sql<boolean>`(${bedOccupiedTodayExistsSql})`,
      stayType: sql<string | null>`(
        SELECT bk.stay_type::text
        FROM ${bedReservations} br
        INNER JOIN ${bookings} bk ON bk.id = br.booking_id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND ${refDate}::date <@ br.stay_range
        LIMIT 1
      )`,
      durationMode: sql<string | null>`(
        SELECT bk.duration_mode::text
        FROM ${bedReservations} br
        INNER JOIN ${bookings} bk ON bk.id = br.booking_id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND ${refDate}::date <@ br.stay_range
        LIMIT 1
      )`,
      expectedCheckoutDate: sql<string | null>`(
        SELECT bk.expected_checkout_date::text
        FROM ${bedReservations} br
        INNER JOIN ${bookings} bk ON bk.id = br.booking_id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND ${refDate}::date <@ br.stay_range
        LIMIT 1
      )`,
      stayUpper: sql<string | null>`(
        SELECT to_char(sub.d, 'YYYY-MM-DD')
        FROM (
          SELECT max(upper(br.stay_range)) AS d
          FROM ${bedReservations} br
          WHERE br.bed_id = beds.id
            AND br.status = 'active'
            AND lower(br.stay_range) <= ${refDate}::date
            AND upper(br.stay_range) > ${refDate}::date
        ) sub
        WHERE sub.d IS NOT NULL AND sub.d < '2090-01-01'::date
      )`,
      vacatingDate: sql<string | null>`(
        SELECT vr.vacating_date::text
        FROM ${bedReservations} br
        INNER JOIN ${bookings} bk ON bk.id = br.booking_id
        INNER JOIN ${vacatingRequests} vr ON vr.booking_id = bk.id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND ${refDate}::date <@ br.stay_range
          AND vr.status IN ('pending', 'approved')
        LIMIT 1
      )`,
      vacatingStatus: sql<'pending' | 'approved' | null>`(
        SELECT vr.status
        FROM ${bedReservations} br
        INNER JOIN ${bookings} bk ON bk.id = br.booking_id
        INNER JOIN ${vacatingRequests} vr ON vr.booking_id = bk.id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND ${refDate}::date <@ br.stay_range
          AND vr.status IN ('pending', 'approved')
        LIMIT 1
      )`,
      reservedFrom: sql<string | null>`(
        SELECT lower(br.stay_range)::text
        FROM ${bedReservations} br
        INNER JOIN ${bookings} bk ON bk.id = br.booking_id
        WHERE br.bed_id = beds.id
          AND br.status = 'active'
          AND bk.status = 'confirmed'
          AND lower(br.stay_range) > ${refDate}::date
        LIMIT 1
      )`,
      activeBedReserveCheckIn: sql<string | null>`(
        coalesce(
          (
            SELECT brh.check_in_date::text
            FROM ${bedReserveHolds} brh
            WHERE brh.bed_id = beds.id
              AND brh.status = 'active'
              AND brh.reserve_start <= ${refDate}::date
              AND brh.check_in_date >= ${refDate}::date
            LIMIT 1
          ),
          CASE
            WHEN beds.manual_reserved_check_in IS NOT NULL
              AND beds.manual_reserved_start <= ${refDate}::date
              AND beds.manual_reserved_check_in >= ${refDate}::date
            THEN beds.manual_reserved_check_in::text
            ELSE NULL
          END
        )
      )`,
      checkoutSettlementId: sql<string | null>`(
        SELECT cs.id::text
        FROM checkout_settlements cs
        INNER JOIN ${bedReservations} br ON br.booking_id = cs.booking_id
          AND br.bed_id = beds.id
          AND br.kind = 'primary'
        WHERE cs.status IN (
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending'
        )
        ORDER BY cs.created_at DESC
        LIMIT 1
      )`,
      checkoutSettlementStatus: sql<string | null>`(
        SELECT cs.status::text
        FROM checkout_settlements cs
        INNER JOIN ${bedReservations} br ON br.booking_id = cs.booking_id
          AND br.bed_id = beds.id
          AND br.kind = 'primary'
        WHERE cs.status IN (
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending'
        )
        ORDER BY cs.created_at DESC
        LIMIT 1
      )`,
      checkoutSettlementSuppressed: sql<boolean | null>`(
        SELECT vr.checkout_settlement_suppressed
        FROM checkout_settlements cs
        INNER JOIN ${bedReservations} br ON br.booking_id = cs.booking_id
          AND br.bed_id = beds.id
          AND br.kind = 'primary'
        LEFT JOIN ${vacatingRequests} vr ON vr.id = cs.vacating_request_id
        WHERE cs.status IN (
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending'
        )
        ORDER BY cs.created_at DESC
        LIMIT 1
      )`,
      checkoutDepositRequiredPaise: sql<number | null>`(
        SELECT cs.deposit_required_paise::bigint::int
        FROM checkout_settlements cs
        INNER JOIN ${bedReservations} br ON br.booking_id = cs.booking_id
          AND br.bed_id = beds.id
          AND br.kind = 'primary'
        WHERE cs.status IN (
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending'
        )
        ORDER BY cs.created_at DESC
        LIMIT 1
      )`,
      checkoutDepositHeldPaise: sql<number | null>`(
        SELECT coalesce((
          SELECT sum(dl.amount_paise)::bigint::int
          FROM deposit_ledger dl
          WHERE dl.booking_id = cs.booking_id
        ), 0)
        FROM checkout_settlements cs
        INNER JOIN ${bedReservations} br ON br.booking_id = cs.booking_id
          AND br.bed_id = beds.id
          AND br.kind = 'primary'
        WHERE cs.status IN (
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending'
        )
        ORDER BY cs.created_at DESC
        LIMIT 1
      )`,
      checkoutElectricityPending: sql<boolean | null>`(
        SELECT EXISTS (
          SELECT 1 FROM ${electricityInvoices} ei
          WHERE ei.booking_id = cs.booking_id AND ei.status = 'pending'
        )
        FROM checkout_settlements cs
        INNER JOIN ${bedReservations} br ON br.booking_id = cs.booking_id
          AND br.bed_id = beds.id
          AND br.kind = 'primary'
        WHERE cs.status IN (
          'awaiting_resident_details',
          'awaiting_admin_review',
          'approved',
          'refund_pending'
        )
        ORDER BY cs.created_at DESC
        LIMIT 1
      )`,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(and(...conditions));

  return rows.map((row) => ({
    bedId: row.bedId,
    pgId: row.pgId,
    roomId: row.roomId,
    floorId: row.floorId,
    bedStatus: row.bedStatus,
    asOfDate: refDate,
    isOccupiedToday: row.isOccupiedToday,
    manualOccupied: row.manualOccupied ?? false,
    stayType: row.stayType,
    durationMode: row.durationMode,
    expectedCheckoutDate: row.expectedCheckoutDate,
    stayUpper: row.stayUpper,
    vacatingDate: row.vacatingDate,
    vacatingStatus: row.vacatingStatus,
    reservedFrom: row.reservedFrom,
    activeBedReserveCheckIn: row.activeBedReserveCheckIn,
    checkoutSettlement:
      row.checkoutSettlementId && row.checkoutSettlementStatus
        ? {
            id: row.checkoutSettlementId,
            status: row.checkoutSettlementStatus,
            suppressed: Boolean(row.checkoutSettlementSuppressed),
            depositRequiredPaise: row.checkoutDepositRequiredPaise ?? 0,
            depositHeldPaise: row.checkoutDepositHeldPaise ?? 0,
            electricityPending: Boolean(row.checkoutElectricityPending),
          }
        : null,
  }));
}

export function resolveBedOccupancyRows(
  rows: BedOccupancyBatchRow[],
): ResolvedBedOccupancy[] {
  return rows.map((row) => resolveBedOccupancy(row));
}

export async function getOccupancyCountsByPg(
  pgIds: string[],
  asOfDate?: string,
): Promise<Map<string, OccupancyAggregateCounts>> {
  if (pgIds.length === 0) return new Map();
  const rows = await fetchBedOccupancyRows({ pgIds, asOfDate });
  const resolved = resolveBedOccupancyRows(rows);
  const byPg = new Map<string, ResolvedBedOccupancy[]>();
  for (let i = 0; i < rows.length; i += 1) {
    const pgId = rows[i].pgId;
    if (!pgId) continue;
    const list = byPg.get(pgId) ?? [];
    list.push(resolved[i]);
    byPg.set(pgId, list);
  }
  const out = new Map<string, OccupancyAggregateCounts>();
  for (const [pgId, list] of byPg) {
    out.set(pgId, aggregateOccupancyCounts(list));
  }
  return out;
}

export async function getOccupancyCountsByRoom(
  roomIds: string[],
  asOfDate?: string,
): Promise<Map<string, OccupancyAggregateCounts>> {
  if (roomIds.length === 0) return new Map();
  const rows = await fetchBedOccupancyRows({ roomIds, asOfDate });
  const resolved = resolveBedOccupancyRows(rows);
  const byRoom = new Map<string, ResolvedBedOccupancy[]>();
  for (let i = 0; i < rows.length; i += 1) {
    const roomId = rows[i].roomId;
    if (!roomId) continue;
    const list = byRoom.get(roomId) ?? [];
    list.push(resolved[i]);
    byRoom.set(roomId, list);
  }
  const out = new Map<string, OccupancyAggregateCounts>();
  for (const [roomId, list] of byRoom) {
    out.set(roomId, aggregateOccupancyCounts(list));
  }
  return out;
}

export async function getGlobalOccupancyCounts(
  asOfDate?: string,
): Promise<OccupancyAggregateCounts> {
  const rows = await fetchBedOccupancyRows({ asOfDate });
  return aggregateOccupancyCounts(resolveBedOccupancyRows(rows));
}

/** Map bedId → resolved occupancy for enriching per-bed API responses. */
export async function getResolvedOccupancyByBedId(
  filter: FetchFilter,
): Promise<Map<string, ResolvedBedOccupancy>> {
  const rows = await fetchBedOccupancyRows(filter);
  const resolved = resolveBedOccupancyRows(rows);
  const out = new Map<string, ResolvedBedOccupancy>();
  for (let i = 0; i < rows.length; i += 1) {
    out.set(rows[i].bedId, resolved[i]);
  }
  return out;
}
